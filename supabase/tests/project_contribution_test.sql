begin;
set local search_path=public,extensions;
select no_plan();

select ok(not has_table_privilege('authenticated','public.projects','insert'),
  'browser cannot insert project rows directly');
select ok(not has_table_privilege('authenticated','public.project_revenue_terms','insert'),
  'browser cannot approve commercial terms directly');
select ok(not has_table_privilege('authenticated','public.project_source_links','insert'),
  'browser cannot forge source attribution');

-- Local demo-login provisioning may relink fixture memberships to real test Auth
-- users. Restore these two fixture identities only inside this rollback test.
update public.memberships set user_id='00000000-0000-4000-8000-000000000001'
  where id='20000000-0000-4000-8000-000000000001';
update public.memberships set user_id='00000000-0000-4000-8000-000000000003'
  where id='20000000-0000-4000-8000-000000000003';

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
create temporary table test_project as select public.create_finance_project(
  '40000000-0000-4000-8000-000000000001','HASTINGS-TEST','Hastings test job',
  'Synthetic project scope for database isolation') id;
select is((select state from public.projects where id=(select id from test_project)),
  'draft','project begins as an operational draft');
select is((select completeness from public.list_finance_projects(null)
  where project_id=(select id from test_project)), 'draft','draft has no final margin');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.create_finance_project(
  '40000000-0000-4000-8000-000000000001','SUPERVISOR-PROJECT','Supervisor draft',
  'Supervisor cannot create finance project',null,null,null)$$,
  '42501',null,'Supervisor cannot create a finance project');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select is((select count(*) from public.projects where id=(select id from test_project)),
  0::bigint,'Area Manager cannot read another casino project');
select is((select count(*) from public.list_finance_projects(null)
  where project_id=(select id from test_project)),0::bigint,
  'aggregate RPC also excludes another casino');
select throws_ok($$select public.approve_finance_project((select id from test_project),'fixed',100,null)$$,
  '42501',null,'Area Manager cannot approve commercial terms');
select throws_ok($$select public.create_finance_project(
  '40000000-0000-4000-8000-000000000001','FORGED-PROJECT','Wrong casino',
  'Area Manager tries another casino',null,null,null)$$,
  '42501',null,'Area Manager cannot create at another casino');
create temporary table area_project as select public.create_finance_project(
  '40000000-0000-4000-8000-000000000002','AREA-DRAFT-TEST','Area draft',
  'Synthetic assigned-site project scope') id;
select public.update_finance_project_scope((select id from area_project),'Area edited draft',
  'Area Manager updated assigned-site operational scope',null,null,null);
select is((select name from public.projects where id=(select id from area_project)),
  'Area edited draft','Area Manager can edit assigned-site operational draft');
select throws_ok($$select public.approve_finance_project((select id from area_project),'fixed',100,null)$$,
  '42501',null,'Area Manager cannot activate even their own draft');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select public.approve_finance_project((select id from test_project),'fixed',100,null);
select is((select expected_revenue from public.list_finance_projects(null)
  where project_id=(select id from test_project)),100::numeric,
  'approved fixed quote becomes expected revenue');
select is((select recognized_contribution from public.list_finance_projects(null)
  where project_id=(select id from test_project)),null::numeric,
  'no accounting revenue yields no final contribution');
select ok(public.record_finance_project_invoice((select id from test_project),
  'DEMO-HASTINGS-TEST','2026-09-15',80) is not null,'Director records an invoice');
select is((select invoiced_revenue from public.list_finance_projects(null)
  where project_id=(select id from test_project)),80::numeric,
  'invoice amount is distinct from expected revenue');
select public.set_finance_project_completion((select id from test_project),true);
select is((select recognized_margin_pct from public.list_finance_projects(null)
  where project_id=(select id from test_project)),null::numeric,
  'cost close alone cannot make an accounting margin final');
select throws_ok($$select public.assign_finance_project_source((select id from test_project),
  'expense','00000000-0000-4000-8000-000000000999')$$,
  null,'unknown expense cannot be attributed to a project');

create temporary table hourly_project as select public.create_finance_project(
  '40000000-0000-4000-8000-000000000001','HASTINGS-HOURLY','Hastings hourly job',
  'Synthetic billable project test') id;
select public.approve_finance_project((select id from hourly_project),'hourly',null,75);
select is((select expected_revenue from public.list_finance_projects(null)
  where project_id=(select id from hourly_project)),0::numeric,
  'hourly quote starts at zero without approved billable activity');
create temporary table hourly_time as select public.create_manual_time_entry(
  '40000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001',
  '2026-09-16',3,'regular','HASTINGS-HOURLY',null,null,'Synthetic project time') id;
select public.assign_finance_project_time((select id from hourly_project),(select id from hourly_time));
select public.review_time_entry((select id from hourly_time),'approve',3,'regular','Synthetic time reviewed');
select public.approve_finance_project_billable_time((select id from hourly_project),(select id from hourly_time),2);
select is((select expected_revenue from public.list_finance_projects(null)
  where project_id=(select id from hourly_project)),150::numeric,
  'hourly expected revenue uses approved two billable hours, not three source hours');
select throws_ok($$select public.approve_finance_project_billable_time(
  (select id from hourly_project),(select id from hourly_time),4)$$,
  null,'billable hours above approved operational time are rejected');
select throws_ok($$select public.assign_finance_project_time(
  (select id from hourly_project),(select id from hourly_time))$$,
  null,'approved billable time cannot be reassigned');
select public.cancel_finance_project((select id from hourly_project));
select is((select state from public.projects where id=(select id from hourly_project)),
  'cancelled','Director cancellation preserves the project record');

reset role;
create temporary table parent_contract as
  with created as (insert into public.contracts(organization_id,site_id,client_id,code,name,created_by)
    select s.organization_id,s.id,s.client_id,'HASTINGS-PARENT-TEST','Synthetic parent contract',
      '00000000-0000-4000-8000-000000000001' from public.sites s
      where s.id='40000000-0000-4000-8000-000000000001' returning id)
  select id from created;
grant select on parent_contract to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
create temporary table under_contract as select public.create_finance_project(
  '40000000-0000-4000-8000-000000000001','HASTINGS-UNDER-CONTRACT',
  'Hastings extra work','Synthetic extra work outside recurring scope',
  (select id from parent_contract),null,null) id;
select is((select contract_id from public.projects where id=(select id from under_contract)),
  (select id from parent_contract),'one-off project can reference its parent contract');

reset role;
select * from finish();
rollback;
