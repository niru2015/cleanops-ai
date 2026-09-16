BEGIN;
SELECT plan(1);

-- Examples: https://pgtap.org/documentation.html

SELECT * FROM finish();
ROLLBACK;
begin;
set local search_path = public, extensions;

select plan(16);

select results_eq(
  $$
    select count(*)
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = any (array[
        'organizations', 'memberships', 'clients', 'sites', 'member_site_access',
        'site_zones', 'workers', 'worker_site_permissions', 'service_tasks',
        'task_schedules', 'task_runs', 'shifts', 'shift_assignments', 'attendance_events'
      ])
      and relation.relrowsecurity
  $$,
  array[14::bigint],
  'RLS is enabled on every CLEAN-002 table'
);

set local role anon;
select throws_ok(
  $$ select id from public.organizations $$,
  '42501',
  'permission denied for table organizations',
  'anonymous reads have no table grant'
);
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';

select results_eq(
  $$ select count(*) from public.sites $$,
  array[1::bigint],
  'site supervisor sees only the granted site'
);
select results_eq(
  $$
    update public.site_zones
       set name = 'Gaming Floor pgTAP Demo'
     where id = '50000000-0000-4000-8000-000000000001'
     returning id
  $$,
  $$ values ('50000000-0000-4000-8000-000000000001'::uuid) $$,
  'site supervisor can update a granted-site row'
);
select is_empty(
  $$
    update public.site_zones
       set name = 'Forbidden East Lobby Demo'
     where id = '50000000-0000-4000-8000-000000000002'
     returning id
  $$,
  'cross-site update is filtered out'
);
select throws_ok(
  $$
    insert into public.site_zones (organization_id, site_id, name)
    values (
      '10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000002',
      'Forbidden Zone Demo'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "site_zones"',
  'cross-site insert fails its RLS check'
);
select results_eq(
  $$
    select count(*)
    from public.sites
    where organization_id = '10000000-0000-4000-8000-000000000002'
  $$,
  array[0::bigint],
  'cross-tenant read returns no rows'
);
select is_empty(
  $$
    delete from public.service_tasks
    where id = '70000000-0000-4000-8000-000000000002'
    returning id
  $$,
  'cross-site delete is filtered out'
);

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000004';

select results_eq(
  $$ select count(*) from public.shift_assignments $$,
  array[1::bigint],
  'cleaner sees only the assigned shift'
);
select results_eq(
  $$
    insert into public.attendance_events (
      id, organization_id, site_id, assignment_id, event_type, occurred_at, recorded_by
    ) values (
      'b0000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      'a0000000-0000-4000-8000-000000000001',
      'check_in',
      '2026-09-16T08:02:00Z',
      '00000000-0000-4000-8000-000000000004'
    )
    returning id
  $$,
  $$ values ('b0000000-0000-4000-8000-000000000001'::uuid) $$,
  'cleaner can insert attendance for the own assignment'
);
select throws_ok(
  $$
    insert into public.attendance_events (
      id, organization_id, site_id, assignment_id, event_type, occurred_at, recorded_by
    ) values (
      'b0000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000002',
      'a0000000-0000-4000-8000-000000000002',
      'check_in',
      '2026-09-16T09:02:00Z',
      '00000000-0000-4000-8000-000000000004'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "attendance_events"',
  'cleaner cannot record attendance for another site assignment'
);

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000001';

select results_eq(
  $$ select count(*) from public.sites $$,
  array[2::bigint],
  'organization administrator sees both tenant sites'
);
select throws_ok(
  $$
    insert into public.sites (organization_id, client_id, name, timezone)
    values (
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000003',
      'Guessed Tenant Demo',
      'America/Vancouver'
    )
  $$,
  '23503',
  null::text,
  'composite foreign key rejects a guessed cross-tenant client id'
);
select throws_ok(
  $$
    insert into public.shift_assignments (organization_id, site_id, shift_id, worker_id)
    values (
      '10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '90000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000002'
    )
  $$,
  '23503',
  null::text,
  'composite foreign key rejects a cross-site worker assignment'
);
select results_eq(
  $$
    update public.memberships
       set state = 'revoked'
     where id = '20000000-0000-4000-8000-000000000002'
     returning state::text
  $$,
  $$ values ('revoked'::text) $$,
  'organization administrator can revoke membership'
);

set local request.jwt.claim.sub = '00000000-0000-4000-8000-000000000002';

select results_eq(
  $$ select count(*) from public.organizations $$,
  array[0::bigint],
  'revocation takes effect on the next database statement'
);

select * from finish();
rollback;
