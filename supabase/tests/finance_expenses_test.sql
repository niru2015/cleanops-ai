begin;
set local search_path=public,extensions;
select plan(33);

select is((select public from storage.buckets where id='expense-receipts'),false,
  'receipt bucket is private');
select ok(not has_table_privilege('authenticated','public.expense_postings','insert'),
  'browser cannot insert operational cost');
select ok(not has_table_privilege('authenticated','public.finance_intake_items','insert'),
  'browser cannot forge finance candidates');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
create temp table fuel_intake as select public.submit_app_finance_intake(
  '40000000-0000-4000-8000-000000000001',
  'Expense: fuel; Vendor: Demo Fuel; Date: 2026-09-01; Total: CAD $42.00') as id;
select ok((select id is not null from fuel_intake),'cleaner can submit through app surface');
select throws_ok($$ select public.submit_app_finance_intake(
  '40000000-0000-4000-8000-000000000002','Expense: wrong site') $$,
  '42501',null,'cleaner cannot submit for an unassigned site');
select is((select count(*) from public.finance_intake_items),0::bigint,
  'cleaner cannot read finance inbox');

reset role;
insert into public.expense_documents(organization_id,intake_id,storage_bucket,storage_path,
  declared_mime,detected_mime,claimed_byte_size,byte_size,claimed_sha256,sha256,status,verified_at)
values('10000000-0000-4000-8000-000000000001',(select id from fuel_intake),
  'expense-receipts','test/fuel-a','image/png','image/png',100,100,repeat('a',64),repeat('a',64),
  'ready',now());
insert into public.finance_intake_items(organization_id,site_id,source_kind,submitted_by,source_text)
values('10000000-0000-4000-8000-000000000001',null,'app',
  '00000000-0000-4000-8000-000000000004','Expense: unknown site');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select is((select count(*) from public.finance_intake_items where id=(select id from fuel_intake)),
  0::bigint,'Area Manager cannot read another site expense');
select throws_ok($$ select public.resolve_finance_intake((select id from fuel_intake),
  '40000000-0000-4000-8000-000000000002','fuel_travel','Demo Fuel','2026-09-01',
  'employee_personal','CAD',null,null,42,'Synthetic fuel') $$,
  '42501',null,'Area Manager cannot seize a candidate from another site');
select is((select count(*) from public.finance_intake_items where site_id is null),0::bigint,
  'unknown-site candidate remains Director-only');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select is((select count(*) from public.finance_intake_items where id=(select id from fuel_intake)),
  1::bigint,'Director sees expense source');
create temp table fuel_claim as select public.resolve_finance_intake((select id from fuel_intake),
  '40000000-0000-4000-8000-000000000001','fuel_travel','Demo Fuel','2026-09-01',
  'employee_personal','CAD',null,null,42,'Synthetic fuel',null,'Project demo',null,'Source checked') as id;
select is((select status from public.expense_claims where id=(select id from fuel_claim)),
  'submitted','review creates draft claim, not cost');
select is((select count(*) from public.expense_postings where claim_id=(select id from fuel_claim)),
  0::bigint,'review does not post cost');
select is(public.approve_finance_expense((select id from fuel_claim)),
  (select id from fuel_claim),'Director approves in one transaction');
select is((select sum(amount) from public.expense_postings where claim_id=(select id from fuel_claim)),
  42::numeric,'approved fuel contributes one site/project cost');
select is(public.approve_finance_expense((select id from fuel_claim)),
  (select id from fuel_claim),'approval retry returns existing claim');
select is((select count(*) from public.expense_postings where claim_id=(select id from fuel_claim)),
  1::bigint,'approval retry does not double post');
select is((select reimbursement_status from public.expense_claims where id=(select id from fuel_claim)),
  'pending','employee-paid claim records reimbursement separately');

reset role;
insert into public.finance_intake_items(organization_id,site_id,source_kind,submitted_by,source_text)
values('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
  'app','00000000-0000-4000-8000-000000000004','Expense: duplicate fuel');
create temp table duplicate_intake as select id from public.finance_intake_items
  where source_text='Expense: duplicate fuel';
grant select on duplicate_intake to authenticated;
insert into public.expense_documents(organization_id,intake_id,storage_bucket,storage_path,
  detected_mime,byte_size,sha256,status,verified_at)
values('10000000-0000-4000-8000-000000000001',(select id from duplicate_intake),
  'expense-receipts','test/fuel-duplicate','image/png',100,repeat('a',64),'ready',now());
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
create temp table duplicate_claim as select public.resolve_finance_intake((select id from duplicate_intake),
  '40000000-0000-4000-8000-000000000001','fuel_travel','Demo Fuel','2026-09-01',
  'company_card','CAD',null,null,42,'Duplicate fuel',null,null,null,'Duplicate check') as id;
select throws_ok($$ select public.approve_finance_expense((select id from duplicate_claim)) $$,
  'P0001','Duplicate receipt already posted','same hash across two sources cannot post twice');
select is((select count(*) from public.expense_postings),1::bigint,
  'rejected duplicate approval leaves original cost only');

reset role;
insert into public.finance_intake_items(organization_id,site_id,source_kind,submitted_by,source_text)
values('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
  'app','00000000-0000-4000-8000-000000000004','Expense: lunch without receipt');
create temp table meal_intake as select id from public.finance_intake_items
  where source_text='Expense: lunch without receipt';
grant select on meal_intake to authenticated;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
create temp table meal_claim as select public.resolve_finance_intake((select id from meal_intake),
  '40000000-0000-4000-8000-000000000001','meals','Demo Cafe','2026-09-02',
  'company_card','CAD',10,1.20,11.20,'Synthetic meal') as id;
select throws_ok($$ select public.approve_finance_expense((select id from meal_claim)) $$,
  'P0001','Verified receipt required','missing media blocks approval');
select public.reject_finance_intake((select id from meal_intake),'No source receipt');
select is((select count(*) from public.expense_postings where claim_id=(select id from meal_claim)),
  0::bigint,'rejected meal never contributes cost');

reset role;
insert into public.integration_webhook_events(id,organization_id,integration_account_id,
  dedupe_key,payload,payload_sha256)
values('fa000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001','finance-test-event','{}',repeat('b',64));
insert into public.external_messages(organization_id,integration_account_id,integration_event_id,
  external_message_id,external_thread_id,sender_id,occurred_at,received_at,text_content)
values('10000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-000000000001',
  'fuel-whatsapp-test','expense-thread','worker-182',now(),now(),'Expense: fuel; Total: CAD $42.00');
select is((select count(*) from public.finance_intake_items where source_kind='whatsapp'
  and source_text like 'Expense: fuel%'),1::bigint,'durable WhatsApp message creates one candidate');
select is((select count(*) from public.expense_postings),1::bigint,
  'WhatsApp candidate alone creates no additional cost');

-- A granted Area Manager may review the assigned site but never approve.
insert into public.finance_intake_items(organization_id,site_id,source_kind,submitted_by,source_text)
values('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002',
  'app','00000000-0000-4000-8000-000000000003','Expense: shared supplies');
create temp table area_intake as select id from public.finance_intake_items
  where source_text='Expense: shared supplies';
grant select on area_intake to authenticated;
insert into public.expense_documents(organization_id,intake_id,storage_bucket,storage_path,
  detected_mime,byte_size,sha256,status,verified_at)
values('10000000-0000-4000-8000-000000000001',(select id from area_intake),
  'expense-receipts','test/area-supplies','image/png',100,repeat('c',64),'ready',now());
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
create temp table area_claim as select public.resolve_finance_intake((select id from area_intake),
  '40000000-0000-4000-8000-000000000002','supplies','Demo Supplies','2026-09-03',
  'company_card','CAD',null,null,30,'Shared synthetic supplies',null,'Project North',
  '[{"siteId":"40000000-0000-4000-8000-000000000002","amount":20},
    {"siteId":"40000000-0000-4000-8000-000000000002","projectReference":"Project South","amount":10}]'::jsonb,
  'Source and split checked') as id;
select is((select count(*) from public.expense_allocations where claim_id=(select id from area_claim)),
  2::bigint,'assigned Area Manager may split a reviewed expense across project references');
select throws_ok($$ select public.approve_finance_expense((select id from area_claim)) $$,
  '42501',null,'Area Manager cannot post a reviewed expense');
select throws_ok($$ select public.resolve_finance_intake((select id from area_intake),
  '40000000-0000-4000-8000-000000000002','supplies','Demo Supplies','2026-09-03',
  'company_card','CAD',null,null,30,'Bad split',null,null,
  '[{"siteId":"40000000-0000-4000-8000-000000000002","amount":29}]'::jsonb) $$,
  'P0001','Expense allocations do not balance','unbalanced split cannot replace reviewed claim');
select is((select count(*) from public.expense_allocations where claim_id=(select id from area_claim)),
  2::bigint,'failed split leaves prior allocations intact');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select is(public.approve_finance_expense((select id from area_claim)),(select id from area_claim),
  'Director posts balanced split');
select is((select sum(amount) from public.expense_postings where claim_id=(select id from area_claim)),
  30::numeric,'split postings total the approved source cost');
reset role;
select throws_ok($$ update public.expense_postings set amount=1
  where claim_id=(select id from area_claim) $$,'P0001','Posted expense provenance is immutable',
  'approved posting cannot be rewritten');

-- Receipt hashes are tenant scoped; the same synthetic bytes can occur independently.
insert into public.finance_intake_items(organization_id,site_id,source_kind,submitted_by,source_text)
values('10000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000003',
  'app','00000000-0000-4000-8000-000000000006','Expense: another tenant fuel');
create temp table other_intake as select id from public.finance_intake_items
  where source_text='Expense: another tenant fuel';
grant select on other_intake to authenticated;
insert into public.expense_documents(organization_id,intake_id,storage_bucket,storage_path,
  detected_mime,byte_size,sha256,status,verified_at)
values('10000000-0000-4000-8000-000000000002',(select id from other_intake),
  'expense-receipts','test/other-tenant','image/png',100,repeat('a',64),'ready',now());
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select is((select count(*) from public.finance_intake_items where id=(select id from other_intake)),
  0::bigint,'first tenant Director cannot read another tenant candidate');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
create temp table other_claim as select public.resolve_finance_intake((select id from other_intake),
  '40000000-0000-4000-8000-000000000003','fuel_travel','Harbour Fuel','2026-09-04',
  'company_card','CAD',null,null,42,'Separate tenant fuel',null,null,null,'Receipt checked') as id;
select is(public.approve_finance_expense((select id from other_claim)),(select id from other_claim),
  'second tenant Director can approve matching receipt bytes');
select is((select count(*) from public.expense_postings where organization_id='10000000-0000-4000-8000-000000000002'),
  1::bigint,'second tenant posting is independently scoped');

select * from finish();
rollback;
