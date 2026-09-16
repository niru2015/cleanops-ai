create type public.external_identity_state as enum ('verified', 'revoked');
create type public.conversation_context_state as enum ('active', 'switched', 'expired');
create type public.evidence_processing_status as enum ('staged', 'ready', 'quarantined', 'missing');
create type public.evidence_linkage_status as enum ('unresolved', 'linked', 'ignored');
create type public.evidence_role as enum ('before', 'after');

alter table public.integration_accounts
  add column site_id uuid,
  add foreign key (organization_id, site_id)
    references public.sites (organization_id, id) on delete restrict;

alter table public.external_messages
  add unique (organization_id, id);

alter table public.task_runs
  add unique (organization_id, site_id, id);

create table public.external_worker_identities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  integration_account_id uuid not null,
  external_sender_id text not null check (char_length(external_sender_id) between 1 and 255),
  worker_id uuid not null,
  state public.external_identity_state not null default 'verified',
  verified_at timestamptz not null,
  verified_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integration_account_id, external_sender_id),
  unique (organization_id, id),
  foreign key (organization_id, integration_account_id)
    references public.integration_accounts (organization_id, id) on delete cascade,
  foreign key (organization_id, worker_id)
    references public.workers (organization_id, id) on delete cascade
);

create table public.conversation_contexts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  integration_account_id uuid not null,
  external_thread_id text not null check (char_length(external_thread_id) between 1 and 255),
  external_sender_id text not null check (char_length(external_sender_id) between 1 and 255),
  assignment_id uuid not null,
  site_id uuid not null,
  zone_id uuid not null,
  task_run_id uuid,
  state public.conversation_context_state not null default 'active',
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > starts_at),
  check (expires_at <= starts_at + interval '30 minutes'),
  unique (organization_id, id),
  foreign key (organization_id, integration_account_id)
    references public.integration_accounts (organization_id, id) on delete cascade,
  foreign key (organization_id, site_id, assignment_id)
    references public.shift_assignments (organization_id, site_id, id) on delete cascade,
  foreign key (organization_id, site_id, zone_id)
    references public.site_zones (organization_id, site_id, id) on delete cascade,
  foreign key (organization_id, site_id, task_run_id)
    references public.task_runs (organization_id, site_id, id) on delete cascade
);

create table public.task_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  integration_account_id uuid not null,
  external_message_id uuid not null,
  media_external_id text not null check (char_length(media_external_id) between 1 and 255),
  worker_id uuid,
  site_id uuid,
  zone_id uuid,
  task_run_id uuid,
  role public.evidence_role,
  processing_status public.evidence_processing_status not null default 'staged',
  linkage_status public.evidence_linkage_status not null default 'unresolved',
  resolution_code text check (
    resolution_code is null or resolution_code ~ '^[a-z0-9_.-]{1,64}$'
  ),
  storage_path text not null unique check (char_length(storage_path) between 1 and 700),
  content_type text check (
    content_type is null or content_type in ('image/jpeg', 'image/png', 'image/webp')
  ),
  byte_size bigint check (byte_size is null or byte_size between 0 and 10485760),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz,
  received_at timestamptz not null,
  submission_revision integer check (submission_revision is null or submission_revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integration_account_id, external_message_id, media_external_id),
  unique (organization_id, id),
  foreign key (organization_id, integration_account_id)
    references public.integration_accounts (organization_id, id) on delete cascade,
  foreign key (organization_id, external_message_id)
    references public.external_messages (organization_id, id) on delete cascade,
  foreign key (organization_id, worker_id)
    references public.workers (organization_id, id) on delete restrict,
  foreign key (organization_id, site_id, zone_id)
    references public.site_zones (organization_id, site_id, id) on delete restrict,
  foreign key (organization_id, site_id, task_run_id)
    references public.task_runs (organization_id, site_id, id) on delete restrict,
  check (
    linkage_status <> 'linked'
    or (
      processing_status = 'ready'
      and worker_id is not null
      and site_id is not null
      and zone_id is not null
      and task_run_id is not null
      and role is not null
      and submission_revision is not null
      and sha256 is not null
    )
  )
);

create table public.evidence_pairs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  task_run_id uuid not null,
  submission_revision integer not null check (submission_revision > 0),
  before_evidence_id uuid not null,
  after_evidence_id uuid not null,
  created_at timestamptz not null default now(),
  unique (task_run_id, submission_revision),
  unique (after_evidence_id),
  unique (organization_id, id),
  foreign key (organization_id, site_id, task_run_id)
    references public.task_runs (organization_id, site_id, id) on delete cascade,
  foreign key (organization_id, before_evidence_id)
    references public.task_evidence (organization_id, id) on delete restrict,
  foreign key (organization_id, after_evidence_id)
    references public.task_evidence (organization_id, id) on delete restrict,
  check (before_evidence_id <> after_evidence_id)
);

create table public.evidence_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid,
  evidence_id uuid not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null check (action ~ '^[a-z0-9_.-]{1,64}$'),
  reason_code text check (reason_code is null or reason_code ~ '^[a-z0-9_.-]{1,64}$'),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, evidence_id)
    references public.task_evidence (organization_id, id) on delete cascade,
  foreign key (organization_id, site_id)
    references public.sites (organization_id, id) on delete restrict
);

create index external_worker_identities_worker_idx
  on public.external_worker_identities (organization_id, worker_id, state);
create index conversation_contexts_resolution_idx
  on public.conversation_contexts (
    integration_account_id, external_thread_id, external_sender_id, starts_at, expires_at
  ) where state = 'active';
create index task_evidence_unresolved_idx
  on public.task_evidence (organization_id, site_id, received_at)
  where linkage_status = 'unresolved';
create index task_evidence_staged_idx
  on public.task_evidence (created_at)
  where processing_status = 'staged';
create index task_evidence_task_revision_idx
  on public.task_evidence (task_run_id, submission_revision, role)
  where linkage_status = 'linked';
create unique index task_evidence_one_role_per_revision_uidx
  on public.task_evidence (task_run_id, submission_revision, role)
  where linkage_status = 'linked';
create index evidence_audit_events_evidence_idx
  on public.evidence_audit_events (evidence_id, created_at);

create function private.can_read_evidence(
  p_organization_id uuid,
  p_site_id uuid,
  p_worker_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_operate_org(p_organization_id)
    or (
      p_site_id is not null
      and private.can_manage_site(p_organization_id, p_site_id)
    )
    or (
      p_worker_id is not null
      and exists (
        select 1
        from public.workers as worker
        where worker.organization_id = p_organization_id
          and worker.id = p_worker_id
          and worker.auth_user_id = (select auth.uid())
      )
    );
$$;

revoke execute on function private.can_read_evidence(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.can_read_evidence(uuid, uuid, uuid)
  to authenticated, service_role;

create function public.begin_evidence_ingestion(
  p_external_account_id text,
  p_external_message_id text,
  p_media_external_id text,
  p_content_type text,
  p_byte_size bigint,
  p_sha256 text
)
returns table (
  evidence_id uuid,
  storage_path text,
  processing_status public.evidence_processing_status,
  linkage_status public.evidence_linkage_status,
  duplicate boolean
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_account public.integration_accounts%rowtype;
  v_message public.external_messages%rowtype;
  v_evidence public.task_evidence%rowtype;
  v_evidence_id uuid := gen_random_uuid();
  v_extension text;
begin
  if p_content_type is not null
    and p_content_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception using errcode = '22023', message = 'invalid_content_type';
  end if;
  if p_byte_size is not null and p_byte_size not between 0 and 10485760 then
    raise exception using errcode = '22023', message = 'invalid_byte_size';
  end if;
  if p_sha256 is not null and p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_media_digest';
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

  select message.*
    into v_message
    from public.external_messages as message
   where message.organization_id = v_account.organization_id
     and message.integration_account_id = v_account.id
     and message.external_message_id = p_external_message_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'external_message_not_found';
  end if;
  if not v_message.media_refs @> jsonb_build_array(
    jsonb_build_object('externalId', p_media_external_id)
  ) then
    raise exception using errcode = 'P0001', message = 'media_reference_not_found';
  end if;

  v_extension := case p_content_type
    when 'image/jpeg' then 'jpg'
    when 'image/png' then 'png'
    when 'image/webp' then 'webp'
    else 'bin'
  end;

  insert into public.task_evidence (
    id,
    organization_id,
    integration_account_id,
    external_message_id,
    media_external_id,
    site_id,
    storage_path,
    content_type,
    byte_size,
    sha256,
    captured_at,
    received_at
  ) values (
    v_evidence_id,
    v_account.organization_id,
    v_account.id,
    v_message.id,
    p_media_external_id,
    v_account.site_id,
    v_account.organization_id::text || '/' || v_evidence_id::text || '/source.' || v_extension,
    p_content_type,
    p_byte_size,
    p_sha256,
    v_message.occurred_at,
    v_message.received_at
  )
  on conflict (integration_account_id, external_message_id, media_external_id) do nothing
  returning * into v_evidence;

  if v_evidence.id is null then
    select evidence.*
      into strict v_evidence
      from public.task_evidence as evidence
     where evidence.integration_account_id = v_account.id
       and evidence.external_message_id = v_message.id
       and evidence.media_external_id = p_media_external_id;

    if p_sha256 is not null
      and v_evidence.sha256 is not null
      and p_sha256 <> v_evidence.sha256 then
      raise exception using errcode = 'P0001', message = 'media_identity_conflict';
    end if;

    return query select
      v_evidence.id,
      v_evidence.storage_path,
      v_evidence.processing_status,
      v_evidence.linkage_status,
      true;
    return;
  end if;

  insert into public.evidence_audit_events (
    organization_id, site_id, evidence_id, action, details
  ) values (
    v_evidence.organization_id,
    v_evidence.site_id,
    v_evidence.id,
    'evidence.staged',
    jsonb_build_object('media_external_id', p_media_external_id)
  );

  return query select
    v_evidence.id,
    v_evidence.storage_path,
    v_evidence.processing_status,
    v_evidence.linkage_status,
    false;
end;
$$;

create function public.mark_evidence_ingestion_problem(
  p_evidence_id uuid,
  p_status public.evidence_processing_status,
  p_error_code text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_evidence public.task_evidence%rowtype;
begin
  if p_status not in ('quarantined', 'missing') then
    raise exception using errcode = '22023', message = 'invalid_problem_status';
  end if;
  if p_error_code is null or p_error_code !~ '^[a-z0-9_.-]{1,64}$' then
    raise exception using errcode = '22023', message = 'invalid_error_code';
  end if;

  update public.task_evidence as evidence
     set processing_status = p_status,
         linkage_status = 'unresolved',
         resolution_code = p_error_code,
         updated_at = now()
   where evidence.id = p_evidence_id
     and evidence.processing_status = 'staged'
  returning evidence.* into v_evidence;

  if v_evidence.id is null then
    return false;
  end if;

  insert into public.evidence_audit_events (
    organization_id, site_id, evidence_id, action, reason_code
  ) values (
    v_evidence.organization_id,
    v_evidence.site_id,
    v_evidence.id,
    'evidence.processing_failed',
    p_error_code
  );
  return true;
end;
$$;

create function public.finalize_evidence_ingestion(
  p_evidence_id uuid,
  p_sha256 text,
  p_content_type text,
  p_byte_size bigint
)
returns table (
  evidence_id uuid,
  processing_status public.evidence_processing_status,
  linkage_status public.evidence_linkage_status,
  resolution_code text,
  task_run_id uuid,
  submission_revision integer,
  role public.evidence_role,
  pair_id uuid
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_evidence public.task_evidence%rowtype;
  v_message public.external_messages%rowtype;
  v_worker_id uuid;
  v_identity_count integer;
  v_context public.conversation_contexts%rowtype;
  v_context_count integer;
  v_task_run public.task_runs%rowtype;
  v_task_count integer;
  v_role public.evidence_role;
  v_before_id uuid;
  v_revision integer;
  v_pair_id uuid;
  v_reason text;
  v_has_before boolean;
  v_has_after boolean;
begin
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'invalid_media_digest';
  end if;
  if p_content_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception using errcode = '22023', message = 'invalid_content_type';
  end if;
  if p_byte_size not between 1 and 10485760 then
    raise exception using errcode = '22023', message = 'invalid_byte_size';
  end if;

  select evidence.*
    into v_evidence
    from public.task_evidence as evidence
   where evidence.id = p_evidence_id
   for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'evidence_not_found';
  end if;
  if v_evidence.processing_status = 'ready' then
    return query select
      v_evidence.id,
      v_evidence.processing_status,
      v_evidence.linkage_status,
      v_evidence.resolution_code,
      v_evidence.task_run_id,
      v_evidence.submission_revision,
      v_evidence.role,
      (select pair.id from public.evidence_pairs as pair
        where pair.after_evidence_id = v_evidence.id);
    return;
  end if;
  if v_evidence.processing_status <> 'staged' then
    raise exception using errcode = 'P0001', message = 'evidence_not_staged';
  end if;
  if (v_evidence.sha256 is not null and v_evidence.sha256 <> p_sha256)
    or (v_evidence.content_type is not null and v_evidence.content_type <> p_content_type)
    or (v_evidence.byte_size is not null and v_evidence.byte_size <> p_byte_size) then
    raise exception using errcode = 'P0001', message = 'media_integrity_mismatch';
  end if;

  select message.*
    into strict v_message
    from public.external_messages as message
   where message.id = v_evidence.external_message_id;

  v_has_before := coalesce(v_message.text_content, '') ~* '(^|[^[:alnum:]_])#before($|[^[:alnum:]_])';
  v_has_after := coalesce(v_message.text_content, '') ~* '(^|[^[:alnum:]_])#after($|[^[:alnum:]_])';
  if v_has_before and not v_has_after then
    v_role := 'before';
  elsif v_has_after and not v_has_before then
    v_role := 'after';
  elsif v_has_before and v_has_after then
    v_reason := 'role_conflict';
  else
    v_reason := 'role_missing';
  end if;

  if v_reason is null then
    select count(*)
      into v_identity_count
      from public.external_worker_identities as identity
     where identity.organization_id = v_evidence.organization_id
       and identity.integration_account_id = v_evidence.integration_account_id
       and identity.external_sender_id = v_message.sender_id
       and identity.state = 'verified';

    if v_identity_count = 0 then
      v_reason := 'unknown_sender';
    elsif v_identity_count > 1 then
      v_reason := 'identity_conflict';
    else
      select identity.worker_id
        into strict v_worker_id
        from public.external_worker_identities as identity
       where identity.organization_id = v_evidence.organization_id
         and identity.integration_account_id = v_evidence.integration_account_id
         and identity.external_sender_id = v_message.sender_id
         and identity.state = 'verified';
    end if;
  end if;

  if v_reason is null then
    select count(*)
      into v_context_count
      from public.conversation_contexts as context
      join public.shift_assignments as assignment
        on assignment.organization_id = context.organization_id
       and assignment.site_id = context.site_id
       and assignment.id = context.assignment_id
      join public.shifts as shift
        on shift.organization_id = assignment.organization_id
       and shift.site_id = assignment.site_id
       and shift.id = assignment.shift_id
      join public.worker_site_permissions as permission
        on permission.organization_id = assignment.organization_id
       and permission.site_id = assignment.site_id
       and permission.worker_id = assignment.worker_id
     where context.organization_id = v_evidence.organization_id
       and context.integration_account_id = v_evidence.integration_account_id
       and context.external_thread_id = v_message.external_thread_id
       and context.external_sender_id = v_message.sender_id
       and context.state = 'active'
       and context.starts_at <= v_message.occurred_at
       and context.expires_at > v_message.occurred_at
       and assignment.worker_id = v_worker_id
       and assignment.state in ('assigned', 'accepted')
       and shift.state in ('planned', 'active')
       and shift.starts_at <= v_message.occurred_at
       and shift.ends_at > v_message.occurred_at
       and permission.state = 'active'
       and permission.valid_from <= v_message.occurred_at
       and (permission.valid_until is null or permission.valid_until > v_message.occurred_at)
       and (v_evidence.site_id is null or context.site_id = v_evidence.site_id);

    if v_context_count = 0 then
      if exists (
        select 1
        from public.conversation_contexts as context
        where context.integration_account_id = v_evidence.integration_account_id
          and context.external_thread_id = v_message.external_thread_id
          and context.external_sender_id = v_message.sender_id
      ) then
        v_reason := 'context_stale';
      else
        v_reason := 'context_missing';
      end if;
    elsif v_context_count > 1 then
      v_reason := 'context_conflict';
    else
      select context.*
        into strict v_context
        from public.conversation_contexts as context
        join public.shift_assignments as assignment
          on assignment.organization_id = context.organization_id
         and assignment.site_id = context.site_id
         and assignment.id = context.assignment_id
        join public.shifts as shift
          on shift.organization_id = assignment.organization_id
         and shift.site_id = assignment.site_id
         and shift.id = assignment.shift_id
        join public.worker_site_permissions as permission
          on permission.organization_id = assignment.organization_id
         and permission.site_id = assignment.site_id
         and permission.worker_id = assignment.worker_id
       where context.organization_id = v_evidence.organization_id
         and context.integration_account_id = v_evidence.integration_account_id
         and context.external_thread_id = v_message.external_thread_id
         and context.external_sender_id = v_message.sender_id
         and context.state = 'active'
         and context.starts_at <= v_message.occurred_at
         and context.expires_at > v_message.occurred_at
         and assignment.worker_id = v_worker_id
         and assignment.state in ('assigned', 'accepted')
         and shift.state in ('planned', 'active')
         and shift.starts_at <= v_message.occurred_at
         and shift.ends_at > v_message.occurred_at
         and permission.state = 'active'
         and permission.valid_from <= v_message.occurred_at
         and (permission.valid_until is null or permission.valid_until > v_message.occurred_at)
         and (v_evidence.site_id is null or context.site_id = v_evidence.site_id);
    end if;
  end if;

  if v_reason is null then
    if v_context.task_run_id is not null then
      select run.*
        into v_task_run
        from public.task_runs as run
       where run.organization_id = v_evidence.organization_id
         and run.site_id = v_context.site_id
         and run.zone_id = v_context.zone_id
         and run.id = v_context.task_run_id
         and run.state not in ('completed', 'cancelled');
      if not found then
        v_reason := 'task_invalid';
      end if;
    else
      select count(*)
        into v_task_count
        from public.task_runs as run
       where run.organization_id = v_evidence.organization_id
         and run.site_id = v_context.site_id
         and run.zone_id = v_context.zone_id
         and run.scheduled_at <= v_message.occurred_at
         and run.due_at >= v_message.occurred_at
         and run.state not in ('completed', 'cancelled');

      if v_task_count = 0 then
        v_reason := 'task_missing';
      elsif v_task_count > 1 then
        v_reason := 'task_ambiguous';
      else
        select run.*
          into strict v_task_run
          from public.task_runs as run
         where run.organization_id = v_evidence.organization_id
           and run.site_id = v_context.site_id
           and run.zone_id = v_context.zone_id
           and run.scheduled_at <= v_message.occurred_at
           and run.due_at >= v_message.occurred_at
           and run.state not in ('completed', 'cancelled');
      end if;
    end if;
  end if;

  if v_reason is null and v_role = 'before' then
    v_revision := v_task_run.submission_revision + 1;
    if exists (
      select 1 from public.task_evidence as evidence
      where evidence.task_run_id = v_task_run.id
        and evidence.submission_revision = v_revision
        and evidence.role = 'before'
        and evidence.linkage_status = 'linked'
    ) then
      v_reason := 'before_ambiguous';
    end if;
  elsif v_reason is null and v_role = 'after' then
    v_revision := v_task_run.submission_revision + 1;
    select evidence.id
      into v_before_id
      from public.task_evidence as evidence
     where evidence.task_run_id = v_task_run.id
       and evidence.role = 'before'
       and evidence.processing_status = 'ready'
       and evidence.linkage_status = 'linked'
       and evidence.submission_revision <= v_revision
     order by evidence.submission_revision desc, evidence.created_at desc
     limit 1;

    if v_before_id is null then
      v_reason := 'before_missing';
    elsif exists (
      select 1 from public.task_evidence as evidence
      where evidence.task_run_id = v_task_run.id
        and evidence.submission_revision = v_revision
        and evidence.role = 'after'
        and evidence.linkage_status = 'linked'
    ) then
      v_reason := 'after_ambiguous';
    end if;
  end if;

  if v_reason is not null then
    update public.task_evidence as evidence
       set processing_status = 'ready',
           linkage_status = 'unresolved',
           resolution_code = v_reason,
           content_type = p_content_type,
           byte_size = p_byte_size,
           sha256 = p_sha256,
           role = v_role,
           worker_id = v_worker_id,
           site_id = coalesce(v_context.site_id, evidence.site_id),
           zone_id = v_context.zone_id,
           updated_at = now()
     where evidence.id = v_evidence.id
    returning evidence.* into v_evidence;

    insert into public.evidence_audit_events (
      organization_id, site_id, evidence_id, action, reason_code
    ) values (
      v_evidence.organization_id,
      v_evidence.site_id,
      v_evidence.id,
      'evidence.unresolved',
      v_reason
    );
  else
    update public.task_evidence as evidence
       set processing_status = 'ready',
           linkage_status = 'linked',
           resolution_code = null,
           content_type = p_content_type,
           byte_size = p_byte_size,
           sha256 = p_sha256,
           role = v_role,
           worker_id = v_worker_id,
           site_id = v_context.site_id,
           zone_id = v_context.zone_id,
           task_run_id = v_task_run.id,
           submission_revision = v_revision,
           updated_at = now()
     where evidence.id = v_evidence.id
    returning evidence.* into v_evidence;

    if v_role = 'before' then
      update public.task_runs as run
         set state = case when run.state in ('planned', 'ready') then 'in_progress' else run.state end,
             updated_at = now()
       where run.id = v_task_run.id;
    else
      insert into public.evidence_pairs (
        organization_id,
        site_id,
        task_run_id,
        submission_revision,
        before_evidence_id,
        after_evidence_id
      ) values (
        v_evidence.organization_id,
        v_evidence.site_id,
        v_task_run.id,
        v_revision,
        v_before_id,
        v_evidence.id
      )
      returning id into v_pair_id;

      update public.task_runs as run
         set state = 'submitted',
             submission_revision = v_revision,
             updated_at = now()
       where run.id = v_task_run.id;
    end if;

    insert into public.evidence_audit_events (
      organization_id, site_id, evidence_id, action, details
    ) values (
      v_evidence.organization_id,
      v_evidence.site_id,
      v_evidence.id,
      'evidence.auto_linked',
      jsonb_build_object('role', v_role, 'submission_revision', v_revision)
    );
  end if;

  return query select
    v_evidence.id,
    v_evidence.processing_status,
    v_evidence.linkage_status,
    v_evidence.resolution_code,
    v_evidence.task_run_id,
    v_evidence.submission_revision,
    v_evidence.role,
    v_pair_id;
end;
$$;

create function public.list_staged_evidence(p_limit integer default 20)
returns table (
  evidence_id uuid,
  storage_path text,
  sha256 text,
  content_type text,
  byte_size bigint
)
language sql
security invoker
set search_path = ''
as $$
  select evidence.id, evidence.storage_path, evidence.sha256,
         evidence.content_type, evidence.byte_size
  from public.task_evidence as evidence
  where evidence.processing_status = 'staged'
  order by evidence.created_at, evidence.id
  limit least(greatest(p_limit, 1), 100);
$$;

create function public.resolve_evidence_manually(
  p_evidence_id uuid,
  p_worker_id uuid,
  p_task_run_id uuid,
  p_role public.evidence_role,
  p_reason_code text,
  p_before_evidence_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_evidence public.task_evidence%rowtype;
  v_run public.task_runs%rowtype;
  v_before_id uuid;
  v_revision integer;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_reason_code is null or p_reason_code !~ '^[a-z0-9_.-]{1,64}$' then
    raise exception using errcode = '22023', message = 'invalid_reason_code';
  end if;

  select evidence.* into v_evidence
    from public.task_evidence as evidence
   where evidence.id = p_evidence_id
   for update;
  select run.* into v_run
    from public.task_runs as run
   where run.id = p_task_run_id
   for update;

  if v_evidence.id is null or v_run.id is null
    or v_evidence.organization_id <> v_run.organization_id
    or v_evidence.processing_status <> 'ready'
    or v_evidence.linkage_status <> 'unresolved'
    or not private.can_manage_site(v_run.organization_id, v_run.site_id)
    or (
      v_evidence.site_id is not null
      and not private.can_manage_site(v_evidence.organization_id, v_evidence.site_id)
    ) then
    raise exception using errcode = '42501', message = 'manual_resolution_denied';
  end if;
  if not exists (
    select 1 from public.worker_site_permissions as permission
    where permission.organization_id = v_run.organization_id
      and permission.site_id = v_run.site_id
      and permission.worker_id = p_worker_id
      and permission.state = 'active'
      and permission.valid_from <= v_evidence.captured_at
      and (permission.valid_until is null or permission.valid_until > v_evidence.captured_at)
  ) then
    raise exception using errcode = '42501', message = 'worker_not_authorized';
  end if;

  v_revision := v_run.submission_revision + 1;
  if p_role = 'after' then
    v_before_id := p_before_evidence_id;
    if v_before_id is null then
      select evidence.id into v_before_id
        from public.task_evidence as evidence
       where evidence.organization_id = v_run.organization_id
         and evidence.task_run_id = v_run.id
         and evidence.role = 'before'
         and evidence.processing_status = 'ready'
         and evidence.linkage_status = 'linked'
       order by evidence.submission_revision desc, evidence.created_at desc
       limit 1;
    end if;
    if v_before_id is null then
      raise exception using errcode = '22023', message = 'before_evidence_required';
    end if;
    if not exists (
      select 1
      from public.task_evidence as evidence
      where evidence.id = v_before_id
        and evidence.organization_id = v_run.organization_id
        and evidence.task_run_id = v_run.id
        and evidence.role = 'before'
        and evidence.processing_status = 'ready'
        and evidence.linkage_status = 'linked'
    ) then
      raise exception using errcode = '22023', message = 'before_evidence_invalid';
    end if;
  end if;

  update public.task_evidence as evidence
     set worker_id = p_worker_id,
         site_id = v_run.site_id,
         zone_id = v_run.zone_id,
         task_run_id = v_run.id,
         role = p_role,
         linkage_status = 'linked',
         resolution_code = null,
         submission_revision = v_revision,
         updated_at = now()
   where evidence.id = v_evidence.id;

  if p_role = 'before' then
    update public.task_runs as run
       set state = case when run.state in ('planned', 'ready') then 'in_progress' else run.state end,
           updated_at = now()
     where run.id = v_run.id;
  else
    insert into public.evidence_pairs (
      organization_id, site_id, task_run_id, submission_revision,
      before_evidence_id, after_evidence_id
    ) values (
      v_run.organization_id, v_run.site_id, v_run.id, v_revision,
      v_before_id, v_evidence.id
    );
    update public.task_runs as run
       set state = 'submitted', submission_revision = v_revision, updated_at = now()
     where run.id = v_run.id;
  end if;

  insert into public.evidence_audit_events (
    organization_id, site_id, evidence_id, actor_user_id, action, reason_code,
    details
  ) values (
    v_run.organization_id,
    v_run.site_id,
    v_evidence.id,
    (select auth.uid()),
    'evidence.manually_resolved',
    p_reason_code,
    jsonb_build_object('worker_id', p_worker_id, 'task_run_id', p_task_run_id, 'role', p_role)
  );
  return true;
end;
$$;

create function public.ignore_evidence(
  p_evidence_id uuid,
  p_reason_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_evidence public.task_evidence%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'authentication_required';
  end if;
  if p_reason_code is null or p_reason_code !~ '^[a-z0-9_.-]{1,64}$' then
    raise exception using errcode = '22023', message = 'invalid_reason_code';
  end if;

  select evidence.* into v_evidence
    from public.task_evidence as evidence
   where evidence.id = p_evidence_id
   for update;
  if v_evidence.id is null
    or v_evidence.linkage_status <> 'unresolved'
    or v_evidence.site_id is null
    or not private.can_manage_site(v_evidence.organization_id, v_evidence.site_id) then
    raise exception using errcode = '42501', message = 'ignore_evidence_denied';
  end if;

  update public.task_evidence as evidence
     set linkage_status = 'ignored',
         resolution_code = p_reason_code,
         updated_at = now()
   where evidence.id = v_evidence.id;
  insert into public.evidence_audit_events (
    organization_id, site_id, evidence_id, actor_user_id, action, reason_code
  ) values (
    v_evidence.organization_id,
    v_evidence.site_id,
    v_evidence.id,
    (select auth.uid()),
    'evidence.ignored',
    p_reason_code
  );
  return true;
end;
$$;

alter table public.external_worker_identities enable row level security;
alter table public.conversation_contexts enable row level security;
alter table public.task_evidence enable row level security;
alter table public.evidence_pairs enable row level security;
alter table public.evidence_audit_events enable row level security;

revoke all on table public.external_worker_identities, public.conversation_contexts,
  public.task_evidence, public.evidence_pairs, public.evidence_audit_events
  from anon, authenticated;
grant select on table public.external_worker_identities, public.conversation_contexts,
  public.task_evidence, public.evidence_pairs, public.evidence_audit_events
  to authenticated;
grant all on table public.external_worker_identities, public.conversation_contexts,
  public.task_evidence, public.evidence_pairs, public.evidence_audit_events
  to service_role;

create policy external_worker_identities_select
  on public.external_worker_identities for select to authenticated
  using (private.can_read_worker(organization_id, worker_id));
create policy conversation_contexts_select
  on public.conversation_contexts for select to authenticated
  using (
    private.can_manage_site(organization_id, site_id)
    or private.can_read_assignment(organization_id, site_id, assignment_id)
  );
create policy task_evidence_select
  on public.task_evidence for select to authenticated
  using (private.can_read_evidence(organization_id, site_id, worker_id));
create policy evidence_pairs_select
  on public.evidence_pairs for select to authenticated
  using (
    exists (
      select 1 from public.task_evidence as evidence
      where evidence.id = before_evidence_id
        and private.can_read_evidence(
          evidence.organization_id, evidence.site_id, evidence.worker_id
        )
    )
  );
create policy evidence_audit_events_select
  on public.evidence_audit_events for select to authenticated
  using (
    private.can_operate_org(organization_id)
    or (site_id is not null and private.can_manage_site(organization_id, site_id))
  );

create policy operational_evidence_objects_select
  on storage.objects for select to authenticated
  using (
    bucket_id = 'operational-evidence'
    and exists (
      select 1 from public.task_evidence as evidence
      where evidence.storage_path = name
        and evidence.processing_status = 'ready'
        and private.can_read_evidence(
          evidence.organization_id, evidence.site_id, evidence.worker_id
        )
    )
  );

revoke execute on function public.begin_evidence_ingestion(text, text, text, text, bigint, text)
  from public, anon, authenticated;
revoke execute on function public.mark_evidence_ingestion_problem(
  uuid, public.evidence_processing_status, text
) from public, anon, authenticated;
revoke execute on function public.finalize_evidence_ingestion(uuid, text, text, bigint)
  from public, anon, authenticated;
revoke execute on function public.list_staged_evidence(integer)
  from public, anon, authenticated;
revoke execute on function public.resolve_evidence_manually(
  uuid, uuid, uuid, public.evidence_role, text, uuid
) from public, anon;
revoke execute on function public.ignore_evidence(uuid, text)
  from public, anon;

grant execute on function public.begin_evidence_ingestion(text, text, text, text, bigint, text)
  to service_role;
grant execute on function public.mark_evidence_ingestion_problem(
  uuid, public.evidence_processing_status, text
) to service_role;
grant execute on function public.finalize_evidence_ingestion(uuid, text, text, bigint)
  to service_role;
grant execute on function public.list_staged_evidence(integer)
  to service_role;
grant execute on function public.resolve_evidence_manually(
  uuid, uuid, uuid, public.evidence_role, text, uuid
) to authenticated, service_role;
grant execute on function public.ignore_evidence(uuid, text)
  to authenticated, service_role;
