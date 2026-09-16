create table public.shift_coverage_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null,
  shift_id uuid not null,
  required_positions integer not null check (required_positions between 1 and 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shift_id),
  unique (organization_id, site_id, id),
  foreign key (organization_id, site_id, shift_id)
    references public.shifts (organization_id, site_id, id) on delete cascade
);

create table public.task_run_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null,
  task_run_id uuid not null,
  worker_id uuid not null,
  assigned_by uuid not null references auth.users (id) on delete restrict,
  assigned_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (task_run_id, worker_id),
  unique (organization_id, site_id, id),
  foreign key (organization_id, site_id, task_run_id)
    references public.task_runs (organization_id, site_id, id) on delete cascade,
  foreign key (organization_id, site_id, worker_id)
    references public.worker_site_permissions (organization_id, site_id, worker_id) on delete restrict
);

create table public.replacement_selections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  site_id uuid not null,
  shift_id uuid not null,
  worker_id uuid not null,
  assignment_id uuid,
  selected_by uuid not null references auth.users (id) on delete restrict,
  selected_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (shift_id, worker_id),
  unique (organization_id, site_id, id),
  foreign key (organization_id, site_id, shift_id)
    references public.shifts (organization_id, site_id, id) on delete cascade,
  foreign key (organization_id, site_id, worker_id)
    references public.worker_site_permissions (organization_id, site_id, worker_id) on delete restrict,
  foreign key (organization_id, site_id, assignment_id)
    references public.shift_assignments (organization_id, site_id, id) on delete restrict
);

create index task_run_assignments_worker_idx
  on public.task_run_assignments (organization_id, worker_id, assigned_at);
create index replacement_selections_shift_idx
  on public.replacement_selections (shift_id, selected_at);

create function public.get_shift_coverage_at(p_shift_id uuid, p_at timestamptz)
returns table(required_positions integer, present_workers bigint, coverage_gap bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select
    requirement.required_positions,
    count(distinct assignment.worker_id) filter (
      where attendance.event_type = 'check_in'
        and permission.state = 'active'
        and permission.valid_from <= p_at
        and (permission.valid_until is null or permission.valid_until > p_at)
    ) as present_workers,
    greatest(
      requirement.required_positions - count(distinct assignment.worker_id) filter (
        where attendance.event_type = 'check_in'
          and permission.state = 'active'
          and permission.valid_from <= p_at
          and (permission.valid_until is null or permission.valid_until > p_at)
      ),
      0
    ) as coverage_gap
  from public.shift_coverage_requirements as requirement
  join public.shifts as shift on shift.id = requirement.shift_id
  left join public.shift_assignments as assignment
    on assignment.shift_id = shift.id and assignment.state <> 'cancelled'
  left join lateral (
    select event.event_type
    from public.attendance_events as event
    where event.assignment_id = assignment.id and event.occurred_at <= p_at
    order by event.occurred_at desc
    limit 1
  ) as attendance on true
  left join public.worker_site_permissions as permission
    on permission.organization_id = assignment.organization_id
   and permission.site_id = assignment.site_id
   and permission.worker_id = assignment.worker_id
  where requirement.shift_id = p_shift_id
    and (
      (select auth.jwt() ->> 'role') = 'service_role'
      or private.can_read_shift(shift.organization_id, shift.site_id, shift.id)
    )
  group by requirement.required_positions;
$$;

alter table public.shift_coverage_requirements enable row level security;
alter table public.task_run_assignments enable row level security;
alter table public.replacement_selections enable row level security;

revoke all on table public.shift_coverage_requirements, public.task_run_assignments,
  public.replacement_selections from anon, authenticated;
grant select on table public.shift_coverage_requirements, public.task_run_assignments,
  public.replacement_selections to authenticated;
grant insert, update on table public.replacement_selections to authenticated;
grant all on table public.shift_coverage_requirements, public.task_run_assignments,
  public.replacement_selections to service_role;

create policy shift_coverage_requirements_select
  on public.shift_coverage_requirements for select to authenticated
  using (private.can_read_shift(organization_id, site_id, shift_id));
create policy task_run_assignments_select
  on public.task_run_assignments for select to authenticated
  using (
    private.can_manage_site(organization_id, site_id)
    or private.can_read_worker(organization_id, worker_id)
  );
create policy replacement_selections_select
  on public.replacement_selections for select to authenticated
  using (private.can_manage_site(organization_id, site_id));
create policy replacement_selections_insert
  on public.replacement_selections for insert to authenticated
  with check (private.can_manage_site(organization_id, site_id));
create policy replacement_selections_update
  on public.replacement_selections for update to authenticated
  using (private.can_manage_site(organization_id, site_id))
  with check (private.can_manage_site(organization_id, site_id));

drop policy task_runs_select on public.task_runs;
create policy task_runs_select on public.task_runs for select to authenticated
  using (
    private.can_manage_site(organization_id, site_id)
    or exists (
      select 1
      from public.task_run_assignments as task_assignment
      join public.workers as worker
        on worker.organization_id = task_assignment.organization_id
       and worker.id = task_assignment.worker_id
      where task_assignment.organization_id = task_runs.organization_id
        and task_assignment.site_id = task_runs.site_id
        and task_assignment.task_run_id = task_runs.id
        and worker.auth_user_id = (select auth.uid())
    )
  );

revoke execute on function public.get_shift_coverage_at(uuid, timestamptz)
  from public, anon;
grant execute on function public.get_shift_coverage_at(uuid, timestamptz)
  to authenticated, service_role;
