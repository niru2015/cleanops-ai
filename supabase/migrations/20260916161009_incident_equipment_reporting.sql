create type public.incident_state as enum ('reported', 'triaged', 'action_required', 'resolved', 'closed');
create type public.incident_action_state as enum ('recorded', 'open', 'completed');
create type public.equipment_report_state as enum ('reported', 'triaged', 'maintenance_requested', 'resolved');
create type public.client_report_state as enum ('draft', 'released');

create table public.incidents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null,
  zone_id uuid not null,
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 180),
  occurred_at timestamptz not null,
  reported_at timestamptz not null,
  summary text not null check (char_length(trim(summary)) between 1 and 1000),
  cause_status text not null default 'undetermined' check (cause_status = 'undetermined'),
  state public.incident_state not null default 'reported',
  reported_by_worker_id uuid,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, site_id, idempotency_key),
  unique (organization_id, site_id, id),
  foreign key (organization_id, site_id, zone_id)
    references public.site_zones (organization_id, site_id, id) on delete restrict,
  foreign key (organization_id, reported_by_worker_id)
    references public.workers (organization_id, id) on delete restrict,
  check (reported_at >= occurred_at)
);

create table public.incident_statements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null,
  incident_id uuid not null,
  worker_id uuid not null,
  statement_text text not null check (char_length(trim(statement_text)) between 1 and 2000),
  attributed_at timestamptz not null,
  recorded_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  unique (incident_id, worker_id, attributed_at),
  unique (organization_id, id),
  foreign key (organization_id, site_id, incident_id)
    references public.incidents (organization_id, site_id, id) on delete cascade,
  foreign key (organization_id, worker_id)
    references public.workers (organization_id, id) on delete restrict
);

create table public.incident_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null,
  incident_id uuid not null,
  evidence_id uuid not null,
  linked_by uuid not null references auth.users (id) on delete restrict,
  linked_at timestamptz not null default now(),
  unique (incident_id, evidence_id),
  unique (organization_id, id),
  foreign key (organization_id, site_id, incident_id)
    references public.incidents (organization_id, site_id, id) on delete cascade,
  foreign key (organization_id, evidence_id)
    references public.task_evidence (organization_id, id) on delete restrict
);

create table public.incident_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null,
  incident_id uuid not null,
  action_key text not null check (action_key ~ '^[a-z0-9_.-]{1,80}$'),
  note text not null check (char_length(trim(note)) between 1 and 1000),
  state public.incident_action_state not null default 'recorded',
  recorded_by uuid not null references auth.users (id) on delete restrict,
  recorded_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (incident_id, action_key),
  unique (organization_id, id),
  foreign key (organization_id, site_id, incident_id)
    references public.incidents (organization_id, site_id, id) on delete cascade
);

create table public.incident_timeline_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null,
  incident_id uuid not null,
  event_key text not null check (event_key ~ '^[a-z0-9_.-]{1,80}$'),
  event_type text not null check (event_type ~ '^[a-z0-9_.-]{1,80}$'),
  description text not null check (char_length(trim(description)) between 1 and 1000),
  occurred_at timestamptz not null,
  actor_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (incident_id, event_key),
  unique (organization_id, id),
  foreign key (organization_id, site_id, incident_id)
    references public.incidents (organization_id, site_id, id) on delete cascade
);

create table public.equipment_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null,
  zone_id uuid not null,
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 180),
  equipment_label text not null check (char_length(trim(equipment_label)) between 1 and 160),
  issue_description text not null check (char_length(trim(issue_description)) between 1 and 1000),
  state public.equipment_report_state not null default 'reported',
  reported_at timestamptz not null,
  reported_by_worker_id uuid,
  maintenance_reference text,
  resolved_at timestamptz,
  created_by uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, site_id, idempotency_key),
  unique (organization_id, site_id, id),
  foreign key (organization_id, site_id, zone_id)
    references public.site_zones (organization_id, site_id, id) on delete restrict,
  foreign key (organization_id, reported_by_worker_id)
    references public.workers (organization_id, id) on delete restrict,
  check (
    (state <> 'resolved' and resolved_at is null)
    or (state = 'resolved' and resolved_at is not null)
  )
);

create table public.sla_definitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null,
  name text not null check (char_length(trim(name)) between 2 and 160),
  version integer not null check (version > 0),
  window_start timestamptz not null,
  window_end timestamptz not null,
  numerator_rule text not null check (char_length(trim(numerator_rule)) between 2 and 500),
  denominator_rule text not null check (char_length(trim(denominator_rule)) between 2 and 500),
  exclusion_rule text not null check (char_length(trim(exclusion_rule)) between 2 and 500),
  created_at timestamptz not null default now(),
  unique (organization_id, site_id, name, version),
  unique (organization_id, site_id, id),
  foreign key (organization_id, site_id)
    references public.sites (organization_id, id) on delete cascade,
  check (window_end > window_start)
);

create table public.sla_task_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null,
  sla_definition_id uuid not null,
  task_run_id uuid not null,
  required boolean not null default true,
  approved_at timestamptz,
  contractual_exclusion_reason text check (
    contractual_exclusion_reason is null
    or char_length(trim(contractual_exclusion_reason)) between 2 and 500
  ),
  created_at timestamptz not null default now(),
  unique (sla_definition_id, task_run_id),
  unique (organization_id, id),
  foreign key (organization_id, site_id, sla_definition_id)
    references public.sla_definitions (organization_id, site_id, id) on delete cascade,
  foreign key (organization_id, site_id, task_run_id)
    references public.task_runs (organization_id, site_id, id) on delete cascade
);

create table public.client_service_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null,
  site_id uuid not null,
  sla_definition_id uuid not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  state public.client_report_state not null default 'draft',
  due_required_runs integer not null check (due_required_runs >= 0),
  approved_on_time_runs integer not null check (approved_on_time_runs >= 0),
  excluded_runs integer not null check (excluded_runs >= 0),
  completion_rate numeric(5,1) check (completion_rate is null or completion_rate between 0 and 100),
  incident_count integer not null check (incident_count >= 0),
  equipment_report_count integer not null check (equipment_report_count >= 0),
  incident_summary text not null check (char_length(trim(incident_summary)) between 2 and 1000),
  equipment_summary text not null check (char_length(trim(equipment_summary)) between 2 and 1000),
  safety_status text not null check (safety_status = 'not_applicable'),
  safety_explanation text not null check (char_length(trim(safety_explanation)) between 2 and 500),
  prepared_by uuid not null references auth.users (id) on delete restrict,
  prepared_at timestamptz not null default now(),
  released_by uuid references auth.users (id) on delete restrict,
  released_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sla_definition_id, window_start, window_end),
  unique (organization_id, site_id, id),
  foreign key (organization_id, client_id, site_id)
    references public.sites (organization_id, client_id, id) on delete cascade,
  foreign key (organization_id, site_id, sla_definition_id)
    references public.sla_definitions (organization_id, site_id, id) on delete restrict,
  check (window_end > window_start),
  check (approved_on_time_runs <= due_required_runs),
  check (
    (state = 'draft' and released_by is null and released_at is null)
    or (state = 'released' and released_by is not null and released_at is not null)
  )
);

create table public.client_report_releases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  client_id uuid not null,
  site_id uuid not null,
  report_id uuid not null,
  released_by uuid not null references auth.users (id) on delete restrict,
  released_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (report_id),
  unique (organization_id, id),
  foreign key (organization_id, site_id, report_id)
    references public.client_service_reports (organization_id, site_id, id) on delete cascade,
  foreign key (organization_id, client_id, site_id)
    references public.sites (organization_id, client_id, id) on delete cascade
);

create table public.reporting_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null,
  entity_type text not null check (entity_type in ('incident', 'client_report')),
  entity_id uuid not null,
  actor_user_id uuid not null references auth.users (id) on delete restrict,
  action text not null check (action ~ '^[a-z0-9_.-]{1,80}$'),
  reason text check (reason is null or char_length(trim(reason)) between 2 and 1000),
  changes jsonb not null default '{}'::jsonb check (jsonb_typeof(changes) = 'object'),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, site_id)
    references public.sites (organization_id, id) on delete cascade
);

create index incidents_site_time_idx on public.incidents (organization_id, site_id, occurred_at desc);
create index incident_timeline_idx on public.incident_timeline_events (incident_id, occurred_at);
create index equipment_reports_site_time_idx on public.equipment_reports (organization_id, site_id, reported_at desc);
create index sla_task_results_definition_idx on public.sla_task_results (sla_definition_id, required, approved_at);
create index client_service_reports_site_window_idx on public.client_service_reports (organization_id, site_id, window_end desc);
create index reporting_audit_entity_idx on public.reporting_audit_events (entity_type, entity_id, created_at);

create function private.resolve_client_report_viewer(
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
    join public.member_site_access as access
      on access.organization_id = membership.organization_id
     and access.membership_id = membership.id
    where membership.organization_id = p_organization_id
      and membership.user_id = v_actor
      and membership.role = 'client_viewer'
      and membership.state = 'active'
      and access.site_id = p_site_id
      and access.starts_at <= now()
      and (access.ends_at is null or access.ends_at > now())
  ) then
    raise exception using errcode = '42501', message = 'client_report_not_authorized';
  end if;
  return v_actor;
end;
$$;

create function public.record_incident(
  p_site_id uuid,
  p_zone_id uuid,
  p_reported_by_worker_id uuid,
  p_occurred_at timestamptz,
  p_reported_at timestamptz,
  p_summary text,
  p_statement_text text,
  p_action_note text,
  p_idempotency_key text,
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor uuid;
  v_incident_id uuid;
begin
  select site.organization_id into strict v_organization_id
  from public.sites as site where site.id = p_site_id;
  perform 1 from public.site_zones where organization_id = v_organization_id and site_id = p_site_id and id = p_zone_id;
  if not found then raise exception using errcode = '22023', message = 'incident_zone_mismatch'; end if;
  perform 1 from public.workers where organization_id = v_organization_id and id = p_reported_by_worker_id;
  if not found then raise exception using errcode = '22023', message = 'incident_worker_mismatch'; end if;
  v_actor := private.resolve_review_actor(v_organization_id, p_site_id, p_actor_user_id);

  insert into public.incidents (
    organization_id, site_id, zone_id, idempotency_key, occurred_at, reported_at,
    summary, reported_by_worker_id, created_by
  ) values (
    v_organization_id, p_site_id, p_zone_id, p_idempotency_key, p_occurred_at, p_reported_at,
    p_summary, p_reported_by_worker_id, v_actor
  )
  on conflict (organization_id, site_id, idempotency_key) do update
    set idempotency_key = excluded.idempotency_key
  returning id into v_incident_id;

  insert into public.incident_statements (
    organization_id, site_id, incident_id, worker_id, statement_text, attributed_at, recorded_by
  ) values (
    v_organization_id, p_site_id, v_incident_id, p_reported_by_worker_id,
    p_statement_text, p_reported_at, v_actor
  ) on conflict (incident_id, worker_id, attributed_at) do nothing;

  insert into public.incident_actions (
    organization_id, site_id, incident_id, action_key, note, recorded_by, recorded_at
  ) values (
    v_organization_id, p_site_id, v_incident_id, 'initial-area-check', p_action_note, v_actor, p_reported_at
  ) on conflict (incident_id, action_key) do nothing;

  insert into public.incident_timeline_events (
    organization_id, site_id, incident_id, event_key, event_type, description, occurred_at, actor_user_id
  ) values
    (v_organization_id, p_site_id, v_incident_id, 'reported', 'incident.reported', p_summary, p_occurred_at, v_actor),
    (v_organization_id, p_site_id, v_incident_id, 'statement-recorded', 'statement.attributed', 'Worker statement recorded as reported.', p_reported_at, v_actor),
    (v_organization_id, p_site_id, v_incident_id, 'action-recorded', 'action.recorded', p_action_note, p_reported_at, v_actor)
  on conflict (incident_id, event_key) do nothing;

  return v_incident_id;
exception
  when no_data_found then
    raise exception using errcode = 'P0002', message = 'incident_site_not_found';
end;
$$;

create function public.correct_incident_summary(
  p_incident_id uuid,
  p_corrected_summary text,
  p_reason text,
  p_actor_user_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_incident public.incidents%rowtype;
  v_actor uuid;
  v_previous text;
begin
  select * into strict v_incident from public.incidents where id = p_incident_id for update;
  v_actor := private.resolve_review_actor(v_incident.organization_id, v_incident.site_id, p_actor_user_id);
  v_previous := v_incident.summary;
  if v_previous = p_corrected_summary then return true; end if;

  update public.incidents set summary = p_corrected_summary, updated_at = now() where id = v_incident.id;
  insert into public.incident_timeline_events (
    organization_id, site_id, incident_id, event_key, event_type, description, occurred_at, actor_user_id
  ) values (
    v_incident.organization_id, v_incident.site_id, v_incident.id, 'wording-corrected',
    'incident.corrected', 'Supervisor clarified the report wording; cause remains undetermined.',
    v_incident.reported_at + interval '1 minute', v_actor
  ) on conflict (incident_id, event_key) do nothing;
  insert into public.reporting_audit_events (
    organization_id, site_id, entity_type, entity_id, actor_user_id, action, reason, changes
  ) values (
    v_incident.organization_id, v_incident.site_id, 'incident', v_incident.id, v_actor,
    'incident.corrected', p_reason, jsonb_build_object('previous_summary', v_previous, 'corrected_summary', p_corrected_summary)
  );
  return true;
exception
  when no_data_found then raise exception using errcode = 'P0002', message = 'incident_not_found';
end;
$$;

create function public.record_equipment_report(
  p_site_id uuid,
  p_zone_id uuid,
  p_reported_by_worker_id uuid,
  p_reported_at timestamptz,
  p_equipment_label text,
  p_issue_description text,
  p_idempotency_key text,
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_organization_id uuid;
  v_actor uuid;
  v_report_id uuid;
begin
  select site.organization_id into strict v_organization_id from public.sites as site where site.id = p_site_id;
  perform 1 from public.site_zones where organization_id = v_organization_id and site_id = p_site_id and id = p_zone_id;
  if not found then raise exception using errcode = '22023', message = 'equipment_zone_mismatch'; end if;
  perform 1 from public.workers where organization_id = v_organization_id and id = p_reported_by_worker_id;
  if not found then raise exception using errcode = '22023', message = 'equipment_worker_mismatch'; end if;
  v_actor := private.resolve_review_actor(v_organization_id, p_site_id, p_actor_user_id);
  insert into public.equipment_reports (
    organization_id, site_id, zone_id, idempotency_key, equipment_label,
    issue_description, reported_at, reported_by_worker_id, created_by
  ) values (
    v_organization_id, p_site_id, p_zone_id, p_idempotency_key, p_equipment_label,
    p_issue_description, p_reported_at, p_reported_by_worker_id, v_actor
  ) on conflict (organization_id, site_id, idempotency_key) do update
    set idempotency_key = excluded.idempotency_key
  returning id into v_report_id;
  return v_report_id;
exception
  when no_data_found then raise exception using errcode = 'P0002', message = 'equipment_site_not_found';
end;
$$;

create function public.prepare_client_service_report(
  p_sla_definition_id uuid,
  p_actor_user_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_definition public.sla_definitions%rowtype;
  v_client_id uuid;
  v_actor uuid;
  v_due integer;
  v_approved integer;
  v_excluded integer;
  v_incidents integer;
  v_equipment integer;
  v_rate numeric(5,1);
  v_report public.client_service_reports%rowtype;
begin
  select * into strict v_definition from public.sla_definitions where id = p_sla_definition_id;
  select client_id into strict v_client_id from public.sites where id = v_definition.site_id;
  v_actor := private.resolve_review_actor(v_definition.organization_id, v_definition.site_id, p_actor_user_id);

  select
    count(*) filter (where result.required and result.contractual_exclusion_reason is null),
    count(*) filter (where result.required and result.contractual_exclusion_reason is null and result.approved_at <= run.due_at),
    count(*) filter (where result.required and result.contractual_exclusion_reason is not null)
  into v_due, v_approved, v_excluded
  from public.sla_task_results as result
  join public.task_runs as run on run.id = result.task_run_id
  where result.sla_definition_id = v_definition.id
    and run.due_at > v_definition.window_start
    and run.due_at <= v_definition.window_end;

  v_rate := case when v_due = 0 then null else round((v_approved::numeric * 100) / v_due, 1) end;
  select count(*) into v_incidents from public.incidents
    where site_id = v_definition.site_id and occurred_at >= v_definition.window_start and occurred_at < v_definition.window_end;
  select count(*) into v_equipment from public.equipment_reports
    where site_id = v_definition.site_id and reported_at >= v_definition.window_start and reported_at < v_definition.window_end;

  select * into v_report from public.client_service_reports
    where sla_definition_id = v_definition.id and window_start = v_definition.window_start and window_end = v_definition.window_end
    for update;
  if found and v_report.state = 'released' then
    raise exception using errcode = '40001', message = 'released_report_is_final';
  end if;

  insert into public.client_service_reports (
    organization_id, client_id, site_id, sla_definition_id, window_start, window_end,
    due_required_runs, approved_on_time_runs, excluded_runs, completion_rate,
    incident_count, equipment_report_count, incident_summary, equipment_summary,
    safety_status, safety_explanation, prepared_by
  ) values (
    v_definition.organization_id, v_client_id, v_definition.site_id, v_definition.id,
    v_definition.window_start, v_definition.window_end, v_due, v_approved, v_excluded, v_rate,
    v_incidents, v_equipment,
    format('%s documented incident%s; details are redacted and no cause is asserted.', v_incidents, case when v_incidents = 1 then '' else 's' end),
    format('%s equipment issue%s recorded for operational follow-up; no maintenance completion is claimed.', v_equipment, case when v_equipment = 1 then '' else 's' end),
    'not_applicable', 'N/A — scheduled safety checks are not implemented in this prototype.', v_actor
  )
  on conflict (sla_definition_id, window_start, window_end) do update set
    due_required_runs = excluded.due_required_runs,
    approved_on_time_runs = excluded.approved_on_time_runs,
    excluded_runs = excluded.excluded_runs,
    completion_rate = excluded.completion_rate,
    incident_count = excluded.incident_count,
    equipment_report_count = excluded.equipment_report_count,
    incident_summary = excluded.incident_summary,
    equipment_summary = excluded.equipment_summary,
    safety_status = excluded.safety_status,
    safety_explanation = excluded.safety_explanation,
    prepared_by = excluded.prepared_by,
    prepared_at = now(),
    updated_at = now()
  returning * into v_report;

  return v_report.id;
exception
  when no_data_found then raise exception using errcode = 'P0002', message = 'sla_definition_not_found';
end;
$$;

create function public.release_client_service_report(
  p_report_id uuid,
  p_reason text,
  p_actor_user_id uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.client_service_reports%rowtype;
  v_actor uuid;
  v_released_at timestamptz := now();
begin
  select * into strict v_report from public.client_service_reports where id = p_report_id for update;
  v_actor := private.resolve_review_actor(v_report.organization_id, v_report.site_id, p_actor_user_id);
  if v_report.state = 'released' then return true; end if;

  update public.client_service_reports set
    state = 'released', released_by = v_actor, released_at = v_released_at, updated_at = v_released_at
  where id = v_report.id;
  insert into public.client_report_releases (
    organization_id, client_id, site_id, report_id, released_by, released_at
  ) values (
    v_report.organization_id, v_report.client_id, v_report.site_id, v_report.id, v_actor, v_released_at
  );
  insert into public.reporting_audit_events (
    organization_id, site_id, entity_type, entity_id, actor_user_id, action, reason, changes
  ) values (
    v_report.organization_id, v_report.site_id, 'client_report', v_report.id, v_actor,
    'report.released', p_reason, jsonb_build_object('state', 'released', 'released_at', v_released_at)
  );
  return true;
exception
  when no_data_found then raise exception using errcode = 'P0002', message = 'client_report_not_found';
end;
$$;

create function public.get_released_client_service_report(
  p_report_id uuid,
  p_actor_user_id uuid default null
)
returns table (
  report_id uuid,
  client_name text,
  site_name text,
  window_start timestamptz,
  window_end timestamptz,
  definition_name text,
  definition_version integer,
  numerator_rule text,
  denominator_rule text,
  exclusion_rule text,
  due_required_runs integer,
  approved_on_time_runs integer,
  excluded_runs integer,
  completion_rate numeric,
  incident_count integer,
  equipment_report_count integer,
  incident_summary text,
  equipment_summary text,
  safety_status text,
  safety_explanation text,
  released_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_report public.client_service_reports%rowtype;
begin
  select report.* into strict v_report
  from public.client_service_reports as report
  join public.client_report_releases as release on release.report_id = report.id
  where report.id = p_report_id and report.state = 'released';
  perform private.resolve_client_report_viewer(v_report.organization_id, v_report.site_id, p_actor_user_id);
  return query
  select report.id, client.name, site.name, report.window_start, report.window_end,
    definition.name, definition.version, definition.numerator_rule, definition.denominator_rule,
    definition.exclusion_rule, report.due_required_runs, report.approved_on_time_runs,
    report.excluded_runs, report.completion_rate, report.incident_count, report.equipment_report_count,
    report.incident_summary, report.equipment_summary, report.safety_status,
    report.safety_explanation, report.released_at
  from public.client_service_reports as report
  join public.clients as client on client.id = report.client_id
  join public.sites as site on site.id = report.site_id
  join public.sla_definitions as definition on definition.id = report.sla_definition_id
  where report.id = v_report.id;
exception
  when no_data_found then raise exception using errcode = 'P0002', message = 'released_client_report_not_found';
end;
$$;

alter table public.incidents enable row level security;
alter table public.incident_statements enable row level security;
alter table public.incident_evidence enable row level security;
alter table public.incident_actions enable row level security;
alter table public.incident_timeline_events enable row level security;
alter table public.equipment_reports enable row level security;
alter table public.sla_definitions enable row level security;
alter table public.sla_task_results enable row level security;
alter table public.client_service_reports enable row level security;
alter table public.client_report_releases enable row level security;
alter table public.reporting_audit_events enable row level security;

revoke all on table public.incidents, public.incident_statements, public.incident_evidence,
  public.incident_actions, public.incident_timeline_events, public.equipment_reports,
  public.sla_definitions, public.sla_task_results, public.client_service_reports,
  public.client_report_releases, public.reporting_audit_events from anon, authenticated;
grant select on table public.incidents, public.incident_statements, public.incident_evidence,
  public.incident_actions, public.incident_timeline_events, public.equipment_reports,
  public.sla_definitions, public.sla_task_results, public.client_service_reports,
  public.client_report_releases, public.reporting_audit_events to authenticated;
grant all on table public.incidents, public.incident_statements, public.incident_evidence,
  public.incident_actions, public.incident_timeline_events, public.equipment_reports,
  public.sla_definitions, public.sla_task_results, public.client_service_reports,
  public.client_report_releases, public.reporting_audit_events to service_role;

create policy incidents_select on public.incidents for select to authenticated
  using (private.can_manage_site(organization_id, site_id));
create policy incident_statements_select on public.incident_statements for select to authenticated
  using (private.can_manage_site(organization_id, site_id));
create policy incident_evidence_select on public.incident_evidence for select to authenticated
  using (private.can_manage_site(organization_id, site_id));
create policy incident_actions_select on public.incident_actions for select to authenticated
  using (private.can_manage_site(organization_id, site_id));
create policy incident_timeline_events_select on public.incident_timeline_events for select to authenticated
  using (private.can_manage_site(organization_id, site_id));
create policy equipment_reports_select on public.equipment_reports for select to authenticated
  using (private.can_manage_site(organization_id, site_id));
create policy sla_definitions_select on public.sla_definitions for select to authenticated
  using (private.can_manage_site(organization_id, site_id));
create policy sla_task_results_select on public.sla_task_results for select to authenticated
  using (private.can_manage_site(organization_id, site_id));
create policy client_service_reports_select on public.client_service_reports for select to authenticated
  using (
    private.can_manage_site(organization_id, site_id)
    or (
      state = 'released'
      and private.has_org_role(organization_id, array['client_viewer'::public.app_role])
      and private.has_site_access(organization_id, site_id)
    )
  );
create policy client_report_releases_select on public.client_report_releases for select to authenticated
  using (
    private.can_manage_site(organization_id, site_id)
    or (
      private.has_org_role(organization_id, array['client_viewer'::public.app_role])
      and private.has_site_access(organization_id, site_id)
    )
  );
create policy reporting_audit_events_select on public.reporting_audit_events for select to authenticated
  using (private.can_manage_site(organization_id, site_id));

revoke execute on function private.resolve_client_report_viewer(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.resolve_client_report_viewer(uuid, uuid, uuid)
  to service_role;
revoke execute on function public.record_incident(uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, text, uuid)
  from public, anon;
revoke execute on function public.correct_incident_summary(uuid, text, text, uuid)
  from public, anon;
revoke execute on function public.record_equipment_report(uuid, uuid, uuid, timestamptz, text, text, text, uuid)
  from public, anon;
revoke execute on function public.prepare_client_service_report(uuid, uuid)
  from public, anon;
revoke execute on function public.release_client_service_report(uuid, text, uuid)
  from public, anon;
revoke execute on function public.get_released_client_service_report(uuid, uuid)
  from public, anon;
grant execute on function public.record_incident(uuid, uuid, uuid, timestamptz, timestamptz, text, text, text, text, uuid),
  public.correct_incident_summary(uuid, text, text, uuid),
  public.record_equipment_report(uuid, uuid, uuid, timestamptz, text, text, text, uuid),
  public.prepare_client_service_report(uuid, uuid),
  public.release_client_service_report(uuid, text, uuid),
  public.get_released_client_service_report(uuid, uuid)
  to authenticated, service_role;
