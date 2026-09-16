create type public.quality_result_status as enum ('assessed', 'insufficient_evidence', 'failed');
create type public.finding_severity as enum ('low', 'medium', 'high');
create type public.corrective_action_state as enum ('open', 'submitted', 'closed');
create type public.inspection_outcome as enum ('correction_required', 'approved');

create table public.quality_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null,
  task_run_id uuid not null,
  submission_revision integer not null check (submission_revision > 0),
  evidence_pair_id uuid not null,
  request_key text not null check (char_length(request_key) between 1 and 180),
  service_name text not null check (service_name ~ '^[a-z0-9_.-]{1,64}$'),
  service_version text not null check (service_version ~ '^[a-z0-9_.-]{1,64}$'),
  schema_version text not null check (schema_version = 'quality.v1'),
  source_label text not null check (source_label in ('Mock AI', 'Manual review')),
  status public.quality_result_status not null,
  score numeric(5,2) check (score is null or score between 0 and 100),
  confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  observations jsonb not null default '[]'::jsonb check (jsonb_typeof(observations) = 'array'),
  limitations jsonb not null default '[]'::jsonb check (jsonb_typeof(limitations) = 'array'),
  error_code text check (error_code is null or error_code ~ '^[a-z0-9_.-]{1,64}$'),
  created_at timestamptz not null default now(),
  unique (organization_id, request_key),
  unique (organization_id, id),
  foreign key (organization_id, site_id, task_run_id)
    references public.task_runs (organization_id, site_id, id) on delete cascade,
  foreign key (organization_id, evidence_pair_id)
    references public.evidence_pairs (organization_id, id) on delete restrict,
  check (
    (status = 'assessed' and score is not null and error_code is null)
    or (status = 'insufficient_evidence' and score is null and error_code is null)
    or (status = 'failed' and score is null and error_code is not null)
  )
);

create table public.quality_findings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null,
  task_run_id uuid not null,
  submission_revision integer not null check (submission_revision > 0),
  quality_decision_id uuid not null,
  criterion_id text not null check (criterion_id ~ '^[a-z0-9_.-]{1,80}$'),
  observation text not null check (char_length(trim(observation)) between 1 and 1000),
  severity public.finding_severity not null,
  confirmed_by uuid not null references auth.users (id) on delete restrict,
  confirmed_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (quality_decision_id, criterion_id),
  unique (organization_id, id),
  foreign key (organization_id, site_id, task_run_id)
    references public.task_runs (organization_id, site_id, id) on delete cascade,
  foreign key (organization_id, quality_decision_id)
    references public.quality_decisions (organization_id, id) on delete restrict
);

create table public.corrective_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null,
  task_run_id uuid not null,
  finding_id uuid not null,
  source_revision integer not null check (source_revision > 0),
  target_revision integer check (target_revision is null or target_revision > source_revision),
  state public.corrective_action_state not null default 'open',
  instruction text not null check (char_length(trim(instruction)) between 1 and 1000),
  requested_by uuid not null references auth.users (id) on delete restrict,
  requested_at timestamptz not null default now(),
  submitted_at timestamptz,
  closed_at timestamptz,
  unique (finding_id),
  unique (organization_id, id),
  foreign key (organization_id, site_id, task_run_id)
    references public.task_runs (organization_id, site_id, id) on delete cascade,
  foreign key (organization_id, finding_id)
    references public.quality_findings (organization_id, id) on delete restrict,
  check (
    (state = 'open' and target_revision is null and submitted_at is null and closed_at is null)
    or (state = 'submitted' and target_revision is not null and submitted_at is not null and closed_at is null)
    or (state = 'closed' and target_revision is not null and submitted_at is not null and closed_at is not null)
  )
);

create table public.inspections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null,
  task_run_id uuid not null,
  submission_revision integer not null check (submission_revision > 0),
  quality_decision_id uuid,
  outcome public.inspection_outcome not null,
  reviewer_user_id uuid not null references auth.users (id) on delete restrict,
  reason text check (reason is null or char_length(trim(reason)) between 1 and 1000),
  created_at timestamptz not null default now(),
  unique (task_run_id, submission_revision, outcome),
  unique (organization_id, id),
  foreign key (organization_id, site_id, task_run_id)
    references public.task_runs (organization_id, site_id, id) on delete cascade,
  foreign key (organization_id, quality_decision_id)
    references public.quality_decisions (organization_id, id) on delete restrict
);

create table public.review_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null,
  task_run_id uuid not null,
  submission_revision integer not null check (submission_revision > 0),
  actor_user_id uuid references auth.users (id) on delete set null,
  action text not null check (action ~ '^[a-z0-9_.-]{1,80}$'),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, site_id, task_run_id)
    references public.task_runs (organization_id, site_id, id) on delete cascade
);

create index quality_decisions_task_idx
  on public.quality_decisions (task_run_id, submission_revision, created_at desc);
create index corrective_actions_task_idx
  on public.corrective_actions (task_run_id, state, requested_at);
create index review_audit_events_task_idx
  on public.review_audit_events (task_run_id, created_at);

create function private.resolve_review_actor(
  p_organization_id uuid,
  p_site_id uuid,
  p_supplied_actor_user_id uuid default null
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null and coalesce((select auth.jwt() ->> 'role'), '') = 'service_role' then
    v_actor := p_supplied_actor_user_id;
  end if;

  if v_actor is null or not exists (
    select 1
    from public.memberships as membership
    where membership.organization_id = p_organization_id
      and membership.user_id = v_actor
      and membership.state = 'active'
      and (
        membership.role in ('operations_manager', 'organization_administrator')
        or (
          membership.role in ('site_supervisor', 'area_manager')
          and exists (
            select 1
            from public.member_site_access as access
            where access.organization_id = membership.organization_id
              and access.membership_id = membership.id
              and access.site_id = p_site_id
              and access.starts_at <= now()
              and (access.ends_at is null or access.ends_at > now())
          )
        )
      )
  ) then
    raise exception using errcode = '42501', message = 'review_not_authorized';
  end if;

  return v_actor;
end;
$$;

revoke execute on function private.resolve_review_actor(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.resolve_review_actor(uuid, uuid, uuid)
  to authenticated, service_role;

create function public.record_quality_decision(
  p_task_run_id uuid,
  p_submission_revision integer,
  p_request_key text,
  p_service_name text,
  p_service_version text,
  p_source_label text,
  p_status public.quality_result_status,
  p_score numeric,
  p_confidence numeric,
  p_observations jsonb,
  p_limitations jsonb,
  p_error_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.task_runs%rowtype;
  v_pair public.evidence_pairs%rowtype;
  v_decision_id uuid;
begin
  select * into strict v_run
  from public.task_runs
  where id = p_task_run_id;

  if v_run.submission_revision <> p_submission_revision or v_run.state <> 'submitted' then
    raise exception using errcode = '40001', message = 'stale_submission';
  end if;

  select * into strict v_pair
  from public.evidence_pairs
  where task_run_id = v_run.id and submission_revision = p_submission_revision;

  if jsonb_typeof(p_observations) <> 'array' or jsonb_typeof(p_limitations) <> 'array' then
    raise exception using errcode = '22023', message = 'invalid_quality_payload';
  end if;

  insert into public.quality_decisions (
    organization_id, site_id, task_run_id, submission_revision, evidence_pair_id,
    request_key, service_name, service_version, schema_version, source_label,
    status, score, confidence, observations, limitations, error_code
  ) values (
    v_run.organization_id, v_run.site_id, v_run.id, p_submission_revision, v_pair.id,
    p_request_key, p_service_name, p_service_version, 'quality.v1', p_source_label,
    p_status, p_score, p_confidence, p_observations, p_limitations, p_error_code
  )
  on conflict (organization_id, request_key) do update
    set request_key = excluded.request_key
  returning id into v_decision_id;

  insert into public.review_audit_events (
    organization_id, site_id, task_run_id, submission_revision, action, details
  ) values (
    v_run.organization_id, v_run.site_id, v_run.id, p_submission_revision,
    case when p_status = 'failed' then 'quality.failed' else 'quality.recorded' end,
    jsonb_build_object('decision_id', v_decision_id, 'status', p_status, 'source_label', p_source_label)
  );

  return v_decision_id;
exception
  when no_data_found then
    raise exception using errcode = 'P0002', message = 'submission_not_found';
end;
$$;

create function public.confirm_quality_suggestion(
  p_decision_id uuid,
  p_expected_revision integer,
  p_criterion_id text,
  p_instruction text,
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_decision public.quality_decisions%rowtype;
  v_run public.task_runs%rowtype;
  v_actor uuid;
  v_observation jsonb;
  v_finding_id uuid;
  v_action_id uuid;
begin
  select * into strict v_decision from public.quality_decisions where id = p_decision_id;
  select * into strict v_run from public.task_runs where id = v_decision.task_run_id for update;
  v_actor := private.resolve_review_actor(v_run.organization_id, v_run.site_id, p_actor_user_id);

  if v_run.submission_revision <> p_expected_revision
    or v_decision.submission_revision <> p_expected_revision
    or v_run.state <> 'submitted'
    or v_decision.status <> 'assessed' then
    raise exception using errcode = '40001', message = 'stale_review';
  end if;

  select item into v_observation
  from jsonb_array_elements(v_decision.observations) as item
  where item ->> 'criterion_id' = p_criterion_id
  limit 1;
  if v_observation is null then
    raise exception using errcode = '22023', message = 'suggestion_not_found';
  end if;

  insert into public.quality_findings (
    organization_id, site_id, task_run_id, submission_revision, quality_decision_id,
    criterion_id, observation, severity, confirmed_by
  ) values (
    v_run.organization_id, v_run.site_id, v_run.id, p_expected_revision, v_decision.id,
    p_criterion_id, v_observation ->> 'observation',
    (v_observation ->> 'severity')::public.finding_severity, v_actor
  )
  on conflict (quality_decision_id, criterion_id) do update
    set criterion_id = excluded.criterion_id
  returning id into v_finding_id;

  insert into public.corrective_actions (
    organization_id, site_id, task_run_id, finding_id, source_revision,
    instruction, requested_by
  ) values (
    v_run.organization_id, v_run.site_id, v_run.id, v_finding_id,
    p_expected_revision, p_instruction, v_actor
  )
  on conflict (finding_id) do update set instruction = public.corrective_actions.instruction
  returning id into v_action_id;

  insert into public.inspections (
    organization_id, site_id, task_run_id, submission_revision,
    quality_decision_id, outcome, reviewer_user_id, reason
  ) values (
    v_run.organization_id, v_run.site_id, v_run.id, p_expected_revision,
    v_decision.id, 'correction_required', v_actor, p_instruction
  ) on conflict (task_run_id, submission_revision, outcome) do nothing;

  update public.task_runs
  set state = 'correction_required', updated_at = now()
  where id = v_run.id and submission_revision = p_expected_revision and state = 'submitted';

  insert into public.review_audit_events (
    organization_id, site_id, task_run_id, submission_revision, actor_user_id, action, details
  ) values (
    v_run.organization_id, v_run.site_id, v_run.id, p_expected_revision, v_actor,
    'finding.confirmed', jsonb_build_object('finding_id', v_finding_id, 'action_id', v_action_id)
  );
  return v_action_id;
exception
  when no_data_found then
    raise exception using errcode = 'P0002', message = 'review_not_found';
end;
$$;

create function public.dismiss_quality_suggestion(
  p_decision_id uuid,
  p_expected_revision integer,
  p_criterion_id text,
  p_reason text,
  p_actor_user_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_decision public.quality_decisions%rowtype;
  v_run public.task_runs%rowtype;
  v_actor uuid;
begin
  select * into strict v_decision from public.quality_decisions where id = p_decision_id;
  select * into strict v_run from public.task_runs where id = v_decision.task_run_id for update;
  v_actor := private.resolve_review_actor(v_run.organization_id, v_run.site_id, p_actor_user_id);
  if v_run.submission_revision <> p_expected_revision
    or v_decision.submission_revision <> p_expected_revision
    or v_run.state <> 'submitted' then
    raise exception using errcode = '40001', message = 'stale_review';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(v_decision.observations) as item
    where item ->> 'criterion_id' = p_criterion_id
  ) then
    raise exception using errcode = '22023', message = 'suggestion_not_found';
  end if;
  insert into public.review_audit_events (
    organization_id, site_id, task_run_id, submission_revision, actor_user_id, action, details
  ) values (
    v_run.organization_id, v_run.site_id, v_run.id, p_expected_revision, v_actor,
    'suggestion.dismissed', jsonb_build_object('criterion_id', p_criterion_id, 'reason', p_reason)
  );
  return true;
exception
  when no_data_found then
    raise exception using errcode = 'P0002', message = 'review_not_found';
end;
$$;

create function public.approve_submission(
  p_task_run_id uuid,
  p_expected_revision integer,
  p_decision_id uuid default null,
  p_reason text default null,
  p_actor_user_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.task_runs%rowtype;
  v_decision public.quality_decisions%rowtype;
  v_actor uuid;
begin
  select * into strict v_run from public.task_runs where id = p_task_run_id for update;
  v_actor := private.resolve_review_actor(v_run.organization_id, v_run.site_id, p_actor_user_id);
  if v_run.submission_revision <> p_expected_revision or v_run.state <> 'submitted' then
    raise exception using errcode = '40001', message = 'stale_review';
  end if;
  if not exists (
    select 1 from public.evidence_pairs
    where task_run_id = v_run.id and submission_revision = p_expected_revision
  ) then
    raise exception using errcode = '22023', message = 'evidence_pair_required';
  end if;
  if p_decision_id is not null then
    select * into strict v_decision from public.quality_decisions where id = p_decision_id;
    if v_decision.task_run_id <> v_run.id
      or v_decision.submission_revision <> p_expected_revision then
      raise exception using errcode = '40001', message = 'stale_quality_decision';
    end if;
    if v_decision.status <> 'assessed' and nullif(trim(coalesce(p_reason, '')), '') is null then
      raise exception using errcode = '22023', message = 'manual_review_reason_required';
    end if;
  elsif nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception using errcode = '22023', message = 'manual_review_reason_required';
  end if;

  insert into public.inspections (
    organization_id, site_id, task_run_id, submission_revision,
    quality_decision_id, outcome, reviewer_user_id, reason
  ) values (
    v_run.organization_id, v_run.site_id, v_run.id, p_expected_revision,
    p_decision_id, 'approved', v_actor, p_reason
  );

  update public.corrective_actions
  set state = 'closed', closed_at = now()
  where task_run_id = v_run.id
    and state = 'submitted'
    and target_revision = p_expected_revision;
  update public.quality_findings
  set resolved_at = now()
  where task_run_id = v_run.id
    and resolved_at is null
    and submission_revision < p_expected_revision;
  update public.task_runs
  set state = 'approved', updated_at = now()
  where id = v_run.id and submission_revision = p_expected_revision;
  insert into public.review_audit_events (
    organization_id, site_id, task_run_id, submission_revision, actor_user_id, action, details
  ) values (
    v_run.organization_id, v_run.site_id, v_run.id, p_expected_revision, v_actor,
    'submission.approved', jsonb_build_object('decision_id', p_decision_id, 'reason', p_reason)
  );
  return true;
exception
  when no_data_found then
    raise exception using errcode = 'P0002', message = 'review_not_found';
end;
$$;

create function private.mark_correction_submitted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.submission_revision > old.submission_revision then
    update public.corrective_actions
    set state = 'submitted', target_revision = new.submission_revision, submitted_at = now()
    where task_run_id = new.id and state = 'open';
    if found then
      insert into public.review_audit_events (
        organization_id, site_id, task_run_id, submission_revision, action, details
      ) values (
        new.organization_id, new.site_id, new.id, new.submission_revision,
        'correction.submitted', jsonb_build_object('previous_revision', old.submission_revision)
      );
    end if;
  end if;
  return new;
end;
$$;

create function private.protect_approved_submission()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.state = 'approved'
    and (new.state <> 'approved' or new.submission_revision <> old.submission_revision) then
    raise exception using errcode = '40001', message = 'approved_submission_is_final';
  end if;
  return new;
end;
$$;

create trigger protect_approved_submission_before_update
before update of state, submission_revision on public.task_runs
for each row execute function private.protect_approved_submission();

create trigger mark_correction_submitted_after_task_revision
after update of submission_revision on public.task_runs
for each row execute function private.mark_correction_submitted();

alter table public.quality_decisions enable row level security;
alter table public.quality_findings enable row level security;
alter table public.corrective_actions enable row level security;
alter table public.inspections enable row level security;
alter table public.review_audit_events enable row level security;

revoke all on table public.quality_decisions, public.quality_findings,
  public.corrective_actions, public.inspections, public.review_audit_events
  from anon, authenticated, service_role;
grant select on table public.quality_decisions, public.quality_findings,
  public.corrective_actions, public.inspections, public.review_audit_events
  to authenticated, service_role;

create policy quality_decisions_select on public.quality_decisions
  for select to authenticated using (private.can_manage_site(organization_id, site_id));
create policy quality_findings_select on public.quality_findings
  for select to authenticated using (private.can_manage_site(organization_id, site_id));
create policy corrective_actions_select on public.corrective_actions
  for select to authenticated using (private.can_manage_site(organization_id, site_id));
create policy inspections_select on public.inspections
  for select to authenticated using (private.can_manage_site(organization_id, site_id));
create policy review_audit_events_select on public.review_audit_events
  for select to authenticated using (private.can_manage_site(organization_id, site_id));

revoke execute on function public.record_quality_decision(
  uuid, integer, text, text, text, text, public.quality_result_status,
  numeric, numeric, jsonb, jsonb, text
) from public, anon, authenticated;
grant execute on function public.record_quality_decision(
  uuid, integer, text, text, text, text, public.quality_result_status,
  numeric, numeric, jsonb, jsonb, text
) to service_role;

revoke execute on function public.confirm_quality_suggestion(uuid, integer, text, text, uuid)
  from public, anon;
revoke execute on function public.dismiss_quality_suggestion(uuid, integer, text, text, uuid)
  from public, anon;
revoke execute on function public.approve_submission(uuid, integer, uuid, text, uuid)
  from public, anon;
grant execute on function public.confirm_quality_suggestion(uuid, integer, text, text, uuid)
  to authenticated, service_role;
grant execute on function public.dismiss_quality_suggestion(uuid, integer, text, text, uuid)
  to authenticated, service_role;
grant execute on function public.approve_submission(uuid, integer, uuid, text, uuid)
  to authenticated, service_role;
