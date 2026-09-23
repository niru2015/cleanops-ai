begin;
set local search_path=public,extensions;
select no_plan();
select ok(not has_table_privilege('authenticated','public.finance_reconciliation_links','insert'),
  'browser cannot forge links');
select ok(not has_table_privilege('authenticated','public.finance_periods','update'),
  'browser cannot forge close state');
select ok(not has_function_privilege('anon','public.close_finance_period(uuid)','execute'),
  'anonymous caller cannot close');

update public.memberships set user_id='00000000-0000-4000-8000-000000000001'
  where id='20000000-0000-4000-8000-000000000001';
update public.memberships set user_id='00000000-0000-4000-8000-000000000003'
  where id='20000000-0000-4000-8000-000000000003';
insert into public.labor_cost_entries(organization_id,site_id,work_date,hours,hourly_cost)
values ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','2030-01-15',1,10),
  ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','2030-01-16',1,10);
create temporary table recon_batch as
  select gen_random_uuid() id;
insert into public.finance_import_batches(id,organization_id,source_file_name,source_file_hash,mapping_version,
 currency,service_period_start,service_period_end,state,completeness,accepted_by,accepted_at)
select id,'10000000-0000-4000-8000-000000000001','2030-synthetic.csv',repeat('e',64),'test-v1',
  'CAD','2030-01-01','2030-01-31','accepted','complete','00000000-0000-4000-8000-000000000001',now() from recon_batch;
create temporary table recon_row as select gen_random_uuid() id;
insert into public.finance_source_rows(id,organization_id,import_batch_id,source_row_number,source_document_id,
 source_line_id,service_period,accounting_period,currency,category,amount,allocation_state)
select r.id,'10000000-0000-4000-8000-000000000001',b.id,1,'LAB-2030','1',
  '2030-01-15','2030-01-31','CAD','direct_labour',20,'allocated' from recon_row r,recon_batch b;
create temporary table recon_allocation as select gen_random_uuid() id;
insert into public.finance_source_allocations(id,organization_id,source_row_id,site_id,amount)
select a.id,'10000000-0000-4000-8000-000000000001',r.id,
  '40000000-0000-4000-8000-000000000001',20 from recon_allocation a,recon_row r;
grant select on recon_allocation to authenticated;
grant select on recon_row to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.open_finance_period('10000000-0000-4000-8000-000000000001','2030-01-01')$$,
  '42501',null,'Area cannot open period');
select is((select count(*) from public.finance_periods),0::bigint,'Area cannot read raw period');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
create temporary table recon_period as select public.open_finance_period(
  '10000000-0000-4000-8000-000000000001','2030-01-01') id;
grant select on recon_period to authenticated;
select is(public.open_finance_period('10000000-0000-4000-8000-000000000001','2030-01-01'),
  (select id from recon_period),'open is idempotent');
select is((select metrics->>'coverage' from public.list_finance_period_status()
  where period_id=(select id from recon_period)),'complete','accepted complete batch covers month');
select public.review_finance_period((select id from recon_period));
select throws_ok($$select public.close_finance_period((select id from recon_period))$$,
  null,'unmatched operational and accounting balances block close');
select public.match_finance_allocation((select id from recon_period),(select id from recon_allocation),
  'labor_cost_entry',(select id from public.labor_cost_entries where work_date='2030-01-15' limit 1),
  10,'First synthetic labour split');
select is((select (metrics->>'unallocatedSourceAmount')::numeric from public.list_finance_period_status()
  where period_id=(select id from recon_period)),10::numeric,'partial match leaves exact balance');
select throws_ok($$select public.match_finance_allocation((select id from recon_period),
  (select id from recon_allocation),'labor_cost_entry',
  (select id from public.labor_cost_entries where work_date='2030-01-15' limit 1),1,'Overmatch attempt')$$,
  null,'operational overmatch is rejected');
select public.match_finance_allocation((select id from recon_period),(select id from recon_allocation),
  'labor_cost_entry',(select id from public.labor_cost_entries where work_date='2030-01-16' limit 1),
  10,'Second synthetic labour split');
select is((select (metrics->>'unmatchedOperationalAmount')::numeric from public.list_finance_period_status()
  where period_id=(select id from recon_period)),0::numeric,'all operational cost now matched');
select ok(public.close_finance_period((select id from recon_period)) is not null,'balanced complete period closes');
select throws_ok($$select public.match_finance_allocation((select id from recon_period),
  (select id from recon_allocation),'labor_cost_entry',
  (select id from public.labor_cost_entries where work_date='2030-01-15' limit 1),1,'Closed correction')$$,
  null,'closed period rejects changes');
select public.reopen_finance_period((select id from recon_period),'Correct synthetic source');
select is((select state from public.finance_periods where id=(select id from recon_period)),
  'reopened','reopen is audited and visible');
create temporary table empty_period as select public.open_finance_period(
  '10000000-0000-4000-8000-000000000001','2030-02-01') id;
grant select on empty_period to authenticated;
select public.review_finance_period((select id from empty_period));
select throws_ok($$select public.close_finance_period((select id from empty_period))$$,
  null,'a zero-activity month without accepted coverage cannot close');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select is((select count(*) from public.finance_reconciliation_links),0::bigint,
  'Area cannot read Director-only match details');
select ok((select count(*)>0 from public.list_finance_period_site_status()
  where period_id=(select id from recon_period) and site_id='40000000-0000-4000-8000-000000000002'),
  'Area reads assigned site aggregate');
select is((select count(*) from public.list_finance_period_site_status()
  where period_id=(select id from recon_period) and site_id='40000000-0000-4000-8000-000000000001'),
  0::bigint,'Area cannot read other site aggregate');
select throws_ok($$select public.list_finance_operational_rows((select id from recon_period))$$,
  '42501',null,'Area cannot read operational rows');
reset role;
select * from finish();
rollback;
