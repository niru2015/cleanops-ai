-- Service-only ownership ledger for a dedicated synthetic hosted demo tenant.
-- No browser role receives table privileges, and RLS stays enabled.
create table public.demo_scenario_runs (
  run_id text primary key,
  scenario_id text not null check (scenario_id ~ '^[a-z][a-z0-9-]{2,63}$'),
  organization_id uuid not null unique,
  project_ref text not null check (project_ref ~ '^[a-z0-9]{20}$'),
  status text not null check (status in ('generating','partial','ready','resetting')),
  registry jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (registry->>'runId' = run_id),
  check (registry->>'organizationId' = organization_id::text)
);

alter table public.demo_scenario_runs enable row level security;
revoke all on public.demo_scenario_runs from public, anon, authenticated;
grant select, insert, update, delete on public.demo_scenario_runs to service_role;
