begin;
set local search_path=public,extensions;
select no_plan();

select ok(not has_table_privilege('authenticated','public.worker_cost_rates','insert'),
  'browser cannot write confidential rates directly');
select ok(not has_table_privilege('authenticated','public.time_entries','insert'),
  'browser cannot forge approved hours directly');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select throws_ok($$ select public.set_worker_cost_rate('60000000-0000-4000-8000-000000000001',
  'regular',25,'CAD','2026-01-01',null,null,'Manager attempt') $$,
  '42501',null,'Area Manager cannot set a worker rate');
select is((select count(*) from public.worker_cost_rates),0::bigint,
  'Area Manager receives no rate rows');
select throws_ok($$ select public.derive_shift_time_entry('a2000000-0000-4000-8000-000000000001') $$,
  '42501',null,'Area Manager cannot derive time for another casino');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select ok(public.derive_shift_time_entry('a2000000-0000-4000-8000-000000000001') is not null,
  'Supervisor derives missing checkout exception');
select is((select state from public.time_entries where assignment_id='a2000000-0000-4000-8000-000000000001'),
  'exception','missing checkout is not auto-approved');
select is((select exception_code from public.time_entries where assignment_id='a2000000-0000-4000-8000-000000000001'),
  'missing_checkout','exception reason is explicit');
select is((select count(*) from public.time_entries where assignment_id='a2000000-0000-4000-8000-000000000001'),
  1::bigint,'derivation is idempotent');
select ok(public.derive_shift_time_entry('a2000000-0000-4000-8000-000000000001') is not null,
  'replay returns same time entry');
select throws_ok($$ select public.post_approved_time_cost(
  (select id from public.time_entries where assignment_id='a2000000-0000-4000-8000-000000000001')) $$,
  '42501',null,'Supervisor cannot cost time');
select ok(public.review_time_entry(
  (select id from public.time_entries where assignment_id='a2000000-0000-4000-8000-000000000001'),
  'approve',7.5,'overtime','Verified paper timesheet') is not null,
  'Supervisor approves corrected overtime with reason');
select is((select hours from public.time_entries where assignment_id='a2000000-0000-4000-8000-000000000001'),
  7.5::numeric,'approved correction is stored');
select ok((select before_value is not null and after_value->>'costType'='overtime'
  from public.time_entry_events where action='approved' and time_entry_id=(select id from public.time_entries
  where assignment_id='a2000000-0000-4000-8000-000000000001')),
  'overtime correction retains before and after audit');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select throws_ok($$ select public.post_approved_time_cost(
  (select id from public.time_entries where assignment_id='a2000000-0000-4000-8000-000000000001')) $$,
  null,'posting fails without effective overtime rate');
select ok(public.set_worker_cost_rate('62000000-0000-4000-8000-000000000001',
  'overtime',37.2500,'CAD','2026-01-01',null,'DEMO-OT','Initial approved rate') is not null,
  'Director sets confidential overtime rate');
select ok(public.set_worker_cost_rate('62000000-0000-4000-8000-000000000001',
  'regular',24.1250,'CAD','2026-01-01',null,'DEMO-REG','Initial approved rate') is not null,
  'Director sets regular rate');
select ok(public.set_worker_cost_rate('62000000-0000-4000-8000-000000000001',
  'regular',25.5000,'CAD','2026-07-01',null,'DEMO-REG-2','Midyear reviewed change') is not null,
  'Director enters midyear effective rate');
select throws_ok($$ select public.set_worker_cost_rate('62000000-0000-4000-8000-000000000001',
  'regular',25.12345,'CAD','2026-10-01',null,null,'Too much precision') $$,
  null,'rates with finer precision than four decimals are rejected');
select is((select effective_to from public.worker_cost_rates where worker_id='62000000-0000-4000-8000-000000000001'
  and rate_type='regular' and effective_from='2026-01-01' and state='active'),
  '2026-07-01'::date,'prior rate interval closes at new boundary');
select is((select hourly_cost from public.worker_cost_rates where worker_id='62000000-0000-4000-8000-000000000001'
  and rate_type='regular' and state='active' and effective_from<='2026-06-30'
  and (effective_to is null or effective_to>'2026-06-30')),24.1250::numeric,
  'June work retains the earlier effective rate');
select is((select hourly_cost from public.worker_cost_rates where worker_id='62000000-0000-4000-8000-000000000001'
  and rate_type='regular' and state='active' and effective_from<='2026-07-01'
  and (effective_to is null or effective_to>'2026-07-01')),25.5000::numeric,
  'new rate starts at its exclusive-boundary date');
select is((select count(*) from public.worker_cost_rate_events where organization_id='10000000-0000-4000-8000-000000000001'),
  4::bigint,'rate create and close actions are audited');
select ok(public.post_approved_time_cost(
  (select id from public.time_entries where assignment_id='a2000000-0000-4000-8000-000000000001')) is not null,
  'Director posts approved overtime');
select is((select total_cost from public.labor_cost_entries where time_entry_id=(select id from public.time_entries
  where assignment_id='a2000000-0000-4000-8000-000000000001')),
  279.38::numeric,'cost uses exact rate snapshot and database rounding');
select is((select count(*) from public.labor_cost_entries where time_entry_id=(select id from public.time_entries
  where assignment_id='a2000000-0000-4000-8000-000000000001')),
  1::bigint,'one ledger row per approved time');
select ok(public.post_approved_time_cost(
  (select id from public.time_entries where assignment_id='a2000000-0000-4000-8000-000000000001')) is not null,
  'posting retry returns existing ledger');
select is((select count(*) from public.labor_cost_entries where time_entry_id=(select id from public.time_entries
  where assignment_id='a2000000-0000-4000-8000-000000000001')),
  1::bigint,'posting retry does not double charge');
select ok(public.set_worker_cost_rate('62000000-0000-4000-8000-000000000001',
  'overtime',40,'CAD','2026-01-01',null,'DEMO-OT-CORR','Historical rate correction') is not null,
  'Director can supersede a rate with an audited correction');
select is((select total_cost from public.labor_cost_entries where time_entry_id=(select id from public.time_entries
  where assignment_id='a2000000-0000-4000-8000-000000000001')),
  279.38::numeric,'historical posted labour cost remains its approved snapshot');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select is((select count(*) from public.time_entries where site_id='40000000-0000-4000-8000-000000000001'),
  0::bigint,'Area Manager cannot read another casino time');
select is((select count(*) from public.worker_cost_rates),0::bigint,
  'Area Manager still receives no rate payload');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select throws_ok($$ select public.create_manual_time_entry(
  '40000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001',
  '2026-09-15',4,'regular','Wrong casino',null,null,'Project review') $$,
  '42501',null,'Supervisor cannot create time at another casino');
select throws_ok($$ select public.create_manual_time_entry(
  '40000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001',
  '2026-09-15',3.1234567,'regular','Fine precision',null,null,'Project review') $$,
  null,'manual hours with finer than six-decimal precision are rejected');
select ok(public.create_manual_time_entry(
  '40000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001',
  '2026-09-15',3,'regular','Hastings deep clean',null,null,'Manual project source') is not null,
  'Supervisor creates manual project draft');
select is((select state from public.time_entries where project_reference='Hastings deep clean'),
  'draft','manual time waits for review');
select ok(public.review_time_entry((select id from public.time_entries where project_reference='Hastings deep clean'),
  'approve',3,'regular','Source checked against job') is not null,
  'Supervisor approves manual project hours');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select ok(public.post_approved_time_cost((select id from public.time_entries where project_reference='Hastings deep clean')) is not null,
  'Director posts manual project cost');
select is((select total_cost from public.labor_cost_entries where project_reference='Hastings deep clean'),
  76.50::numeric,'midyear rate applies to September project');
select is((select sum(total_cost) from public.labor_cost_entries
  where organization_id='10000000-0000-4000-8000-000000000001'
    and site_id='40000000-0000-4000-8000-000000000001'
    and time_entry_id is not null),355.88::numeric,
  'manual project and approved shift roll into the site cost once');
select is((select count(*) from public.time_entry_events where action='posted'),
  2::bigint,'posting audit is recorded for each entry');

reset role;
select throws_ok($$ insert into public.worker_cost_rates(organization_id,worker_id,rate_type,
  hourly_cost,currency,effective_from,reason,created_by)
  values('10000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001',
  'regular',30,'CAD','2026-06-01','Invalid overlap','00000000-0000-4000-8000-000000000001') $$,
  '23P01',null,'active cost rates cannot overlap');
insert into public.shifts(id,organization_id,site_id,starts_at,ends_at,state)
values('e1000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001','2026-09-14T06:00:00Z','2026-09-14T14:30:00Z','completed');
insert into public.shift_assignments(id,organization_id,site_id,shift_id,worker_id,state)
values('e2000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001',
  '62000000-0000-4000-8000-000000000002','completed');
insert into public.attendance_events(organization_id,site_id,assignment_id,event_type,occurred_at,recorded_by)
values('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001','check_in','2026-09-14T06:00:00Z',
  '00000000-0000-4000-8000-000000000002'),
  ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001','check_out','2026-09-14T14:30:00Z',
  '00000000-0000-4000-8000-000000000002');
update public.shift_assignments set state='cancelled'
  where id='a2000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select ok(public.derive_shift_time_entry('e2000000-0000-4000-8000-000000000001') is not null,
  'Supervisor derives overnight attendance');
select is((select work_date from public.time_entries where assignment_id='e2000000-0000-4000-8000-000000000001'),
  '2026-09-13'::date,'overnight work date uses the site-local check-in date');
select is((select hours from public.time_entries where assignment_id='e2000000-0000-4000-8000-000000000001'),
  8.5::numeric,'overnight elapsed hours preserve half-hour precision');
select ok(public.derive_shift_time_entry('a2000000-0000-4000-8000-000000000002') is not null,
  'Supervisor derives cancelled worker assignment');
select is((select exception_code from public.time_entries where assignment_id='a2000000-0000-4000-8000-000000000002'),
  'worker_swap','cancelled assignment with attendance remains a worker-swap exception');
select ok((select after_value->>'exception'='worker_swap' from public.time_entry_events
  where time_entry_id=(select id from public.time_entries
    where assignment_id='a2000000-0000-4000-8000-000000000002') and action='derived'),
  'worker-swap exception retains source audit');
reset role;
select throws_ok($$ insert into public.time_entries(organization_id,site_id,worker_id,
  source_type,work_date,hours)
  values('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002',
  '62000000-0000-4000-8000-000000000001','correction','2026-09-14',2) $$,
  '23503',null,'time entry cannot attach a worker without site permission');
select throws_ok($$ update public.labor_cost_entries set hourly_cost=1
  where project_reference='Hastings deep clean' $$, '42501',null,'posted time cost is immutable');
select throws_ok($$ delete from public.time_entry_events where action='posted' $$,
  null,'time audit cannot be deleted');

select * from finish();
rollback;
