begin;
set local search_path = public, extensions;
select plan(18);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
create temp table return_contract as select public.create_manual_contract(
  '40000000-0000-4000-8000-000000000001','RETURN-UAT','Synthetic review return') as id;
create temp table return_version as select id from public.contract_versions
  where contract_id=(select id from return_contract);

reset role;
insert into public.contract_documents(id,organization_id,site_id,contract_version_id,
  file_name,declared_mime,detected_mime,claimed_byte_size,byte_size,claimed_sha256,sha256,
  page_count,storage_path,uploaded_by,status,finalized_at)
values ('ac000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',(select id from return_version),
  'synthetic.pdf','application/pdf','application/pdf',100,100,repeat('b',64),repeat('b',64),1,
  'tenant/site/version/return-review.pdf','00000000-0000-4000-8000-000000000001','ready',now());
insert into storage.objects(bucket_id,name)
  values ('contract-documents','tenant/site/version/return-review.pdf');
insert into public.contract_extraction_runs(id,organization_id,site_id,contract_version_id,
  document_id,provider,provider_version,schema_version,status,created_by)
values ('ac000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',(select id from return_version),
  'ac000000-0000-4000-8000-000000000001','deterministic','1',1,'succeeded',
  '00000000-0000-4000-8000-000000000001');
insert into public.contract_extraction_proposals(id,organization_id,site_id,contract_version_id,
  run_id,field_key,category,proposed_value,business_state,source_page,source_span)
values ('ac000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',(select id from return_version),
  'ac000000-0000-4000-8000-000000000002','contract_name','identity',
  '"Synthetic cited name"'::jsonb,'clear',1,'Contract name: Synthetic cited name');

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$ select public.submit_contract_version((select id from return_version)) $$,
  'P0001','Resolve material document proposals before submission',
  'submission rejects an undecided material source proposal');
select lives_ok(
  $$ select public.review_contract_extraction_proposal(
    'ac000000-0000-4000-8000-000000000003','accept') $$,
  'Director can review the source proposal while draft');
select lives_ok(
  $$ select public.submit_contract_version((select id from return_version)) $$,
  'reviewed version can be submitted');
select is((select state from public.contract_versions where id=(select id from return_version)),
  'in_review','first submission changes the same version to in_review');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$ select public.return_contract_version_to_draft((select id from return_version),
    'Finish source review') $$,
  '42501',null,'Supervisor cannot return a submitted version');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select throws_ok(
  $$ select public.return_contract_version_to_draft((select id from return_version),
    'Finish source review') $$,
  '42501',null,'Area Manager cannot return a contract outside assigned sites');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$ select public.return_contract_version_to_draft((select id from return_version),'no') $$,
  'P0001','A revision reason of 5 to 500 characters is required',
  'return requires a useful revision reason');
select lives_ok(
  $$ select public.return_contract_version_to_draft((select id from return_version),
    'Finish source review') $$,
  'Director can return the submitted version to draft');
select is((select state from public.contract_versions where id=(select id from return_version)),
  'draft','return preserves the same contract version');
select is((select actor_id::text || ':' || (details->>'reason') from public.contract_events
    where contract_version_id=(select id from return_version) and event_type='returned_to_draft'),
  '00000000-0000-4000-8000-000000000001:Finish source review',
  'return event records actor and reason');
select lives_ok(
  $$ select public.submit_contract_version((select id from return_version)) $$,
  'revised version can be submitted again');
select is((select count(*) from public.contract_events
    where contract_version_id=(select id from return_version) and event_type='submitted'),
  2::bigint,'review cycles append distinct submission events');
select lives_ok(
  $$ select public.return_contract_version_to_draft((select id from return_version),
    'Second review cycle') $$,
  'a second review cycle can return safely');
select is((select count(*) from public.contract_events
    where contract_version_id=(select id from return_version) and event_type='returned_to_draft'),
  2::bigint,'each return has a distinct audit event');
select throws_ok(
  $$ select public.return_contract_version_to_draft((select id from return_version),
    'Not submitted now') $$,
  '42501',null,'a draft cannot be returned again');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
create temp table area_return_contract as select public.create_manual_contract(
  '40000000-0000-4000-8000-000000000002','AREA-RETURN-UAT','Assigned site review') as id;
create temp table area_return_version as select id from public.contract_versions
  where contract_id=(select id from area_return_contract);
select public.submit_contract_version((select id from area_return_version));
select lives_ok(
  $$ select public.return_contract_version_to_draft((select id from area_return_version),
    'Revise assigned site draft') $$,
  'Area Manager can return an assigned-site version');

reset role;
update public.contract_versions set state='approved' where id=(select id from return_version);
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$ select public.return_contract_version_to_draft((select id from return_version),
    'Cannot revise approved') $$,
  '42501',null,'approved versions cannot return to draft');
reset role;
update public.contract_versions set state='active' where id=(select id from return_version);
set local role authenticated;
select throws_ok(
  $$ select public.return_contract_version_to_draft((select id from return_version),
    'Cannot revise active') $$,
  '42501',null,'active versions cannot return to draft');

select * from finish();
rollback;
