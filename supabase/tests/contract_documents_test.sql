begin;
set local search_path = public, extensions;
select plan(21);

select is((select public from storage.buckets where id='contract-documents'),false,
  'contract document bucket is private');
select ok(not has_table_privilege('anon','public.contract_documents','select'),
  'anonymous cannot read contract metadata');
select ok(not has_table_privilege('authenticated','public.contract_documents','insert'),
  'browser cannot forge verified document metadata');

insert into auth.users(id,email,raw_user_meta_data) values
  ('00000000-0000-4000-8000-000000000007','ops-doc@cleanops.example','{}');
insert into public.memberships(id,organization_id,user_id,role) values
  ('20000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000007','operations_manager');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
create temp table doc_contract as select public.create_manual_contract(
  '40000000-0000-4000-8000-000000000001','DOC-TEST','Synthetic source review') as id;
create temp table doc_version as select id from public.contract_versions
  where contract_id=(select id from doc_contract);

reset role;
insert into public.contract_documents(id,organization_id,site_id,contract_version_id,
  file_name,declared_mime,detected_mime,claimed_byte_size,byte_size,claimed_sha256,sha256,
  page_count,storage_path,uploaded_by,status,finalized_at)
values ('ab000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',(select id from doc_version),
  'synthetic.pdf','application/pdf','application/pdf',100,100,repeat('a',64),repeat('a',64),1,
  'tenant/site/version/synthetic.pdf','00000000-0000-4000-8000-000000000001','ready',now());
insert into storage.objects(bucket_id,name)
  values ('contract-documents','tenant/site/version/synthetic.pdf');
insert into public.contract_extraction_runs(id,organization_id,site_id,contract_version_id,
  document_id,provider,provider_version,schema_version,status,created_by)
values ('ab000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',(select id from doc_version),
  'ab000000-0000-4000-8000-000000000001','deterministic','1',1,'succeeded',
  '00000000-0000-4000-8000-000000000001');
insert into public.contract_extraction_proposals(id,organization_id,site_id,contract_version_id,
  run_id,field_key,category,proposed_value,business_state,source_page,source_span)
values
  ('ab000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000001',(select id from doc_version),
   'ab000000-0000-4000-8000-000000000002','financial_term','commercial',
   '{"basis":"fixed_monthly","amount":1500,"currency":"CAD"}'::jsonb,
   'clear',1,'Monthly fee: CAD 1500.00'),
  ('ab000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000001',(select id from doc_version),
   'ab000000-0000-4000-8000-000000000002','staffing','operational',
   '{"weekday":1,"localStart":"08:00","localEnd":"16:00","requiredPositions":2}'::jsonb,
   'clear',1,'Staffing: Monday 08:00-16:00, 2 cleaners');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select is((select count(*) from public.contract_documents where id='ab000000-0000-4000-8000-000000000001'),1::bigint,
  'Director reads authorized private metadata');
select is((select count(*) from storage.objects where bucket_id='contract-documents'),1::bigint,
  'Director may fetch a finalized original');
select is((select count(*) from public.contract_extraction_proposals where run_id='ab000000-0000-4000-8000-000000000002'),2::bigint,
  'Director sees commercial and operational proposals');
select public.review_contract_extraction_proposal('ab000000-0000-4000-8000-000000000003',
  'edit','{"basis":"fixed_monthly","amount":1750,"currency":"CAD"}'::jsonb,'corrected source amount');
select is((select amount from public.contract_financial_terms where contract_version_id=(select id from doc_version)),
  1750::numeric,'human edit creates canonical draft amount');
select is((select proposed_value->>'amount' from public.contract_extraction_proposals
  where id='ab000000-0000-4000-8000-000000000003'), '1500',
  'human edit does not overwrite machine proposal');
select is((select reviewed_value->>'amount' from public.contract_extraction_decisions
  where proposal_id='ab000000-0000-4000-8000-000000000003'),'1750',
  'edited human value retains separate provenance');
update public.contract_versions set effective_from='2026-10-01' where id=(select id from doc_version);
update public.contract_financial_terms set effective_from='2026-10-01'
  where contract_version_id=(select id from doc_version);
select throws_ok($$ select public.approve_contract_version((select id from doc_version)) $$,
  'P0001','Resolve material document proposals before approval',
  'unreviewed source proposal blocks Director approval');
select throws_ok($$ select public.review_contract_extraction_proposal(
  'ab000000-0000-4000-8000-000000000003','accept',null,null) $$,
  'P0001','This proposal was already reviewed','decision cannot be silently overwritten');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select is((select count(*) from public.contract_documents where id='ab000000-0000-4000-8000-000000000001'),0::bigint,
  'Area Manager from another site cannot read document');
select is((select count(*) from storage.objects where bucket_id='contract-documents'),0::bigint,
  'Area Manager from another site cannot fetch original');
select throws_ok($$ select public.review_contract_extraction_proposal(
  'ab000000-0000-4000-8000-000000000004','accept',null,null) $$,
  '42501',null,'cross-site review denied');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000007',true);
select is((select count(*) from public.contract_documents where id='ab000000-0000-4000-8000-000000000001'),0::bigint,
  'Operations Manager cannot fetch commercial original');
select is((select count(*) from public.contract_extraction_proposals where run_id='ab000000-0000-4000-8000-000000000002'),1::bigint,
  'Operations Manager sees only operational proposal');
select public.review_contract_extraction_proposal('ab000000-0000-4000-8000-000000000004',
  'accept',null,'operational clause reviewed');
select is((select count(*) from public.contract_staffing_requirements
  where contract_version_id=(select id from doc_version)),0::bigint,
  'Operations review does not write canonical staffing');
select is((select count(*) from storage.objects where bucket_id='contract-documents'),0::bigint,
  'Operations Manager cannot fetch original');

reset role;
select throws_ok($$ update public.contract_extraction_proposals
  set proposed_value='{"amount":9999}'::jsonb
  where id='ab000000-0000-4000-8000-000000000003' $$,
  'P0001','Contract extraction provenance is immutable',
  'machine proposal cannot be changed after review');
select throws_ok($$ delete from public.contract_extraction_decisions
  where proposal_id='ab000000-0000-4000-8000-000000000003' $$,
  'P0001','Contract extraction provenance is immutable',
  'human decision cannot be deleted to reopen a proposal');
select throws_ok($$ insert into public.contract_documents(organization_id,site_id,contract_version_id,
  file_name,declared_mime,detected_mime,claimed_byte_size,byte_size,claimed_sha256,sha256,
  page_count,storage_path,uploaded_by,status,finalized_at)
  values ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
  (select id from doc_version),'same.pdf','application/pdf','application/pdf',100,100,
  repeat('a',64),repeat('a',64),1,'other/path',
  '00000000-0000-4000-8000-000000000001','ready',now()) $$,
  '23505',null,'same finalized hash dedupes within a version');

select * from finish();
rollback;
