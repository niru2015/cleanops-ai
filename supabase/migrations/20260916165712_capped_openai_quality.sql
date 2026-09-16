alter table public.quality_decisions
  drop constraint quality_decisions_source_label_check,
  add constraint quality_decisions_source_label_check
    check (source_label in ('Mock AI', 'OpenAI AI', 'Manual review'));

create type public.quality_ai_run_status as enum ('reserved', 'completed', 'failed');

-- Each tenant opts in with a finite cap. A missing row is an explicit manual-review fallback.
create table public.quality_ai_budgets (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  live_enabled boolean not null default false,
  maximum_cents integer not null check (maximum_cents > 0),
  reserved_cents integer not null default 0 check (reserved_cents >= 0),
  spent_cents integer not null default 0 check (spent_cents >= 0),
  updated_at timestamptz not null default now(),
  check (reserved_cents + spent_cents <= maximum_cents)
);

create table public.quality_ai_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null,
  task_run_id uuid not null,
  submission_revision integer not null check (submission_revision > 0),
  evidence_pair_id uuid not null,
  cache_key text not null check (cache_key ~ '^[a-f0-9]{64}$'),
  status public.quality_ai_run_status not null default 'reserved',
  attempt_count integer not null default 1 check (attempt_count between 1 and 2),
  reserved_cents integer not null check (reserved_cents > 0),
  charged_cents integer check (charged_cents is null or charged_cents >= 0),
  provider text not null check (provider = 'openai'),
  model text not null check (char_length(model) between 1 and 128),
  prompt_version text not null check (prompt_version ~ '^[a-z0-9_.-]{1,64}$'),
  schema_version text not null check (schema_version = 'quality.v1'),
  provider_response_id text,
  provider_request_id text,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  provider_usage jsonb,
  cost_provenance text not null default 'configured_attempt_cap',
  provider_output jsonb,
  quality_decision_id uuid references public.quality_decisions (id) on delete restrict,
  error_code text check (error_code is null or error_code ~ '^[a-z0-9_.-]{1,64}$'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (organization_id, cache_key),
  unique (organization_id, id),
  foreign key (organization_id, site_id, task_run_id)
    references public.task_runs (organization_id, site_id, id) on delete cascade,
  foreign key (organization_id, evidence_pair_id)
    references public.evidence_pairs (organization_id, id) on delete restrict,
  check (
    (status = 'reserved' and charged_cents is null and completed_at is null)
    or (status in ('completed', 'failed') and charged_cents is not null and completed_at is not null)
  )
);

create index quality_ai_runs_task_idx on public.quality_ai_runs (task_run_id, submission_revision, created_at desc);

create table public.quality_ai_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  case_id text not null check (case_id ~ '^[a-z0-9_.-]{1,80}$'),
  expected_outcome text not null check (expected_outcome ~ '^[a-z0-9_.-]{1,80}$'),
  observed_status public.quality_result_status not null,
  mismatch boolean not null,
  abstained boolean not null,
  reviewer_override boolean not null default false,
  quality_ai_run_id uuid references public.quality_ai_runs (id) on delete set null,
  model text not null check (char_length(model) between 1 and 128),
  prompt_version text not null check (prompt_version ~ '^[a-z0-9_.-]{1,64}$'),
  schema_version text not null check (schema_version = 'quality.v1'),
  charged_cents integer check (charged_cents is null or charged_cents >= 0),
  cost_provenance text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, case_id, model, prompt_version, schema_version)
);

create function public.reserve_openai_quality_run(
  p_task_run_id uuid,
  p_submission_revision integer,
  p_cache_key text,
  p_attempt_cents integer,
  p_model text,
  p_prompt_version text
)
returns table (outcome text, run_id uuid, attempt_number integer, cached_output jsonb, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.task_runs%rowtype;
  v_pair public.evidence_pairs%rowtype;
  v_budget public.quality_ai_budgets%rowtype;
  v_ai_run public.quality_ai_runs%rowtype;
  v_existing boolean := false;
begin
  select * into strict v_run from public.task_runs where id = p_task_run_id for update;
  if v_run.submission_revision <> p_submission_revision or v_run.state <> 'submitted' then
    raise exception using errcode = '40001', message = 'stale_submission';
  end if;
  select * into strict v_pair from public.evidence_pairs
    where task_run_id = v_run.id and submission_revision = p_submission_revision;

  select * into v_budget from public.quality_ai_budgets
    where organization_id = v_run.organization_id for update;
  if not found or not v_budget.live_enabled then
    return query select 'manual_review', null::uuid, null::integer, null::jsonb, 'live_mode_disabled';
    return;
  end if;
  select * into v_ai_run from public.quality_ai_runs
    where organization_id = v_run.organization_id and cache_key = p_cache_key for update;
  v_existing := found;
  if found and v_ai_run.status = 'completed' then
    return query select 'cached', v_ai_run.id, v_ai_run.attempt_count, v_ai_run.provider_output, null::text;
    return;
  end if;
  if found and v_ai_run.status = 'reserved' then
    return query select 'manual_review', v_ai_run.id, v_ai_run.attempt_count, null::jsonb, 'attempt_in_progress';
    return;
  end if;
  if found and v_ai_run.attempt_count >= 2 then
    return query select 'manual_review', v_ai_run.id, v_ai_run.attempt_count, null::jsonb, 'attempt_cap_reached';
    return;
  end if;
  if p_attempt_cents <= 0 or v_budget.spent_cents + v_budget.reserved_cents + p_attempt_cents > v_budget.maximum_cents then
    return query select 'manual_review', null::uuid, null::integer, null::jsonb, 'budget_exhausted';
    return;
  end if;

  update public.quality_ai_budgets
    set reserved_cents = reserved_cents + p_attempt_cents, updated_at = now()
    where organization_id = v_run.organization_id;

  if v_existing then
    update public.quality_ai_runs
      set status = 'reserved', attempt_count = attempt_count + 1, reserved_cents = p_attempt_cents,
          charged_cents = null, provider_response_id = null, provider_request_id = null,
          latency_ms = null, provider_usage = null, provider_output = null,
          quality_decision_id = null, error_code = null, completed_at = null,
          model = p_model, prompt_version = p_prompt_version
      where id = v_ai_run.id
      returning * into v_ai_run;
  else
    insert into public.quality_ai_runs (
      organization_id, site_id, task_run_id, submission_revision, evidence_pair_id,
      cache_key, reserved_cents, provider, model, prompt_version, schema_version
    ) values (
      v_run.organization_id, v_run.site_id, v_run.id, p_submission_revision, v_pair.id,
      p_cache_key, p_attempt_cents, 'openai', p_model, p_prompt_version, 'quality.v1'
    ) returning * into v_ai_run;
  end if;

  return query select 'reserved', v_ai_run.id, v_ai_run.attempt_count, null::jsonb, null::text;
exception when no_data_found then
  raise exception using errcode = 'P0002', message = 'submission_not_found';
end;
$$;

create function public.finish_openai_quality_run(
  p_run_id uuid,
  p_status public.quality_ai_run_status,
  p_provider_output jsonb,
  p_quality_decision_id uuid,
  p_provider_response_id text,
  p_provider_request_id text,
  p_latency_ms integer,
  p_provider_usage jsonb,
  p_error_code text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.quality_ai_runs%rowtype;
begin
  select * into strict v_run from public.quality_ai_runs where id = p_run_id for update;
  if v_run.status <> 'reserved' then
    return true;
  end if;
  if p_status = 'reserved' then
    raise exception using errcode = '22023', message = 'invalid_final_status';
  end if;
  -- A provider call has an unknown final invoice at this point. Charge the configured
  -- per-attempt cap, preserving a hard tenant ceiling rather than inventing a rate.
  update public.quality_ai_budgets
    set reserved_cents = reserved_cents - v_run.reserved_cents,
        spent_cents = spent_cents + v_run.reserved_cents,
        updated_at = now()
    where organization_id = v_run.organization_id;
  update public.quality_ai_runs
    set status = p_status, charged_cents = v_run.reserved_cents,
        provider_output = p_provider_output, quality_decision_id = p_quality_decision_id,
        provider_response_id = p_provider_response_id, provider_request_id = p_provider_request_id,
        latency_ms = p_latency_ms, provider_usage = p_provider_usage,
        error_code = p_error_code, completed_at = now()
    where id = v_run.id;
  return true;
exception when no_data_found then
  raise exception using errcode = 'P0002', message = 'quality_run_not_found';
end;
$$;

create function public.record_quality_ai_evaluation(
  p_organization_id uuid,
  p_case_id text,
  p_expected_outcome text,
  p_observed_status public.quality_result_status,
  p_mismatch boolean,
  p_abstained boolean,
  p_reviewer_override boolean,
  p_quality_ai_run_id uuid,
  p_model text,
  p_prompt_version text,
  p_charged_cents integer,
  p_cost_provenance text
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into public.quality_ai_evaluations (
    organization_id, case_id, expected_outcome, observed_status, mismatch, abstained,
    reviewer_override, quality_ai_run_id, model, prompt_version, schema_version,
    charged_cents, cost_provenance
  ) values (
    p_organization_id, p_case_id, p_expected_outcome, p_observed_status, p_mismatch, p_abstained,
    p_reviewer_override, p_quality_ai_run_id, p_model, p_prompt_version, 'quality.v1',
    p_charged_cents, p_cost_provenance
  )
  on conflict (organization_id, case_id, model, prompt_version, schema_version) do update
    set expected_outcome = excluded.expected_outcome,
        observed_status = excluded.observed_status,
        mismatch = excluded.mismatch,
        abstained = excluded.abstained,
        reviewer_override = excluded.reviewer_override,
        quality_ai_run_id = excluded.quality_ai_run_id,
        charged_cents = excluded.charged_cents,
        cost_provenance = excluded.cost_provenance,
        created_at = now()
  returning id;
$$;

alter table public.quality_ai_budgets enable row level security;
alter table public.quality_ai_runs enable row level security;
alter table public.quality_ai_evaluations enable row level security;
revoke all on table public.quality_ai_budgets, public.quality_ai_runs, public.quality_ai_evaluations from anon, authenticated, service_role;
grant select on table public.quality_ai_runs to authenticated, service_role;
grant select on table public.quality_ai_budgets to service_role;
grant select on table public.quality_ai_evaluations to service_role;
create policy quality_ai_runs_select on public.quality_ai_runs
  for select to authenticated using (private.can_manage_site(organization_id, site_id));

revoke execute on function public.reserve_openai_quality_run(uuid, integer, text, integer, text, text)
  from public, anon, authenticated;
revoke execute on function public.finish_openai_quality_run(uuid, public.quality_ai_run_status, jsonb, uuid, text, text, integer, jsonb, text)
  from public, anon, authenticated;
revoke execute on function public.record_quality_ai_evaluation(uuid, text, text, public.quality_result_status, boolean, boolean, boolean, uuid, text, text, integer, text)
  from public, anon, authenticated;
grant execute on function public.reserve_openai_quality_run(uuid, integer, text, integer, text, text)
  to service_role;
grant execute on function public.finish_openai_quality_run(uuid, public.quality_ai_run_status, jsonb, uuid, text, text, integer, jsonb, text)
  to service_role;
grant execute on function public.record_quality_ai_evaluation(uuid, text, text, public.quality_result_status, boolean, boolean, boolean, uuid, text, text, integer, text)
  to service_role;
