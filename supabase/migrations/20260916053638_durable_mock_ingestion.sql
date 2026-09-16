create type public.integration_provider as enum ('mock_legacy_whatsapp_group');
create type public.integration_event_status as enum ('pending', 'processed', 'failed');
create type public.processing_job_status as enum ('pending', 'processing', 'succeeded', 'failed');

create table public.integration_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  provider public.integration_provider not null,
  external_account_id text not null check (char_length(external_account_id) between 1 and 160),
  display_name text not null check (char_length(display_name) between 1 and 160),
  secret_reference text check (secret_reference is null or char_length(secret_reference) between 1 and 255),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, external_account_id),
  unique (organization_id, id)
);

create table public.integration_webhook_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  integration_account_id uuid not null,
  provider_event_id text,
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 255),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  status public.integration_event_status not null default 'pending',
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  last_error_code text check (last_error_code is null or last_error_code ~ '^[a-z0-9_.-]{1,64}$'),
  created_at timestamptz not null default now(),
  unique (integration_account_id, dedupe_key),
  unique (organization_id, id),
  foreign key (organization_id, integration_account_id)
    references public.integration_accounts (organization_id, id) on delete cascade
);

create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  integration_event_id uuid not null,
  kind text not null check (kind = 'normalize_external_messages'),
  dedupe_key text not null check (char_length(dedupe_key) between 1 and 255),
  status public.processing_job_status not null default 'pending',
  attempt_count smallint not null default 0 check (attempt_count >= 0),
  max_attempts smallint not null default 5 check (max_attempts between 1 and 20),
  next_attempt_at timestamptz not null default now(),
  lease_owner text check (lease_owner is null or char_length(lease_owner) between 1 and 120),
  lease_expires_at timestamptz,
  last_error_code text check (last_error_code is null or last_error_code ~ '^[a-z0-9_.-]{1,64}$'),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, kind, dedupe_key),
  unique (organization_id, id),
  foreign key (organization_id, integration_event_id)
    references public.integration_webhook_events (organization_id, id) on delete cascade,
  check (
    (status = 'processing' and lease_owner is not null and lease_expires_at is not null)
    or (status <> 'processing' and lease_owner is null and lease_expires_at is null)
  )
);

create table public.external_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  integration_account_id uuid not null,
  integration_event_id uuid not null,
  external_message_id text not null check (char_length(external_message_id) between 1 and 255),
  external_thread_id text not null check (char_length(external_thread_id) between 1 and 255),
  sender_id text not null check (char_length(sender_id) between 1 and 255),
  occurred_at timestamptz not null,
  received_at timestamptz not null,
  text_content text check (text_content is null or char_length(text_content) <= 8000),
  media_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(media_refs) = 'array'),
  schema_version smallint not null default 1 check (schema_version > 0),
  created_at timestamptz not null default now(),
  unique (integration_account_id, external_message_id),
  foreign key (organization_id, integration_account_id)
    references public.integration_accounts (organization_id, id) on delete cascade,
  foreign key (organization_id, integration_event_id)
    references public.integration_webhook_events (organization_id, id) on delete cascade
);

create index integration_accounts_organization_idx
  on public.integration_accounts (organization_id, enabled);
create index integration_webhook_events_account_received_idx
  on public.integration_webhook_events (integration_account_id, received_at desc);
create index processing_jobs_ready_idx
  on public.processing_jobs (next_attempt_at, created_at)
  where status = 'pending';
create index processing_jobs_expired_lease_idx
  on public.processing_jobs (lease_expires_at)
  where status = 'processing';
create index external_messages_tenant_received_idx
  on public.external_messages (organization_id, integration_account_id, received_at desc);

alter table public.integration_accounts enable row level security;
alter table public.integration_webhook_events enable row level security;
alter table public.processing_jobs enable row level security;
alter table public.external_messages enable row level security;

revoke all on table public.integration_accounts, public.integration_webhook_events,
  public.processing_jobs, public.external_messages from anon, authenticated;
grant all on table public.integration_accounts, public.integration_webhook_events,
  public.processing_jobs, public.external_messages to service_role;

create function public.accept_mock_ingress_event(
  p_external_account_id text,
  p_provider_event_id text,
  p_dedupe_key text,
  p_payload jsonb,
  p_payload_sha256 text
)
returns table (event_id uuid, job_id uuid, duplicate boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_account public.integration_accounts%rowtype;
  v_event_id uuid;
  v_job_id uuid;
  v_inserted boolean := false;
begin
  if p_external_account_id is null or char_length(p_external_account_id) not between 1 and 160 then
    raise exception using errcode = '22023', message = 'invalid_external_account_id';
  end if;
  if p_dedupe_key is null or char_length(p_dedupe_key) not between 1 and 255 then
    raise exception using errcode = '22023', message = 'invalid_dedupe_key';
  end if;
  if jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid_payload';
  end if;
  if p_payload_sha256 is null or p_payload_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_payload_digest';
  end if;

  select account.*
    into v_account
    from public.integration_accounts as account
   where account.provider = 'mock_legacy_whatsapp_group'
     and account.external_account_id = p_external_account_id
     and account.enabled;

  if not found then
    raise exception using errcode = 'P0001', message = 'integration_account_not_found';
  end if;

  insert into public.integration_webhook_events (
    organization_id,
    integration_account_id,
    provider_event_id,
    dedupe_key,
    payload,
    payload_sha256
  ) values (
    v_account.organization_id,
    v_account.id,
    nullif(p_provider_event_id, ''),
    p_dedupe_key,
    p_payload,
    p_payload_sha256
  )
  on conflict (integration_account_id, dedupe_key) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select event.id
      into v_event_id
      from public.integration_webhook_events as event
     where event.integration_account_id = v_account.id
       and event.dedupe_key = p_dedupe_key;
  else
    v_inserted := true;
  end if;

  insert into public.processing_jobs (
    organization_id,
    integration_event_id,
    kind,
    dedupe_key
  ) values (
    v_account.organization_id,
    v_event_id,
    'normalize_external_messages',
    p_dedupe_key
  )
  on conflict (organization_id, kind, dedupe_key) do nothing
  returning id into v_job_id;

  if v_job_id is null then
    select job.id
      into v_job_id
      from public.processing_jobs as job
     where job.organization_id = v_account.organization_id
       and job.kind = 'normalize_external_messages'
       and job.dedupe_key = p_dedupe_key;
  end if;

  return query select v_event_id, v_job_id, not v_inserted;
end;
$$;

create function public.claim_processing_job(
  p_worker_id text,
  p_lease_seconds integer default 60
)
returns table (
  job_id uuid,
  integration_event_id uuid,
  organization_id uuid,
  integration_account_id uuid,
  payload jsonb,
  attempt_count smallint,
  lease_expires_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job public.processing_jobs%rowtype;
  v_event public.integration_webhook_events%rowtype;
begin
  if p_worker_id is null or char_length(p_worker_id) not between 1 and 120 then
    raise exception using errcode = '22023', message = 'invalid_worker_id';
  end if;
  if p_lease_seconds not between 5 and 3600 then
    raise exception using errcode = '22023', message = 'invalid_lease_seconds';
  end if;

  with exhausted as (
    update public.processing_jobs as job
       set status = 'failed',
           lease_owner = null,
           lease_expires_at = null,
           last_error_code = 'attempts_exhausted',
           updated_at = now()
     where job.status = 'processing'
       and job.lease_expires_at <= now()
       and job.attempt_count >= job.max_attempts
     returning job.integration_event_id
  )
  update public.integration_webhook_events as event
     set status = 'failed',
         last_error_code = 'attempts_exhausted'
   where event.id in (select exhausted.integration_event_id from exhausted);

  select candidate.*
    into v_job
    from public.processing_jobs as candidate
   where (
       (candidate.status = 'pending' and candidate.next_attempt_at <= now())
       or (candidate.status = 'processing' and candidate.lease_expires_at <= now())
     )
     and candidate.attempt_count < candidate.max_attempts
   order by candidate.next_attempt_at, candidate.created_at, candidate.id
   for update skip locked
   limit 1;

  if not found then
    return;
  end if;

  update public.processing_jobs as job
     set status = 'processing',
         attempt_count = job.attempt_count + 1,
         lease_owner = p_worker_id,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         updated_at = now()
   where job.id = v_job.id
   returning job.* into v_job;

  select event.*
    into strict v_event
    from public.integration_webhook_events as event
   where event.id = v_job.integration_event_id;

  return query
  select
    v_job.id,
    v_event.id,
    v_job.organization_id,
    v_event.integration_account_id,
    v_event.payload,
    v_job.attempt_count,
    v_job.lease_expires_at;
end;
$$;

create function public.complete_processing_job(
  p_job_id uuid,
  p_worker_id text,
  p_messages jsonb
)
returns table (inserted_count integer, message_count integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job public.processing_jobs%rowtype;
  v_event public.integration_webhook_events%rowtype;
  v_message jsonb;
  v_inserted integer := 0;
  v_row_count integer;
  v_message_count integer;
  v_media_refs jsonb;
begin
  if jsonb_typeof(p_messages) <> 'array' or jsonb_array_length(p_messages) > 100 then
    raise exception using errcode = '22023', message = 'invalid_messages';
  end if;

  select job.*
    into v_job
    from public.processing_jobs as job
   where job.id = p_job_id
   for update;

  if not found
    or v_job.status <> 'processing'
    or v_job.lease_owner <> p_worker_id
    or v_job.lease_expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'job_not_owned';
  end if;

  select event.*
    into strict v_event
    from public.integration_webhook_events as event
   where event.id = v_job.integration_event_id;

  for v_message in select value from jsonb_array_elements(p_messages)
  loop
    if jsonb_typeof(v_message) <> 'object'
      or nullif(v_message ->> 'externalMessageId', '') is null
      or nullif(v_message ->> 'externalThreadId', '') is null
      or nullif(v_message ->> 'senderId', '') is null
      or nullif(v_message ->> 'occurredAt', '') is null then
      raise exception using errcode = '22023', message = 'invalid_message';
    end if;

    v_media_refs := coalesce(v_message -> 'mediaRefs', '[]'::jsonb);
    if jsonb_typeof(v_media_refs) <> 'array' then
      raise exception using errcode = '22023', message = 'invalid_media_refs';
    end if;

    insert into public.external_messages (
      organization_id,
      integration_account_id,
      integration_event_id,
      external_message_id,
      external_thread_id,
      sender_id,
      occurred_at,
      received_at,
      text_content,
      media_refs,
      schema_version
    ) values (
      v_job.organization_id,
      v_event.integration_account_id,
      v_event.id,
      v_message ->> 'externalMessageId',
      v_message ->> 'externalThreadId',
      v_message ->> 'senderId',
      (v_message ->> 'occurredAt')::timestamptz,
      v_event.received_at,
      nullif(v_message ->> 'text', ''),
      v_media_refs,
      coalesce((v_message ->> 'schemaVersion')::smallint, 1)
    )
    on conflict (integration_account_id, external_message_id) do nothing;

    get diagnostics v_row_count = row_count;
    v_inserted := v_inserted + v_row_count;
  end loop;

  v_message_count := jsonb_array_length(p_messages);

  update public.integration_webhook_events as event
     set status = 'processed',
         processed_at = now(),
         last_error_code = null
   where event.id = v_event.id;

  update public.processing_jobs as job
     set status = 'succeeded',
         lease_owner = null,
         lease_expires_at = null,
         last_error_code = null,
         completed_at = now(),
         updated_at = now()
   where job.id = v_job.id;

  return query select v_inserted, v_message_count;
end;
$$;

create function public.fail_processing_job(
  p_job_id uuid,
  p_worker_id text,
  p_error_code text,
  p_retry_delay_seconds integer default 30
)
returns public.processing_job_status
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_job public.processing_jobs%rowtype;
  v_status public.processing_job_status;
begin
  if p_error_code is null or p_error_code !~ '^[a-z0-9_.-]{1,64}$' then
    raise exception using errcode = '22023', message = 'invalid_error_code';
  end if;
  if p_retry_delay_seconds not between 1 and 3600 then
    raise exception using errcode = '22023', message = 'invalid_retry_delay';
  end if;

  select job.*
    into v_job
    from public.processing_jobs as job
   where job.id = p_job_id
   for update;

  if not found
    or v_job.status <> 'processing'
    or v_job.lease_owner <> p_worker_id
    or v_job.lease_expires_at <= now() then
    raise exception using errcode = 'P0001', message = 'job_not_owned';
  end if;

  v_status := case when v_job.attempt_count >= v_job.max_attempts then 'failed' else 'pending' end;

  update public.processing_jobs as job
     set status = v_status,
         next_attempt_at = case
           when v_status = 'pending' then now() + make_interval(secs => p_retry_delay_seconds)
           else job.next_attempt_at
         end,
         lease_owner = null,
         lease_expires_at = null,
         last_error_code = p_error_code,
         updated_at = now()
   where job.id = v_job.id;

  update public.integration_webhook_events as event
     set status = case
           when v_status = 'failed' then 'failed'::public.integration_event_status
           else 'pending'::public.integration_event_status
         end,
         last_error_code = p_error_code
   where event.id = v_job.integration_event_id;

  return v_status;
end;
$$;

create function public.retry_failed_processing_job(p_job_id uuid)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event_id uuid;
begin
  update public.processing_jobs as job
     set status = 'pending',
         attempt_count = 0,
         next_attempt_at = now(),
         lease_owner = null,
         lease_expires_at = null,
         last_error_code = null,
         completed_at = null,
         updated_at = now()
   where job.id = p_job_id
     and job.status = 'failed'
   returning job.integration_event_id into v_event_id;

  if v_event_id is null then
    return false;
  end if;

  update public.integration_webhook_events as event
     set status = 'pending',
         processed_at = null,
         last_error_code = null
   where event.id = v_event_id;

  return true;
end;
$$;

revoke execute on function public.accept_mock_ingress_event(text, text, text, jsonb, text)
  from public, anon, authenticated;
revoke execute on function public.claim_processing_job(text, integer)
  from public, anon, authenticated;
revoke execute on function public.complete_processing_job(uuid, text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.fail_processing_job(uuid, text, text, integer)
  from public, anon, authenticated;
revoke execute on function public.retry_failed_processing_job(uuid)
  from public, anon, authenticated;

grant execute on function public.accept_mock_ingress_event(text, text, text, jsonb, text)
  to service_role;
grant execute on function public.claim_processing_job(text, integer)
  to service_role;
grant execute on function public.complete_processing_job(uuid, text, jsonb)
  to service_role;
grant execute on function public.fail_processing_job(uuid, text, text, integer)
  to service_role;
grant execute on function public.retry_failed_processing_job(uuid)
  to service_role;
