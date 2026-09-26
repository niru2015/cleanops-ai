begin;
set local search_path=public,extensions;
select plan(13);

select results_eq($$select relrowsecurity from pg_class where oid='public.equipment_inspections'::regclass$$,
  array[true],'equipment inspections enforce RLS');
select results_eq($$select relrowsecurity from pg_class where oid='public.equipment_maintenance_actions'::regclass$$,
  array[true],'maintenance actions enforce RLS');
select ok(not has_table_privilege('authenticated','public.equipment_inspections','update'),
  'authenticated cannot rewrite source inspections');
select ok(not has_table_privilege('authenticated','public.equipment_maintenance_actions','delete'),
  'authenticated cannot erase maintenance actions');
select ok(not has_table_privilege('authenticated','public.equipment_evidence_links','insert'),
  'private evidence association is RPC only');

create temporary table equipment_fixture as
select a.id asset_id,b.id wrong_site_asset_id,
  'f9999999-9999-4999-8999-999999999999'::uuid report_id,
  null::uuid checklist_id
from public.equipment_assets a cross join public.equipment_assets b
where a.site_id='40000000-0000-4000-8000-000000000001'
  and b.site_id='40000000-0000-4000-8000-000000000002'
order by a.asset_code,b.asset_code limit 1;
grant select,update on equipment_fixture to authenticated;
insert into public.equipment_reports(id,organization_id,site_id,zone_id,idempotency_key,
  equipment_label,issue_description,reported_at,reported_by_worker_id,created_by)
select report_id,'10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  (select id from public.site_zones where site_id='40000000-0000-4000-8000-000000000001' limit 1),
  'equipment-pgtap-test','Synthetic scrubber','Neutral test fault',now(),
  '60000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001'
from equipment_fixture;

set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.link_equipment_report_asset(
  (select report_id from equipment_fixture),(select wrong_site_asset_id from equipment_fixture))$$,
  '22023','asset must belong to the report site','wrong-site asset link denied');
select is(public.link_equipment_report_asset((select report_id from equipment_fixture),
  (select asset_id from equipment_fixture)),(select asset_id from equipment_fixture),
  'existing fault linked to a site asset');
update equipment_fixture set checklist_id=public.create_equipment_checklist_version(
  (select model_id from public.equipment_assets where id=equipment_fixture.asset_id),
  'customer_approved','Synthetic test procedure TEST-CARE-2','["Record visible condition"]'::jsonb);
select is((select version_number from public.equipment_checklist_versions
  where id=(select checklist_id from equipment_fixture)),1,
  'approved checklist version is persisted');
select is((select count(*) from public.equipment_inspections where asset_id=(select asset_id from equipment_fixture)),
  0::bigint,'missing inspection remains visibly missing before review');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
select ok(public.record_equipment_inspection((select asset_id from equipment_fixture),
  (select checklist_id from equipment_fixture),'00000000-0000-4000-8000-000000000004',
  'follow_up_required','{"visible":"needs review"}'::jsonb,
  'Neutral follow-up',now()-interval '1 hour') is not null,
  'supervisor inspection records a separate operator and overdue follow-up');
select public.record_equipment_maintenance_action((select report_id from equipment_fixture),
  'pgtap-triage','triaged','Fault reviewed');
select public.record_equipment_maintenance_action((select report_id from equipment_fixture),
  'pgtap-request','maintenance_requested','Maintenance requested');
select throws_ok($$select public.record_equipment_maintenance_action(
  (select report_id from equipment_fixture),'pgtap-false-complete','work_completed','Work completed')$$,
  '42501','authorized maintenance actor required','supervisor cannot assert completed maintenance');
select is((select state::text from public.equipment_reports where id=(select report_id from equipment_fixture)),
  'maintenance_requested','fault remains open without verified work and return approval');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.move_equipment_asset((select asset_id from equipment_fixture),
  '40000000-0000-4000-8000-000000000002','Move with open fault')$$,
  '22023','resolve or review open asset faults before movement',
  'open fault cannot be stranded by a site movement');

select * from finish();
rollback;
