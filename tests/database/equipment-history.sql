begin;

-- A separate manager approves return to service after the Director records work.
insert into auth.users(id,email,raw_user_meta_data)
values('00000000-0000-4000-8000-000000000007','operations-equipment@cleanops.example','{}');
insert into public.memberships(id,organization_id,user_id,role)
values('20000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000007','operations_manager');

create temporary table equipment_case(asset_id uuid,other_asset_id uuid,report_id uuid,
  checklist_id uuid,inspection_id uuid,action_id uuid,expense_id uuid);
grant select,update on equipment_case to authenticated;
insert into equipment_case(asset_id,other_asset_id,report_id,expense_id)
select a.id,b.id,'f1111111-1111-4111-8111-111111111111'::uuid,'e1111111-1111-4111-8111-111111111111'::uuid
from public.equipment_assets a cross join public.equipment_assets b
where a.site_id='40000000-0000-4000-8000-000000000001'
  and b.site_id='40000000-0000-4000-8000-000000000002'
order by a.asset_code,b.asset_code limit 1;
do $$ begin if (select count(*) from equipment_case)<>1 then raise exception 'equipment fixtures missing'; end if; end $$;
insert into public.equipment_reports(id,organization_id,site_id,zone_id,idempotency_key,
  equipment_label,issue_description,reported_at,reported_by_worker_id,created_by)
select c.report_id,'10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  (select id from public.site_zones where site_id='40000000-0000-4000-8000-000000000001' limit 1),
  'equipment-history-test','Synthetic scrubber','Scrubber pulling right; cause unknown',now(),
  '60000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001'
from equipment_case c;

insert into public.integration_accounts(id,organization_id,site_id,provider,external_account_id,display_name)
values('c9999999-9999-4999-8999-999999999999','10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001','mock_legacy_whatsapp_group','equipment-test',
  'Synthetic equipment evidence account');
insert into public.integration_webhook_events(id,organization_id,integration_account_id,dedupe_key,payload,payload_sha256)
values('d9999999-9999-4999-8999-999999999999','10000000-0000-4000-8000-000000000001',
  'c9999999-9999-4999-8999-999999999999','equipment-evidence-test','{}',repeat('a',64));
insert into public.external_messages(id,organization_id,integration_account_id,integration_event_id,
  external_message_id,external_thread_id,sender_id,occurred_at,received_at)
values('e9999999-9999-4999-8999-999999999999','10000000-0000-4000-8000-000000000001',
  'c9999999-9999-4999-8999-999999999999','d9999999-9999-4999-8999-999999999999',
  'equipment-photo-test','equipment-thread-test','synthetic-sender',now(),now());
insert into public.task_evidence(id,organization_id,integration_account_id,external_message_id,
  media_external_id,site_id,processing_status,storage_path,received_at)
values('f9999999-9999-4999-8999-999999999999','10000000-0000-4000-8000-000000000001',
  'c9999999-9999-4999-8999-999999999999','e9999999-9999-4999-8999-999999999999',
  'equipment-photo','40000000-0000-4000-8000-000000000001','ready',
  'synthetic/equipment-history-test.png',now());

insert into public.finance_intake_items(id,organization_id,site_id,source_kind,submitted_by)
values('e2222222-2222-4222-8222-222222222222','10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001','app','00000000-0000-4000-8000-000000000001');
insert into public.expense_claims(id,organization_id,intake_id,site_id,vendor,expense_date,payment_method,
  currency,total,category,status,approved_by,approved_at)
values('e3333333-3333-4333-8333-333333333333','10000000-0000-4000-8000-000000000001',
  'e2222222-2222-4222-8222-222222222222','40000000-0000-4000-8000-000000000001',
  'Synthetic repair vendor',current_date,'supplier_invoice','CAD',125.00,'equipment_repair','posted',
  '00000000-0000-4000-8000-000000000001',now());
insert into public.expense_allocations(id,organization_id,claim_id,site_id,amount)
values('e4444444-4444-4444-8444-444444444444','10000000-0000-4000-8000-000000000001',
  'e3333333-3333-4333-8333-333333333333','40000000-0000-4000-8000-000000000001',125.00);
insert into public.expense_postings(id,organization_id,claim_id,claim_revision,allocation_id,site_id,
  category,currency,amount,approved_by)
values('e1111111-1111-4111-8111-111111111111','10000000-0000-4000-8000-000000000001',
  'e3333333-3333-4333-8333-333333333333',1,'e4444444-4444-4444-8444-444444444444',
  '40000000-0000-4000-8000-000000000001','equipment_repair','CAD',125.00,
  '00000000-0000-4000-8000-000000000001');

set local role authenticated;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
do $$ begin
  perform public.link_equipment_report_asset((select report_id from equipment_case),(select other_asset_id from equipment_case));
  raise exception 'wrong-site asset link was accepted';
exception when sqlstate '22023' then null; end $$;
select public.link_equipment_report_asset((select report_id from equipment_case),(select asset_id from equipment_case));
do $$ begin
  if (select asset_id from public.equipment_reports where id=(select report_id from equipment_case)) is null then
    raise exception 'asset link missing'; end if;
  if has_table_privilege('authenticated','public.equipment_inspections','update') or
     has_table_privilege('authenticated','public.equipment_maintenance_actions','delete') then
    raise exception 'source history is directly mutable'; end if;
end $$;

update equipment_case set checklist_id=public.create_equipment_checklist_version(
  (select model_id from public.equipment_assets where id=equipment_case.asset_id),
  'customer_approved','Synthetic test procedure TEST-CARE-1','["Record visible condition"]'::jsonb);
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
update equipment_case set inspection_id=public.record_equipment_inspection(asset_id,checklist_id,
  '00000000-0000-4000-8000-000000000004','follow_up_required','{"visible":"pulling right"}'::jsonb,
  'Follow up the neutral observation',now()-interval '1 hour');
select public.link_equipment_evidence('f9999999-9999-4999-8999-999999999999',
  (select inspection_id from equipment_case),null);
do $$ begin
  if not exists(select 1 from public.equipment_inspections where id=(select inspection_id from equipment_case)
    and inspector_user_id='00000000-0000-4000-8000-000000000002'
    and operator_user_id='00000000-0000-4000-8000-000000000004'
    and follow_up_due_at<now()) then raise exception 'inspection provenance or overdue state missing'; end if;
end $$;
select public.record_equipment_maintenance_action((select report_id from equipment_case),
  'test-triage','triaged','Observed fault reviewed');
select public.record_equipment_maintenance_action((select report_id from equipment_case),
  'test-request','maintenance_requested','Maintenance review requested');
do $$ begin
  perform public.record_equipment_maintenance_action((select report_id from equipment_case),
    'test-complete-denied','work_completed','Work purportedly completed');
  raise exception 'supervisor completed maintenance without authority';
exception when sqlstate '42501' then null; end $$;

set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
update equipment_case set action_id=public.record_equipment_maintenance_action(report_id,
  'test-completed','work_completed','Synthetic work completed with source notes','INV-TEST-1');
update equipment_case set action_id=public.link_equipment_repair_cost(action_id,expense_id,'INV-TEST-1');
do $$ begin
  if public.link_equipment_repair_cost((select id from public.equipment_maintenance_actions
       where report_id=(select report_id from equipment_case) and action_kind='work_completed'),
       (select expense_id from equipment_case),'INV-TEST-1')<>(select action_id from equipment_case) then
    raise exception 'duplicate invoice link was not idempotent'; end if;
  if (select count(*) from public.equipment_repair_cost_links where expense_posting_id=(select expense_id from equipment_case))<>1 then
    raise exception 'duplicate repair cost'; end if;
end $$;
do $$ begin
  perform public.record_equipment_maintenance_action((select report_id from equipment_case),
    'test-rts-self','return_to_service','Approve return after own work');
  raise exception 'maintenance actor approved own return';
exception when sqlstate '22023' then null; end $$;

set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000007';
select public.record_equipment_maintenance_action((select report_id from equipment_case),
  'test-rts','return_to_service','Independent return-to-service approval');
do $$ begin
  if (select state from public.equipment_reports where id=(select report_id from equipment_case))<>'resolved' then
    raise exception 'fault lifecycle did not resolve'; end if;
end $$;

set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
select public.move_equipment_asset((select asset_id from equipment_case),
  '40000000-0000-4000-8000-000000000002','Synthetic transfer for history test');
do $$ begin
  if (select site_id from public.equipment_reports where id=(select report_id from equipment_case))<>
     '40000000-0000-4000-8000-000000000001' then raise exception 'historical report site was rewritten'; end if;
  if (select site_id from public.equipment_repair_cost_links where expense_posting_id=(select expense_id from equipment_case))<>
     '40000000-0000-4000-8000-000000000001' then raise exception 'historical repair cost site was rewritten'; end if;
  if (select count(*) from public.equipment_asset_site_history where asset_id=(select asset_id from equipment_case))<>2 then
    raise exception 'asset movement history incomplete'; end if;
end $$;

set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
do $$ begin
  if exists(select 1 from public.equipment_assets where id=(select asset_id from equipment_case)) then
    raise exception 'old-site supervisor still sees moved asset'; end if;
end $$;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000000003';
do $$ begin
  if not exists(select 1 from public.equipment_assets where id=(select asset_id from equipment_case)) then
    raise exception 'new-site Area Manager cannot see current asset'; end if;
  if exists(select 1 from public.equipment_repair_cost_links) then
    raise exception 'wrong-site manager sees historical repair costs'; end if;
  if exists(select 1 from public.equipment_evidence_links) then
    raise exception 'wrong-site manager sees historical private evidence'; end if;
end $$;

rollback;
