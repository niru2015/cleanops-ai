begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

do $$
declare snapshot record;
begin
  select * into snapshot from public.get_shift_coverage_at(
    '90000000-0000-4000-8000-000000000001', '2026-09-14T06:10:00Z'
  );
  if snapshot.required_positions <> 42 or snapshot.present_workers <> 40 or snapshot.coverage_gap <> 2 then
    raise exception 'initial coverage was not 40/42';
  end if;
end;
$$;

insert into public.shift_assignments (
  id, organization_id, site_id, shift_id, worker_id
)
select 'b2000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000001', id
from public.workers where display_name = 'Replacement candidate 1 Demo';

insert into public.replacement_selections (
  organization_id, site_id, shift_id, worker_id, assignment_id, selected_by, selected_at
)
select '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000001', worker_id, id,
  '00000000-0000-4000-8000-000000000002', '2026-09-14T05:51:00Z'
from public.shift_assignments where id = 'b2000000-0000-4000-8000-000000000001';

insert into public.attendance_events (
  organization_id, site_id, assignment_id, event_type, occurred_at, recorded_by
) values (
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000001', 'check_in',
  '2026-09-14T06:05:00Z', '00000000-0000-4000-8000-000000000002'
);

insert into public.shift_assignments (
  id, organization_id, site_id, shift_id, worker_id
)
select 'b2000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000001', id
from public.workers where display_name = 'Replacement candidate 2 Demo';

insert into public.replacement_selections (
  organization_id, site_id, shift_id, worker_id, assignment_id, selected_by, selected_at
)
select '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000001', worker_id, id,
  '00000000-0000-4000-8000-000000000002', '2026-09-14T06:07:00Z'
from public.shift_assignments where id = 'b2000000-0000-4000-8000-000000000002';

insert into public.attendance_events (
  organization_id, site_id, assignment_id, event_type, occurred_at, recorded_by
) values (
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000002', 'check_in',
  '2026-09-14T06:10:00Z', '00000000-0000-4000-8000-000000000002'
);

do $$
declare at_2305 record; at_2310 record; attendance_before bigint; attendance_after bigint;
begin
  select * into at_2305 from public.get_shift_coverage_at('90000000-0000-4000-8000-000000000001', '2026-09-14T06:05:00Z');
  select * into at_2310 from public.get_shift_coverage_at('90000000-0000-4000-8000-000000000001', '2026-09-14T06:10:00Z');
  if at_2305.present_workers <> 41 or at_2305.coverage_gap <> 1 then raise exception '23:05 coverage was not 41/42'; end if;
  if at_2310.present_workers <> 42 or at_2310.coverage_gap <> 0 then raise exception '23:10 coverage was not 42/42'; end if;

  select count(*) into attendance_before from public.attendance_events;
  set local role service_role;
  insert into public.conversation_contexts (
    organization_id, integration_account_id, external_thread_id, external_sender_id,
    assignment_id, site_id, zone_id, task_run_id, starts_at, expires_at
  ) values (
    '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
    'clean-006-db-qr', 'worker-182', 'a0000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000004',
    '81000000-0000-4000-8000-000000000004', '2026-09-14T06:14:00Z', '2026-09-14T06:44:00Z'
  );
  select count(*) into attendance_after from public.attendance_events;
  if attendance_after <> attendance_before then raise exception 'QR context changed attendance'; end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000006', true);
do $$
begin
  if (select count(*) from public.shift_coverage_requirements) <> 0
    or (select count(*) from public.replacement_selections) <> 0
    or (select count(*) from public.task_run_assignments) <> 0 then
    raise exception 'tenant B could read tenant A operations records';
  end if;
end;
$$;

rollback;
