alter type public.integration_provider add value if not exists 'whatsapp_cloud_api';

create type public.whatsapp_outbox_status as enum ('pending', 'processing', 'sent', 'delivered', 'read', 'failed');

create table public.whatsapp_outbox (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  integration_account_id uuid not null,
  recipient_id text not null check (recipient_id ~ '^[0-9]{6,20}$'),
  logical_key text not null check (char_length(logical_key) between 1 and 180),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  consent_reference text not null check (char_length(consent_reference) between 1 and 255),
  conversation_window_expires_at timestamptz,
  status public.whatsapp_outbox_status not null default 'pending',
  attempt_count smallint not null default 0 check (attempt_count between 0 and 5),
  next_attempt_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  provider_message_id text,
  last_error_code text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, logical_key),
  unique (integration_account_id, provider_message_id),
  unique (organization_id, id),
  foreign key (organization_id, integration_account_id)
    references public.integration_accounts (organization_id, id) on delete cascade,
  check ((status = 'processing' and lease_owner is not null and lease_expires_at is not null)
    or (status <> 'processing' and lease_owner is null and lease_expires_at is null))
);

create table public.whatsapp_delivery_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  integration_account_id uuid not null,
  outbox_id uuid,
  provider_message_id text not null check (char_length(provider_message_id) between 1 and 255),
  status text not null check (status in ('sent', 'delivered', 'read', 'failed')),
  occurred_at timestamptz not null,
  error_code text,
  created_at timestamptz not null default now(),
  unique (integration_account_id, provider_message_id, status, occurred_at),
  foreign key (organization_id, integration_account_id)
    references public.integration_accounts (organization_id, id) on delete cascade,
  foreign key (organization_id, outbox_id)
    references public.whatsapp_outbox (organization_id, id) on delete set null
);

create index whatsapp_outbox_ready_idx on public.whatsapp_outbox (next_attempt_at, created_at)
  where status = 'pending';
create index whatsapp_delivery_events_message_idx on public.whatsapp_delivery_events (integration_account_id, provider_message_id, occurred_at);

alter table public.whatsapp_outbox enable row level security;
alter table public.whatsapp_delivery_events enable row level security;
revoke all on table public.whatsapp_outbox, public.whatsapp_delivery_events from anon, authenticated;
grant all on table public.whatsapp_outbox, public.whatsapp_delivery_events to service_role;

create function public.accept_whatsapp_ingress_event(
  p_external_account_id text, p_dedupe_key text, p_payload jsonb, p_payload_sha256 text
)
returns table (event_id uuid, job_id uuid, duplicate boolean)
language plpgsql security invoker set search_path = '' as $$
declare
  v_account public.integration_accounts%rowtype;
  v_event_id uuid;
  v_job_id uuid;
  v_inserted boolean := false;
begin
  if p_dedupe_key is null or char_length(p_dedupe_key) not between 1 and 255
    or jsonb_typeof(p_payload) <> 'object'
    or p_payload_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_whatsapp_envelope';
  end if;
  select * into v_account from public.integration_accounts
    where provider = 'whatsapp_cloud_api' and external_account_id = p_external_account_id and enabled;
  if not found then raise exception using errcode = 'P0001', message = 'integration_account_not_found'; end if;

  insert into public.integration_webhook_events (
    organization_id, integration_account_id, dedupe_key, payload, payload_sha256
  ) values (v_account.organization_id, v_account.id, p_dedupe_key, p_payload, p_payload_sha256)
  on conflict (integration_account_id, dedupe_key) do nothing returning id into v_event_id;
  if v_event_id is null then
    select id into v_event_id from public.integration_webhook_events
      where integration_account_id = v_account.id and dedupe_key = p_dedupe_key;
  else v_inserted := true;
  end if;
  insert into public.processing_jobs (organization_id, integration_event_id, kind, dedupe_key)
    values (v_account.organization_id, v_event_id, 'normalize_external_messages', p_dedupe_key)
    on conflict (organization_id, kind, dedupe_key) do nothing returning id into v_job_id;
  if v_job_id is null then
    select id into v_job_id from public.processing_jobs
      where organization_id = v_account.organization_id and kind = 'normalize_external_messages' and dedupe_key = p_dedupe_key;
  end if;
  return query select v_event_id, v_job_id, not v_inserted;
end;
$$;

create function public.enqueue_whatsapp_reply(
  p_organization_id uuid, p_integration_account_id uuid, p_recipient_id text,
  p_logical_key text, p_payload jsonb, p_consent_reference text,
  p_conversation_window_expires_at timestamptz
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare v_id uuid; v_existing public.whatsapp_outbox%rowtype;
begin
  if p_recipient_id !~ '^[0-9]{6,20}$' or jsonb_typeof(p_payload) <> 'object'
    or p_consent_reference is null or char_length(p_consent_reference) not between 1 and 255
    or p_payload->>'type' not in ('text', 'template')
    or (p_payload->>'type' = 'text' and
      (p_conversation_window_expires_at is null or p_conversation_window_expires_at <= now()))
    or (p_payload->>'type' = 'template' and
      (char_length(coalesce(p_payload->>'templateName', '')) not between 1 and 512
       or coalesce(p_payload->>'templateName', '') !~ '^[a-z0-9_]+$'
       or coalesce(p_payload->>'languageCode', '') !~ '^[a-z]{2,3}(_[A-Z]{2})?$')) then
    raise exception using errcode = '22023', message = 'invalid_outbound_reply';
  end if;
  if not exists (
    select 1 from public.integration_accounts a
    where a.id = p_integration_account_id and a.organization_id = p_organization_id
      and a.provider = 'whatsapp_cloud_api' and a.enabled
  ) or not exists (
    select 1 from public.external_worker_identities i
    where i.organization_id = p_organization_id and i.integration_account_id = p_integration_account_id
      and i.external_sender_id = p_recipient_id and i.verified_at is not null
  ) then raise exception using errcode = '42501', message = 'outbound_recipient_not_authorized';
  end if;
  insert into public.whatsapp_outbox (
    organization_id, integration_account_id, recipient_id, logical_key, payload,
    consent_reference, conversation_window_expires_at
  ) values (
    p_organization_id, p_integration_account_id, p_recipient_id, p_logical_key, p_payload,
    p_consent_reference, p_conversation_window_expires_at
  )
    on conflict (organization_id, logical_key) do nothing
    returning id into v_id;
  if v_id is null then
    select outbox.* into strict v_existing from public.whatsapp_outbox as outbox
      where outbox.organization_id = p_organization_id and outbox.logical_key = p_logical_key;
    if v_existing.integration_account_id <> p_integration_account_id
      or v_existing.recipient_id <> p_recipient_id
      or v_existing.payload <> p_payload
      or v_existing.consent_reference <> p_consent_reference
      or v_existing.conversation_window_expires_at is distinct from p_conversation_window_expires_at then
      raise exception using errcode = 'P0001', message = 'outbox_identity_conflict';
    end if;
    v_id := v_existing.id;
  end if;
  return v_id;
end;
$$;

create function public.claim_whatsapp_reply(p_worker_id text, p_lease_seconds integer default 60)
returns table (outbox_id uuid, external_account_id text, recipient_id text, payload jsonb, attempt_count smallint)
language plpgsql security invoker set search_path = '' as $$
declare v_row public.whatsapp_outbox%rowtype; v_account text;
begin
  select outbox.* into v_row from public.whatsapp_outbox as outbox
    where ((outbox.status = 'pending' and outbox.next_attempt_at <= now())
      or (outbox.status = 'processing' and outbox.lease_expires_at <= now()))
      and outbox.attempt_count < 5
    order by outbox.next_attempt_at, outbox.created_at for update skip locked limit 1;
  if not found then return; end if;
  update public.whatsapp_outbox as outbox set status = 'processing', attempt_count = outbox.attempt_count + 1,
    lease_owner = p_worker_id, lease_expires_at = now() + make_interval(secs => p_lease_seconds), updated_at = now()
    where outbox.id = v_row.id returning outbox.* into v_row;
  select account.external_account_id into strict v_account
    from public.integration_accounts as account where account.id = v_row.integration_account_id;
  return query select v_row.id, v_account, v_row.recipient_id, v_row.payload, v_row.attempt_count;
end;
$$;

create function public.mark_whatsapp_reply_sent(p_outbox_id uuid, p_worker_id text, p_provider_message_id text)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.whatsapp_outbox set status = 'sent', provider_message_id = p_provider_message_id,
    sent_at = now(), lease_owner = null, lease_expires_at = null, last_error_code = null, updated_at = now()
  where id = p_outbox_id and status = 'processing' and lease_owner = p_worker_id and lease_expires_at > now();
  if not found then raise exception using errcode = 'P0001', message = 'outbox_not_owned'; end if;
  return true;
end;
$$;

create function public.fail_whatsapp_reply(p_outbox_id uuid, p_worker_id text, p_error_code text, p_retry_seconds integer default 30)
returns public.whatsapp_outbox_status language plpgsql security invoker set search_path = '' as $$
declare v_attempts smallint; v_status public.whatsapp_outbox_status;
begin
  select attempt_count into v_attempts from public.whatsapp_outbox
    where id = p_outbox_id and status = 'processing' and lease_owner = p_worker_id and lease_expires_at > now() for update;
  if not found then raise exception using errcode = 'P0001', message = 'outbox_not_owned'; end if;
  v_status := case when v_attempts >= 5 then 'failed' else 'pending' end;
  update public.whatsapp_outbox set status = v_status, next_attempt_at = now() + make_interval(secs => p_retry_seconds),
    lease_owner = null, lease_expires_at = null, last_error_code = p_error_code, updated_at = now() where id = p_outbox_id;
  return v_status;
end;
$$;

create function public.record_whatsapp_delivery_status(
  p_external_account_id text, p_provider_message_id text, p_status text,
  p_occurred_at timestamptz, p_error_code text default null
)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare v_account public.integration_accounts%rowtype; v_outbox public.whatsapp_outbox%rowtype;
begin
  select * into v_account from public.integration_accounts
    where provider = 'whatsapp_cloud_api' and external_account_id = p_external_account_id and enabled;
  if not found then raise exception using errcode = 'P0001', message = 'integration_account_not_found'; end if;
  select * into v_outbox from public.whatsapp_outbox
    where integration_account_id = v_account.id and provider_message_id = p_provider_message_id for update;
  insert into public.whatsapp_delivery_events (
    organization_id, integration_account_id, outbox_id, provider_message_id, status, occurred_at, error_code
  ) values (v_account.organization_id, v_account.id, v_outbox.id, p_provider_message_id, p_status, p_occurred_at, p_error_code)
  on conflict do nothing;
  if v_outbox.id is not null then
    update public.whatsapp_outbox set
      status = case
        when p_status = 'read' then 'read'::public.whatsapp_outbox_status
        when p_status = 'delivered' and status not in ('read') then 'delivered'::public.whatsapp_outbox_status
        when p_status = 'sent' and status = 'sent' then 'sent'::public.whatsapp_outbox_status
        when p_status = 'failed' and status not in ('delivered', 'read')
          then 'failed'::public.whatsapp_outbox_status else status end,
      delivered_at = case when p_status in ('delivered', 'read') then coalesce(delivered_at, p_occurred_at) else delivered_at end,
      read_at = case when p_status = 'read' then coalesce(read_at, p_occurred_at) else read_at end,
      last_error_code = case when p_status = 'failed' then p_error_code else last_error_code end,
      updated_at = now() where id = v_outbox.id;
  end if;
  return true;
end;
$$;

create function public.get_whatsapp_queue_health()
returns table (
  pending_count bigint,
  processing_count bigint,
  failed_count bigint,
  oldest_pending_at timestamptz
)
language sql security invoker set search_path = '' as $$
  select
    count(*) filter (where status = 'pending'),
    count(*) filter (where status = 'processing'),
    count(*) filter (where status = 'failed'),
    min(created_at) filter (where status = 'pending')
  from public.whatsapp_outbox;
$$;

create function public.begin_whatsapp_evidence_ingestion(
  p_external_account_id text, p_external_message_id text, p_media_external_id text,
  p_content_type text, p_byte_size bigint, p_sha256 text
)
returns table (
  evidence_id uuid, storage_path text,
  processing_status public.evidence_processing_status,
  linkage_status public.evidence_linkage_status, duplicate boolean
)
language plpgsql security invoker set search_path = '' as $$
declare
  v_account public.integration_accounts%rowtype;
  v_message public.external_messages%rowtype;
  v_evidence public.task_evidence%rowtype;
  v_evidence_id uuid := gen_random_uuid();
  v_extension text;
begin
  if p_content_type is not null and p_content_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception using errcode = '22023', message = 'invalid_content_type';
  end if;
  if p_byte_size is not null and p_byte_size not between 0 and 10485760 then
    raise exception using errcode = '22023', message = 'invalid_byte_size';
  end if;
  if p_sha256 is not null and p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_media_digest';
  end if;
  select account.* into v_account from public.integration_accounts as account
    where account.provider = 'whatsapp_cloud_api'
      and account.external_account_id = p_external_account_id and account.enabled;
  if not found then raise exception using errcode = 'P0001', message = 'integration_account_not_found'; end if;
  select message.* into v_message from public.external_messages as message
    where message.organization_id = v_account.organization_id
      and message.integration_account_id = v_account.id
      and message.external_message_id = p_external_message_id;
  if not found then raise exception using errcode = 'P0001', message = 'external_message_not_found'; end if;
  if not v_message.media_refs @> jsonb_build_array(jsonb_build_object('externalId', p_media_external_id)) then
    raise exception using errcode = 'P0001', message = 'media_reference_not_found';
  end if;
  v_extension := case p_content_type when 'image/jpeg' then 'jpg' when 'image/png' then 'png'
    when 'image/webp' then 'webp' else 'bin' end;
  insert into public.task_evidence (
    id, organization_id, integration_account_id, external_message_id, media_external_id,
    site_id, storage_path, content_type, byte_size, sha256, captured_at, received_at
  ) values (
    v_evidence_id, v_account.organization_id, v_account.id, v_message.id, p_media_external_id,
    v_account.site_id,
    v_account.organization_id::text || '/' || v_evidence_id::text || '/source.' || v_extension,
    p_content_type, p_byte_size, p_sha256, v_message.occurred_at, v_message.received_at
  ) on conflict (integration_account_id, external_message_id, media_external_id) do nothing
  returning * into v_evidence;
  if v_evidence.id is null then
    select evidence.* into strict v_evidence from public.task_evidence as evidence
      where evidence.integration_account_id = v_account.id
        and evidence.external_message_id = v_message.id
        and evidence.media_external_id = p_media_external_id;
    if p_sha256 is not null and v_evidence.sha256 is not null and p_sha256 <> v_evidence.sha256 then
      raise exception using errcode = 'P0001', message = 'media_identity_conflict';
    end if;
    return query select v_evidence.id, v_evidence.storage_path, v_evidence.processing_status,
      v_evidence.linkage_status, true;
    return;
  end if;
  insert into public.evidence_audit_events (organization_id, site_id, evidence_id, action, details)
    values (v_evidence.organization_id, v_evidence.site_id, v_evidence.id, 'evidence.staged',
      jsonb_build_object('media_external_id', p_media_external_id));
  return query select v_evidence.id, v_evidence.storage_path, v_evidence.processing_status,
    v_evidence.linkage_status, false;
end;
$$;

create function public.retry_whatsapp_evidence_ingestion(p_evidence_id uuid)
returns table (
  external_account_id text, external_message_id text, media_external_id text,
  declared_content_type text
)
language plpgsql security invoker set search_path = '' as $$
declare
  v_evidence public.task_evidence%rowtype;
  v_account public.integration_accounts%rowtype;
  v_message public.external_messages%rowtype;
begin
  select evidence.* into v_evidence from public.task_evidence as evidence
    join public.integration_accounts as account
      on account.organization_id = evidence.organization_id
     and account.id = evidence.integration_account_id
   where evidence.id = p_evidence_id
     and evidence.processing_status in ('missing', 'quarantined')
     and account.provider = 'whatsapp_cloud_api'
   for update of evidence;
  if not found then raise exception using errcode = 'P0001', message = 'evidence_not_retryable'; end if;
  select account.* into strict v_account from public.integration_accounts as account
    where account.id = v_evidence.integration_account_id;
  select message.* into strict v_message from public.external_messages as message
    where message.id = v_evidence.external_message_id;
  update public.task_evidence as evidence set processing_status = 'staged',
    resolution_code = null, updated_at = now() where evidence.id = v_evidence.id;
  insert into public.evidence_audit_events (organization_id, site_id, evidence_id, action)
    values (v_evidence.organization_id, v_evidence.site_id, v_evidence.id, 'evidence.retry_requested');
  return query select v_account.external_account_id, v_message.external_message_id,
    v_evidence.media_external_id, v_evidence.content_type;
end;
$$;

revoke execute on function public.accept_whatsapp_ingress_event(text, text, jsonb, text),
  public.enqueue_whatsapp_reply(uuid, uuid, text, text, jsonb, text, timestamptz),
  public.claim_whatsapp_reply(text, integer), public.mark_whatsapp_reply_sent(uuid, text, text),
  public.fail_whatsapp_reply(uuid, text, text, integer),
  public.record_whatsapp_delivery_status(text, text, text, timestamptz, text),
  public.get_whatsapp_queue_health(),
  public.begin_whatsapp_evidence_ingestion(text, text, text, text, bigint, text),
  public.retry_whatsapp_evidence_ingestion(uuid)
  from public, anon, authenticated;
grant execute on function public.accept_whatsapp_ingress_event(text, text, jsonb, text),
  public.enqueue_whatsapp_reply(uuid, uuid, text, text, jsonb, text, timestamptz),
  public.claim_whatsapp_reply(text, integer), public.mark_whatsapp_reply_sent(uuid, text, text),
  public.fail_whatsapp_reply(uuid, text, text, integer),
  public.record_whatsapp_delivery_status(text, text, text, timestamptz, text),
  public.get_whatsapp_queue_health(),
  public.begin_whatsapp_evidence_ingestion(text, text, text, text, bigint, text),
  public.retry_whatsapp_evidence_ingestion(uuid)
  to service_role;
