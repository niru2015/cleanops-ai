create schema if not exists private;
revoke all on schema private from public;

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated, service_role;

create type public.app_role as enum (
  'cleaner',
  'site_supervisor',
  'area_manager',
  'operations_manager',
  'organization_administrator',
  'client_viewer'
);
create type public.membership_state as enum ('active', 'revoked');
create type public.permission_state as enum ('active', 'suspended', 'expired');
create type public.task_run_state as enum ('planned', 'ready', 'in_progress', 'submitted', 'completed', 'cancelled');
create type public.shift_state as enum ('planned', 'active', 'completed', 'cancelled');
create type public.assignment_state as enum ('assigned', 'accepted', 'completed', 'cancelled');
create type public.attendance_event_type as enum ('check_in', 'check_out');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  state public.membership_state not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (organization_id, id)
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 2 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  client_id uuid not null,
  name text not null check (length(trim(name)) between 2 and 120),
  timezone text not null check (length(trim(timezone)) between 3 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, client_id, id),
  foreign key (organization_id, client_id)
    references public.clients(organization_id, id) on delete cascade
);

create table public.member_site_access (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  membership_id uuid not null,
  site_id uuid not null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at),
  unique (membership_id, site_id),
  unique (organization_id, id),
  foreign key (organization_id, membership_id)
    references public.memberships(organization_id, id) on delete cascade,
  foreign key (organization_id, site_id)
    references public.sites(organization_id, id) on delete cascade
);

create table public.site_zones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null,
  name text not null check (length(trim(name)) between 2 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, site_id, name),
  unique (organization_id, site_id, id),
  foreign key (organization_id, site_id)
    references public.sites(organization_id, id) on delete cascade
);

create table public.workers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  display_name text not null check (length(trim(display_name)) between 2 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, auth_user_id)
);

create table public.worker_site_permissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  worker_id uuid not null,
  site_id uuid not null,
  state public.permission_state not null default 'active',
  valid_from timestamptz not null,
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_until is null or valid_until > valid_from),
  unique (worker_id, site_id),
  unique (organization_id, site_id, worker_id),
  unique (organization_id, id),
  foreign key (organization_id, worker_id)
    references public.workers(organization_id, id) on delete cascade,
  foreign key (organization_id, site_id)
    references public.sites(organization_id, id) on delete cascade
);

create table public.service_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null,
  name text not null check (length(trim(name)) between 2 and 160),
  evidence_required boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, site_id, name),
  unique (organization_id, site_id, id),
  foreign key (organization_id, site_id)
    references public.sites(organization_id, id) on delete cascade
);

create table public.task_schedules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null,
  task_id uuid not null,
  zone_id uuid not null,
  recurrence jsonb not null check (jsonb_typeof(recurrence) = 'object'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, site_id, task_id, zone_id),
  unique (organization_id, site_id, task_id, zone_id, id),
  foreign key (organization_id, site_id, task_id)
    references public.service_tasks(organization_id, site_id, id) on delete cascade,
  foreign key (organization_id, site_id, zone_id)
    references public.site_zones(organization_id, site_id, id) on delete cascade
);

create table public.task_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null,
  task_id uuid not null,
  zone_id uuid not null,
  task_schedule_id uuid not null,
  scheduled_at timestamptz not null,
  due_at timestamptz not null,
  requirements_snapshot jsonb not null default '{}'::jsonb
    check (jsonb_typeof(requirements_snapshot) = 'object'),
  state public.task_run_state not null default 'planned',
  submission_revision integer not null default 0 check (submission_revision >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_at > scheduled_at),
  unique (task_schedule_id, scheduled_at),
  unique (organization_id, id),
  foreign key (organization_id, site_id, task_id, zone_id, task_schedule_id)
    references public.task_schedules(organization_id, site_id, task_id, zone_id, id)
    on delete cascade
);

create table public.shifts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  state public.shift_state not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (organization_id, site_id, id),
  foreign key (organization_id, site_id)
    references public.sites(organization_id, id) on delete cascade
);

create table public.shift_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null,
  shift_id uuid not null,
  worker_id uuid not null,
  state public.assignment_state not null default 'assigned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shift_id, worker_id),
  unique (organization_id, site_id, id),
  foreign key (organization_id, site_id, shift_id)
    references public.shifts(organization_id, site_id, id) on delete cascade,
  foreign key (organization_id, worker_id)
    references public.workers(organization_id, id) on delete cascade,
  foreign key (organization_id, site_id, worker_id)
    references public.worker_site_permissions(organization_id, site_id, worker_id)
    on delete restrict
);

create table public.attendance_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null,
  assignment_id uuid not null,
  event_type public.attendance_event_type not null,
  occurred_at timestamptz not null,
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (assignment_id, event_type),
  foreign key (organization_id, site_id, assignment_id)
    references public.shift_assignments(organization_id, site_id, id) on delete cascade
);

create index memberships_user_active_idx
  on public.memberships (user_id, organization_id) where state = 'active';
create index member_site_access_membership_idx
  on public.member_site_access (membership_id, site_id, starts_at, ends_at);
create index sites_client_idx on public.sites (organization_id, client_id);
create index site_zones_site_idx on public.site_zones (organization_id, site_id);
create index workers_auth_user_idx on public.workers (auth_user_id) where auth_user_id is not null;
create index worker_site_permissions_worker_idx
  on public.worker_site_permissions (organization_id, worker_id, site_id, state);
create index worker_site_permissions_site_idx
  on public.worker_site_permissions (organization_id, site_id, worker_id, state);
create index service_tasks_site_idx on public.service_tasks (organization_id, site_id, active);
create index task_schedules_site_idx on public.task_schedules (organization_id, site_id, active);
create index task_runs_site_state_due_idx
  on public.task_runs (organization_id, site_id, state, due_at);
create index shifts_site_start_idx on public.shifts (organization_id, site_id, starts_at);
create index shift_assignments_worker_idx
  on public.shift_assignments (organization_id, worker_id, shift_id);
create index attendance_events_assignment_idx
  on public.attendance_events (organization_id, assignment_id, occurred_at);

create function private.is_active_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.memberships as membership
    where membership.organization_id = p_organization_id
      and membership.user_id = (select auth.uid())
      and membership.state = 'active'
  );
$$;

create function private.has_org_role(p_organization_id uuid, p_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.memberships as membership
    where membership.organization_id = p_organization_id
      and membership.user_id = (select auth.uid())
      and membership.state = 'active'
      and membership.role = any (p_roles)
  );
$$;

create function private.is_own_membership(p_organization_id uuid, p_membership_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.memberships as membership
    where membership.organization_id = p_organization_id
      and membership.id = p_membership_id
      and membership.user_id = (select auth.uid())
      and membership.state = 'active'
  );
$$;

create function private.has_site_access(p_organization_id uuid, p_site_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1
    from public.memberships as membership
    where membership.organization_id = p_organization_id
      and membership.user_id = (select auth.uid())
      and membership.state = 'active'
      and (
        membership.role in ('operations_manager', 'organization_administrator')
        or exists (
          select 1
          from public.member_site_access as access
          where access.organization_id = p_organization_id
            and access.membership_id = membership.id
            and access.site_id = p_site_id
            and access.starts_at <= now()
            and (access.ends_at is null or access.ends_at > now())
        )
      )
  );
$$;

create function private.has_operational_site_access(p_organization_id uuid, p_site_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_site_access(p_organization_id, p_site_id)
    and private.has_org_role(
      p_organization_id,
      array[
        'cleaner'::public.app_role,
        'site_supervisor'::public.app_role,
        'area_manager'::public.app_role,
        'operations_manager'::public.app_role,
        'organization_administrator'::public.app_role
      ]
    );
$$;

create function private.can_administer_org(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_org_role(
    p_organization_id,
    array['organization_administrator'::public.app_role]
  );
$$;

create function private.can_operate_org(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_org_role(
    p_organization_id,
    array[
      'operations_manager'::public.app_role,
      'organization_administrator'::public.app_role
    ]
  );
$$;

create function private.can_manage_site(p_organization_id uuid, p_site_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_operate_org(p_organization_id)
    or (
      private.has_site_access(p_organization_id, p_site_id)
      and private.has_org_role(
        p_organization_id,
        array['site_supervisor'::public.app_role, 'area_manager'::public.app_role]
      )
    );
$$;

create function private.can_access_client(p_organization_id uuid, p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_operate_org(p_organization_id) or exists (
    select 1
    from public.sites as site
    where site.organization_id = p_organization_id
      and site.client_id = p_client_id
      and private.has_site_access(site.organization_id, site.id)
  );
$$;

create function private.can_read_worker(p_organization_id uuid, p_worker_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_operate_org(p_organization_id) or exists (
    select 1
    from public.workers as worker
    where worker.organization_id = p_organization_id
      and worker.id = p_worker_id
      and (
        worker.auth_user_id = (select auth.uid())
        or (
          private.has_org_role(
            p_organization_id,
            array['site_supervisor'::public.app_role, 'area_manager'::public.app_role]
          )
          and exists (
            select 1
            from public.worker_site_permissions as permission
            where permission.organization_id = p_organization_id
              and permission.worker_id = p_worker_id
              and permission.state = 'active'
              and permission.valid_from <= now()
              and (permission.valid_until is null or permission.valid_until > now())
              and private.has_site_access(permission.organization_id, permission.site_id)
          )
        )
      )
  );
$$;

create function private.can_read_shift(p_organization_id uuid, p_site_id uuid, p_shift_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_manage_site(p_organization_id, p_site_id) or exists (
    select 1
    from public.shift_assignments as assignment
    join public.workers as worker
      on worker.organization_id = assignment.organization_id
     and worker.id = assignment.worker_id
    where assignment.organization_id = p_organization_id
      and assignment.site_id = p_site_id
      and assignment.shift_id = p_shift_id
      and worker.auth_user_id = (select auth.uid())
  );
$$;

create function private.can_read_assignment(p_organization_id uuid, p_site_id uuid, p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_manage_site(p_organization_id, p_site_id) or exists (
    select 1
    from public.shift_assignments as assignment
    join public.workers as worker
      on worker.organization_id = assignment.organization_id
     and worker.id = assignment.worker_id
    where assignment.organization_id = p_organization_id
      and assignment.site_id = p_site_id
      and assignment.id = p_assignment_id
      and worker.auth_user_id = (select auth.uid())
  );
$$;

create function private.can_record_attendance(p_organization_id uuid, p_site_id uuid, p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_manage_site(p_organization_id, p_site_id) or (
    private.has_org_role(p_organization_id, array['cleaner'::public.app_role])
    and private.can_read_assignment(p_organization_id, p_site_id, p_assignment_id)
  );
$$;

revoke execute on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;
grant execute on all functions in schema private to authenticated, service_role;

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.clients enable row level security;
alter table public.sites enable row level security;
alter table public.member_site_access enable row level security;
alter table public.site_zones enable row level security;
alter table public.workers enable row level security;
alter table public.worker_site_permissions enable row level security;
alter table public.service_tasks enable row level security;
alter table public.task_schedules enable row level security;
alter table public.task_runs enable row level security;
alter table public.shifts enable row level security;
alter table public.shift_assignments enable row level security;
alter table public.attendance_events enable row level security;

revoke all on table public.organizations, public.memberships, public.clients, public.sites,
  public.member_site_access, public.site_zones, public.workers, public.worker_site_permissions,
  public.service_tasks, public.task_schedules, public.task_runs, public.shifts,
  public.shift_assignments, public.attendance_events from anon, authenticated;

grant select, update on table public.organizations to authenticated;
grant select, insert, update, delete on table public.memberships, public.clients, public.sites,
  public.member_site_access, public.site_zones, public.workers, public.worker_site_permissions,
  public.service_tasks, public.task_schedules, public.task_runs, public.shifts,
  public.shift_assignments, public.attendance_events to authenticated;
grant all on table public.organizations, public.memberships, public.clients, public.sites,
  public.member_site_access, public.site_zones, public.workers, public.worker_site_permissions,
  public.service_tasks, public.task_schedules, public.task_runs, public.shifts,
  public.shift_assignments, public.attendance_events to service_role;

create policy organizations_select on public.organizations for select to authenticated
  using (private.is_active_member(id));
create policy organizations_update on public.organizations for update to authenticated
  using (private.can_administer_org(id))
  with check (private.can_administer_org(id));

create policy memberships_select on public.memberships for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.can_administer_org(organization_id)
  );
create policy memberships_insert on public.memberships for insert to authenticated
  with check (private.can_administer_org(organization_id));
create policy memberships_update on public.memberships for update to authenticated
  using (private.can_administer_org(organization_id))
  with check (private.can_administer_org(organization_id));
create policy memberships_delete on public.memberships for delete to authenticated
  using (private.can_administer_org(organization_id));

create policy clients_select on public.clients for select to authenticated
  using (private.can_access_client(organization_id, id));
create policy clients_insert on public.clients for insert to authenticated
  with check (private.can_operate_org(organization_id));
create policy clients_update on public.clients for update to authenticated
  using (private.can_operate_org(organization_id))
  with check (private.can_operate_org(organization_id));
create policy clients_delete on public.clients for delete to authenticated
  using (private.can_operate_org(organization_id));

create policy sites_select on public.sites for select to authenticated
  using (private.has_site_access(organization_id, id));
create policy sites_insert on public.sites for insert to authenticated
  with check (private.can_operate_org(organization_id));
create policy sites_update on public.sites for update to authenticated
  using (private.can_manage_site(organization_id, id))
  with check (private.can_manage_site(organization_id, id));
create policy sites_delete on public.sites for delete to authenticated
  using (private.can_manage_site(organization_id, id));

create policy member_site_access_select on public.member_site_access for select to authenticated
  using (
    private.is_own_membership(organization_id, membership_id)
    or private.can_administer_org(organization_id)
  );
create policy member_site_access_insert on public.member_site_access for insert to authenticated
  with check (private.can_administer_org(organization_id));
create policy member_site_access_update on public.member_site_access for update to authenticated
  using (private.can_administer_org(organization_id))
  with check (private.can_administer_org(organization_id));
create policy member_site_access_delete on public.member_site_access for delete to authenticated
  using (private.can_administer_org(organization_id));

create policy site_zones_select on public.site_zones for select to authenticated
  using (private.has_site_access(organization_id, site_id));
create policy site_zones_insert on public.site_zones for insert to authenticated
  with check (private.can_manage_site(organization_id, site_id));
create policy site_zones_update on public.site_zones for update to authenticated
  using (private.can_manage_site(organization_id, site_id))
  with check (private.can_manage_site(organization_id, site_id));
create policy site_zones_delete on public.site_zones for delete to authenticated
  using (private.can_manage_site(organization_id, site_id));

create policy workers_select on public.workers for select to authenticated
  using (private.can_read_worker(organization_id, id));
create policy workers_insert on public.workers for insert to authenticated
  with check (private.can_operate_org(organization_id));
create policy workers_update on public.workers for update to authenticated
  using (private.can_operate_org(organization_id))
  with check (private.can_operate_org(organization_id));
create policy workers_delete on public.workers for delete to authenticated
  using (private.can_administer_org(organization_id));

create policy worker_site_permissions_select on public.worker_site_permissions for select to authenticated
  using (
    private.can_manage_site(organization_id, site_id)
    or private.can_read_worker(organization_id, worker_id)
  );
create policy worker_site_permissions_insert on public.worker_site_permissions for insert to authenticated
  with check (private.can_manage_site(organization_id, site_id));
create policy worker_site_permissions_update on public.worker_site_permissions for update to authenticated
  using (private.can_manage_site(organization_id, site_id))
  with check (private.can_manage_site(organization_id, site_id));
create policy worker_site_permissions_delete on public.worker_site_permissions for delete to authenticated
  using (private.can_manage_site(organization_id, site_id));

create policy service_tasks_select on public.service_tasks for select to authenticated
  using (private.has_operational_site_access(organization_id, site_id));
create policy service_tasks_insert on public.service_tasks for insert to authenticated
  with check (private.can_manage_site(organization_id, site_id));
create policy service_tasks_update on public.service_tasks for update to authenticated
  using (private.can_manage_site(organization_id, site_id))
  with check (private.can_manage_site(organization_id, site_id));
create policy service_tasks_delete on public.service_tasks for delete to authenticated
  using (private.can_manage_site(organization_id, site_id));

create policy task_schedules_select on public.task_schedules for select to authenticated
  using (private.has_operational_site_access(organization_id, site_id));
create policy task_schedules_insert on public.task_schedules for insert to authenticated
  with check (private.can_manage_site(organization_id, site_id));
create policy task_schedules_update on public.task_schedules for update to authenticated
  using (private.can_manage_site(organization_id, site_id))
  with check (private.can_manage_site(organization_id, site_id));
create policy task_schedules_delete on public.task_schedules for delete to authenticated
  using (private.can_manage_site(organization_id, site_id));

create policy task_runs_select on public.task_runs for select to authenticated
  using (private.can_manage_site(organization_id, site_id));
create policy task_runs_insert on public.task_runs for insert to authenticated
  with check (private.can_manage_site(organization_id, site_id));
create policy task_runs_update on public.task_runs for update to authenticated
  using (private.can_manage_site(organization_id, site_id))
  with check (private.can_manage_site(organization_id, site_id));
create policy task_runs_delete on public.task_runs for delete to authenticated
  using (private.can_manage_site(organization_id, site_id));

create policy shifts_select on public.shifts for select to authenticated
  using (private.can_read_shift(organization_id, site_id, id));
create policy shifts_insert on public.shifts for insert to authenticated
  with check (private.can_manage_site(organization_id, site_id));
create policy shifts_update on public.shifts for update to authenticated
  using (private.can_manage_site(organization_id, site_id))
  with check (private.can_manage_site(organization_id, site_id));
create policy shifts_delete on public.shifts for delete to authenticated
  using (private.can_manage_site(organization_id, site_id));

create policy shift_assignments_select on public.shift_assignments for select to authenticated
  using (private.can_read_assignment(organization_id, site_id, id));
create policy shift_assignments_insert on public.shift_assignments for insert to authenticated
  with check (private.can_manage_site(organization_id, site_id));
create policy shift_assignments_update on public.shift_assignments for update to authenticated
  using (private.can_manage_site(organization_id, site_id))
  with check (private.can_manage_site(organization_id, site_id));
create policy shift_assignments_delete on public.shift_assignments for delete to authenticated
  using (private.can_manage_site(organization_id, site_id));

create policy attendance_events_select on public.attendance_events for select to authenticated
  using (private.can_read_assignment(organization_id, site_id, assignment_id));
create policy attendance_events_insert on public.attendance_events for insert to authenticated
  with check (
    recorded_by = (select auth.uid())
    and private.can_record_attendance(organization_id, site_id, assignment_id)
  );
create policy attendance_events_update on public.attendance_events for update to authenticated
  using (private.can_manage_site(organization_id, site_id))
  with check (private.can_manage_site(organization_id, site_id));
create policy attendance_events_delete on public.attendance_events for delete to authenticated
  using (private.can_manage_site(organization_id, site_id));
