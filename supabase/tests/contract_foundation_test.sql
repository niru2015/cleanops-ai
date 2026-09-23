begin;
set local search_path = public, extensions;
select plan(46);

select results_eq(
  $$ select relrowsecurity from pg_class where oid = 'public.contract_financial_terms'::regclass $$,
  array[true], 'commercial terms use RLS');
select ok(not has_table_privilege('anon','public.contracts','select'), 'anonymous has no contract grant');

insert into auth.users(id,email,raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000007','operations-c22@cleanops.example','{}');
insert into public.memberships(id,organization_id,user_id,role) values
  ('20000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-000000000007','operations_manager');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);

create temp table new_contract as
  with inserted as (
    insert into public.contracts(organization_id,site_id,client_id,code,name,created_by)
    values ('10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      (select client_id from public.sites where id='40000000-0000-4000-8000-000000000001'),
      'TEST-C22','Synthetic monthly service',auth.uid()) returning id
  ) select id from inserted;
create temp table new_version as
  with inserted as (
    insert into public.contract_versions(organization_id,site_id,contract_id,version_number,
      source_type,effective_from,created_by)
    values ('10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',(select id from new_contract),1,
      'manual',(date_trunc('month',current_date)+interval '1 month')::date,auth.uid()) returning id
  ) select id from inserted;
insert into public.contract_financial_terms(organization_id,site_id,contract_version_id,
  basis,amount,currency,effective_from)
values ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
  (select id from new_version),'fixed_monthly',1234.56,'CAD',
  (date_trunc('month',current_date)+interval '1 month')::date);
insert into public.contract_obligations(organization_id,site_id,contract_version_id,zone_id,
  name,recurrence)
values ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
  (select id from new_version),(select id from public.site_zones where site_id='40000000-0000-4000-8000-000000000001' limit 1),
  'Quarterly deep clean','quarterly');
insert into public.contract_staffing_requirements(organization_id,site_id,contract_version_id,
  weekday,local_start,local_end,required_positions)
values ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
  (select id from new_version),1,'08:00','16:00',2);

select is((select count(*) from public.contract_financial_terms where contract_version_id=(select id from new_version)),1::bigint,
  'Director can read the priced term');
select throws_ok(
  $$ insert into public.contract_obligations(organization_id,site_id,contract_version_id,name,recurrence)
    values ('10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001',
      (select id from new_version),'Wrong tenant','daily') $$,
  '42501', null, 'cross-tenant child reference rejected by RLS');

select public.approve_contract_version((select id from new_version));
select is((select state from public.contract_versions where id=(select id from new_version)),
  'approved','Director approval freezes draft');
update public.contract_financial_terms set amount=999 where contract_version_id=(select id from new_version);
select is((select amount from public.contract_financial_terms where contract_version_id=(select id from new_version)),
  1234.56::numeric, 'approved financial terms cannot be edited directly');
select is((public.preview_contract_activation((select id from new_version))->>'tasks')::integer,
  1,'preview counts one task');
select is((public.preview_contract_activation((select id from new_version))->>'revenueEntries')::integer,
  12,'preview counts twelve monthly expectations');
select is((public.preview_contract_activation((select id from new_version))->>'firstRevenueAmount')::numeric,
  1234.56::numeric,'preview retains decimal amount');
select public.activate_contract_version((select id from new_version),
  public.preview_contract_activation((select id from new_version))->>'token');
select is((select state from public.contract_versions where id=(select id from new_version)),
  'active','Director activates approved version');
select is((select count(*) from public.task_schedules where contract_version_id=(select id from new_version)),
  1::bigint,'quarterly obligation creates one canonical schedule');
select is((select substr(id::text, 15, 1) from public.service_tasks
  where contract_version_id=(select id from new_version)), '5',
  'generated task ID has a valid deterministic UUID version');
select is((select substr(id::text, 20, 1) from public.service_tasks
  where contract_version_id=(select id from new_version)), '8',
  'generated task ID has a valid UUID variant');
select is((select recurrence->>'kind' from public.task_schedules where contract_version_id=(select id from new_version)),
  'quarterly','schedule retains quarterly recurrence');
select is((select count(*) from public.shift_coverage_requirements where contract_version_id=(select id from new_version)),
  4::bigint,'four weekly shifts carry canonical coverage');
select is((select count(*) from public.contract_revenue_expectations where contract_version_id=(select id from new_version)),
  12::bigint,'fixed monthly activation creates twelve traceable expectations');
select throws_ok(
  $$ select public.activate_contract_version((select id from new_version),'stale') $$,
  '42501', null, 'duplicate activation is rejected without duplicate effects');
select is((select count(*) from public.contract_revenue_expectations where contract_version_id=(select id from new_version)),
  12::bigint,'retry leaves expected revenue unchanged');
create temp table historical_contract_run as
  with inserted as (
    insert into public.task_runs(organization_id,site_id,task_id,zone_id,task_schedule_id,
      scheduled_at,due_at)
    select schedule.organization_id,schedule.site_id,schedule.task_id,schedule.zone_id,schedule.id,
      ((date_trunc('month',current_date)+interval '1 month')::date + time '10:00') at time zone 'UTC',
      ((date_trunc('month',current_date)+interval '1 month')::date + time '11:00') at time zone 'UTC'
    from public.task_schedules schedule where schedule.contract_version_id=(select id from new_version)
    returning id,contract_version_id
  ) select * from inserted;
select is((select contract_version_id from historical_contract_run),(select id from new_version),
  'task run inherits the applicable contract version from its schedule');

-- A future amendment creates new source rows while past expectations retain their version.
create temp table amendment as
  with inserted as (
    insert into public.contract_versions(organization_id,site_id,contract_id,version_number,
      source_type,effective_from,created_by)
    values ('10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',(select id from new_contract),2,
      'amendment',(date_trunc('month',current_date)+interval '7 months')::date,auth.uid()) returning id
  ) select id from inserted;
insert into public.contract_financial_terms(organization_id,site_id,contract_version_id,
  basis,amount,currency,effective_from)
values ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
  (select id from amendment),'fixed_monthly',2000.00,'CAD',
  (date_trunc('month',current_date)+interval '7 months')::date);
insert into public.contract_obligations(organization_id,site_id,contract_version_id,zone_id,name,recurrence)
values ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
  (select id from amendment),(select id from public.site_zones where site_id='40000000-0000-4000-8000-000000000001' limit 1),
  'Quarterly deep clean','quarterly');
insert into public.contract_staffing_requirements(organization_id,site_id,contract_version_id,
  weekday,local_start,local_end,required_positions)
values ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
  (select id from amendment),1,'08:00','16:00',3);
select public.approve_contract_version((select id from amendment));
select is((public.preview_contract_activation((select id from amendment))->>'supersedes')::integer,
  1,'future amendment preview identifies prior version');
select public.activate_contract_version((select id from amendment),
  public.preview_contract_activation((select id from amendment))->>'token');
select is((select effective_to from public.contract_versions where id=(select id from new_version)),
  (date_trunc('month',current_date)+interval '7 months')::date,
  'prior version is bounded at future amendment');
select is((select count(*) from public.contract_revenue_expectations
  where contract_version_id=(select id from new_version) and is_current),6::bigint,
  'prior version preserves six current historical/forthcoming months');
select is((select count(*) from public.contract_revenue_expectations
  where contract_version_id=(select id from new_version) and not is_current),6::bigint,
  'future prior expectations are superseded, not deleted');
select is((select count(*) from public.contract_revenue_expectations
  where contract_version_id=(select id from amendment) and amount=2000.00),12::bigint,
  'amendment produces twelve new monthly expectations');
select is((select count(*) from public.shift_coverage_requirements
  where contract_version_id=(select id from amendment) and required_positions=3),4::bigint,
  'amendment versions future staffing coverage');
select is((select recurrence->>'effective_to' from public.task_schedules
  where contract_version_id=(select id from new_version)),
  (date_trunc('month',current_date)+interval '7 months')::date::text,
  'prior schedule ends at the amendment date');
select is((select contract_version_id from public.task_runs where id=(select id from historical_contract_run)),
  (select id from new_version),'amendment does not rewrite historical task run provenance');

create temp table annual_contract as
  with inserted as (
    insert into public.contracts(organization_id,site_id,client_id,code,name,created_by)
    values ('10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      (select client_id from public.sites where id='40000000-0000-4000-8000-000000000001'),
      'ANNUAL-C22','Synthetic annual billing',auth.uid()) returning id
  ) select id from inserted;
create temp table annual_version as
  with inserted as (
    insert into public.contract_versions(organization_id,site_id,contract_id,version_number,
      source_type,effective_from,created_by)
    values ('10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',(select id from annual_contract),1,
      'manual',(date_trunc('month',current_date)+interval '1 month')::date,auth.uid()) returning id
  ) select id from inserted;
insert into public.contract_financial_terms(organization_id,site_id,contract_version_id,
  basis,amount,currency,effective_from)
values ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
  (select id from annual_version),'fixed_annual',12000.50,'CAD',
  (date_trunc('month',current_date)+interval '1 month')::date);
select public.approve_contract_version((select id from annual_version));
select is((public.preview_contract_activation((select id from annual_version))->>'revenueEntries')::integer,
  1,'fixed annual term previews one anniversary-period expectation');
select public.activate_contract_version((select id from annual_version),
  public.preview_contract_activation((select id from annual_version))->>'token');
select is((select amount from public.contract_revenue_expectations
  where contract_version_id=(select id from annual_version)),12000.50::numeric,
  'fixed annual amount remains exact with cents');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select is((select count(*) from public.contracts where id=(select id from new_contract)),0::bigint,
  'Area Manager cannot read an unassigned-site contract');
select throws_ok(
  $$ select public.create_manual_contract('40000000-0000-4000-8000-000000000001',
       'DENIED-C22','Wrong-site contract') $$,
  '42501',null,'Area Manager cannot create at an unassigned site');
select lives_ok(
  $$ select public.create_manual_contract('40000000-0000-4000-8000-000000000002',
       'AREA-C22','Assigned-site draft') $$,
  'Area Manager can create an assigned-site draft');
select is((select count(*) from public.contracts where code='AREA-C22'),1::bigint,
  'Area Manager can reload the persisted draft');
select throws_ok(
  $$ select public.approve_contract_version((select id from amendment)) $$,
  '42501',null,'Area Manager cannot approve commercial terms');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.contracts),0::bigint,
  'Site Supervisor cannot read contract administration');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000007',true);
select is((select count(*) from public.contracts where id=(select id from new_contract)),1::bigint,
  'Operations Manager can review contract identity organization-wide');
select is((select count(*) from public.contract_obligations where contract_version_id=(select id from new_version)),1::bigint,
  'Operations Manager can review operational obligations');
select is((select count(*) from public.contract_financial_terms),0::bigint,
  'Operations Manager cannot read commercial prices');
select is((select count(*) from public.contract_revenue_expectations),0::bigint,
  'Operations Manager cannot read expected revenue');
select is((select count(*) from public.contract_events),0::bigint,
  'Operations Manager cannot read activation events containing financial impact');
select throws_ok(
  $$ select public.preview_contract_activation((select id from amendment)) $$,
  '42501',null,'Operations Manager cannot preview commercial activation');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
select is((select count(*) from public.contracts),0::bigint,'Cleaner cannot read contracts');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
select is((select count(*) from public.contracts),0::bigint,'Client cannot read contracts');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
select is((select count(*) from public.contracts where id=(select id from new_contract)),0::bigint,
  'other-tenant Director cannot read the contract');

reset role;
update public.memberships set state='revoked' where id='20000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select is((select count(*) from public.contracts where code='AREA-C22'),0::bigint,
  'revoked Area Manager loses contract access immediately');
reset role;
select throws_ok(
  $$ insert into public.contract_obligations(organization_id,site_id,contract_version_id,name,recurrence)
    values ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002',
      (select id from new_version),'Mismatched site','daily') $$,
  '23503',null,'composite foreign key rejects a cross-site child even for a trusted writer');

select * from finish();
rollback;
