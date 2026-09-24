begin;
set local search_path = public, extensions;
select plan(9);

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);

create temp table zone_review_contract as
  with inserted as (
    insert into public.contracts(organization_id,site_id,client_id,code,name,created_by)
    values ('10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'ZONE-REVIEW-UAT','Synthetic zone review',auth.uid()) returning id
  ) select id from inserted;
create temp table zone_review_version as
  with inserted as (
    insert into public.contract_versions(organization_id,site_id,contract_id,version_number,
      source_type,created_by)
    select '10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',id,1,'manual',auth.uid()
    from zone_review_contract returning id
  ) select id from inserted;
create temp table zone_review_obligation as
  with inserted as (
    insert into public.contract_obligations(organization_id,site_id,contract_version_id,
      name,recurrence,source_reference)
    select '10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',id,
      'Synthetic quarterly deep clean','quarterly','document-proposal:synthetic:page-1'
    from zone_review_version returning id
  ) select id from inserted;

select is((select zone_id from public.contract_obligations where id=(select id from zone_review_obligation)),
  null::uuid,'extracted obligation starts without a zone');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$ select public.assign_contract_obligation_zone((select id from zone_review_obligation),
      '50000000-0000-4000-8000-000000000001') $$,
  '42501',null,'Supervisor cannot assign a contract obligation zone');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
select throws_ok(
  $$ select public.assign_contract_obligation_zone((select id from zone_review_obligation),
      '50000000-0000-4000-8000-000000000001') $$,
  '42501',null,'Area Manager cannot edit a contract outside granted sites');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$ select public.assign_contract_obligation_zone((select id from zone_review_obligation),
      '50000000-0000-4000-8000-000000000002') $$,
  '42501',null,'Director cannot assign a zone from another site');
select lives_ok(
  $$ select public.assign_contract_obligation_zone((select id from zone_review_obligation),
      '50000000-0000-4000-8000-000000000001') $$,
  'Director can resolve the same-site zone');
select is((select zone_id from public.contract_obligations where id=(select id from zone_review_obligation)),
  '50000000-0000-4000-8000-000000000001'::uuid,'source-linked obligation now has the site zone');
select is((select source_reference from public.contract_obligations where id=(select id from zone_review_obligation)),
  'document-proposal:synthetic:page-1','zone correction preserves source provenance');
select is((select count(*) from public.contract_events where event_type='obligation_zone_assigned'
    and details->>'obligation_id'=(select id::text from zone_review_obligation)),
  1::bigint,'zone correction appends one contract audit event');
select is((select actor_id from public.contract_events where event_type='obligation_zone_assigned'
    and details->>'obligation_id'=(select id::text from zone_review_obligation)),
  '00000000-0000-4000-8000-000000000001'::uuid,'audit event records the Director actor');

select * from finish();
rollback;
