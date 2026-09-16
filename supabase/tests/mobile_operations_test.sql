begin;
set local search_path = public, extensions;
select plan(13);

select results_eq(
  $$ select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = any(array[
       'shift_coverage_requirements', 'task_run_assignments', 'replacement_selections'
     ]) and c.relrowsecurity $$,
  array[3::bigint],
  'RLS is enabled on all CLEAN-006 operations tables'
);
select ok(not has_table_privilege('anon', 'public.shift_coverage_requirements', 'select'), 'anonymous users cannot read coverage');
select ok(not has_table_privilege('authenticated', 'public.task_run_assignments', 'insert'), 'workers cannot assign tasks directly');
select ok(not has_table_privilege('authenticated', 'public.shift_coverage_requirements', 'insert'), 'users cannot change required coverage directly');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select results_eq(
  $$ select present_workers::integer, required_positions from public.get_shift_coverage_at(
       '90000000-0000-4000-8000-000000000001', '2026-09-14T05:45:00Z') $$,
  $$ values (40, 42) $$,
  'coverage starts at 40 of 42 from distinct eligible attendance'
);

set local role service_role;
insert into public.shift_assignments (id, organization_id, site_id, shift_id, worker_id)
select 'b3000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', id
from public.workers where display_name = 'Replacement candidate 1 Demo';
insert into public.attendance_events (organization_id, site_id, assignment_id, event_type, occurred_at, recorded_by)
values ('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000001', 'check_in', '2026-09-14T06:05:00Z', '00000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
select results_eq(
  $$ select present_workers::integer, coverage_gap::integer from public.get_shift_coverage_at(
       '90000000-0000-4000-8000-000000000001', '2026-09-14T06:05:00Z') $$,
  $$ values (41, 1) $$,
  'first replacement check-in changes coverage to 41 of 42'
);

set local role service_role;
insert into public.shift_assignments (id, organization_id, site_id, shift_id, worker_id)
select 'b3000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', id
from public.workers where display_name = 'Replacement candidate 2 Demo';
insert into public.attendance_events (organization_id, site_id, assignment_id, event_type, occurred_at, recorded_by)
values ('10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001',
  'b3000000-0000-4000-8000-000000000002', 'check_in', '2026-09-14T06:10:00Z', '00000000-0000-4000-8000-000000000002');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
select results_eq(
  $$ select present_workers::integer, coverage_gap::integer from public.get_shift_coverage_at(
       '90000000-0000-4000-8000-000000000001', '2026-09-14T06:10:00Z') $$,
  $$ values (42, 0) $$,
  'second replacement check-in changes coverage to 42 of 42'
);
select is((select count(distinct assignment.worker_id) from public.attendance_events event join public.shift_assignments assignment on assignment.id = event.assignment_id where event.occurred_at <= '2026-09-14T06:10:00Z'), 42::bigint, 'coverage is backed by distinct workers');
select is((select count(*) from public.attendance_events), 42::bigint, 'there is one persisted attendance event per present worker');
select is((select count(*) from public.task_run_assignments where task_run_id = '81000000-0000-4000-8000-000000000004'), 1::bigint, 'mobile task has an explicit worker assignment');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
select is((select count(*) from public.task_runs where id = '81000000-0000-4000-8000-000000000004'), 1::bigint, 'assigned cleaner can read the mobile task');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000006', true);
select is((select count(*) from public.shift_coverage_requirements), 0::bigint, 'tenant B cannot read tenant A coverage');
select is((select count(*) from public.task_run_assignments), 0::bigint, 'tenant B cannot read tenant A task assignments');

select * from finish();
rollback;
