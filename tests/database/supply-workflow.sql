begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);

do $$
declare v_item uuid; v_request uuid; v_duplicate uuid; v_count integer;
begin
  select id into v_item from public.list_supply_request_items('40000000-0000-4000-8000-000000000001') limit 1;
  if v_item is null then raise exception 'supervisor cannot choose an active supply item'; end if;
  v_request := public.submit_supply_request(
    '40000000-0000-4000-8000-000000000001','Night shift cleaning supplies',
    jsonb_build_array(jsonb_build_object('itemId',v_item,'packCount',12,
      'baseUnitsPerPack',5,'pricePerPack',35,'priceSource','supplier_quote',
      'priceReference','synthetic quote SQ-017')),
    'a0170000-0000-4000-8000-000000000001');
  v_duplicate := public.submit_supply_request(
    '40000000-0000-4000-8000-000000000001','Night shift cleaning supplies',
    jsonb_build_array(jsonb_build_object('itemId',v_item,'packCount',12,
      'baseUnitsPerPack',5,'pricePerPack',35,'priceSource','supplier_quote',
      'priceReference','synthetic quote SQ-017')),
    'a0170000-0000-4000-8000-000000000001');
  if v_request<>v_duplicate then raise exception 'retry created another request'; end if;
  if not exists(select 1 from public.supply_request_items
    where request_id=v_request and base_quantity=60 and requested_amount=420) then
    raise exception 'pack conversion or requested amount is wrong'; end if;
  begin
    perform public.decide_supply_request(v_request,'approved','');
    raise exception 'supervisor approved own request';
  exception when insufficient_privilege then null; end;
  begin
    perform public.submit_supply_request('40000000-0000-4000-8000-000000000002',
      'Wrong site request',jsonb_build_array(jsonb_build_object('itemId',v_item,
      'packCount',1,'baseUnitsPerPack',1,'pricePerPack',1,'priceSource','manual_estimate')),
      'a0170000-0000-4000-8000-000000000002');
    raise exception 'supervisor submitted to forbidden site';
  exception when insufficient_privilege then null; end;
  select count(*) into v_count from public.supply_requests;
  if v_count<>1 then raise exception 'site supervisor sees % requests',v_count; end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',true);
do $$
declare v_request uuid;
begin
  select id into v_request from public.supply_requests
    where request_key='a0170000-0000-4000-8000-000000000001';
  if v_request is not null then raise exception 'area manager saw request outside grant'; end if;
  begin
    perform public.list_site_supply_stock('40000000-0000-4000-8000-000000000001');
    raise exception 'area manager read stock outside grant';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000006',true);
do $$
begin
  begin
    perform public.list_site_supply_stock('40000000-0000-4000-8000-000000000001');
    raise exception 'other-tenant Director read site stock';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000004',true);
do $$
begin
  begin
    perform public.list_supply_request_items('40000000-0000-4000-8000-000000000001');
    raise exception 'Cleaner read operational supply catalogue';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000005',true);
do $$
begin
  begin
    perform public.list_supply_request_items('40000000-0000-4000-8000-000000000001');
    raise exception 'Client viewer read operational supply catalogue';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
do $$
declare v_request uuid; v_item uuid;
begin
  select id into v_request from public.supply_requests
    where request_key='a0170000-0000-4000-8000-000000000001';
  select id into v_item from public.supply_request_items where request_id=v_request;
  perform public.decide_supply_request(v_request,'approved','Approved for synthetic site');
  perform public.revise_supply_request_item(v_item,(select inventory_item_id from public.supply_request_items where id=v_item),
    12,5,35,'supplier_quote','revised synthetic quote');
  if (select state from public.supply_requests where id=v_request)<>'requested' then
    raise exception 'revision did not require renewed approval'; end if;
  perform public.decide_supply_request(v_request,'approved','Reapproved after revision');
  perform public.order_supply_request(v_request,'ORDER-SYN-017');
  if (select count(*) from public.supply_request_events where request_id=v_request and event_kind='approved')<>2 then
    raise exception 'approval history was not retained'; end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
do $$
declare v_request uuid; v_item uuid; v_inventory_item uuid; v_first uuid; v_second uuid;
begin
  select id into v_request from public.supply_requests
    where request_key='a0170000-0000-4000-8000-000000000001';
  select id,inventory_item_id into v_item,v_inventory_item from public.supply_request_items where request_id=v_request;
  v_first := public.receive_supply_request_item(v_item,30,'a0170000-0000-4000-8000-000000000003');
  if public.receive_supply_request_item(v_item,30,'a0170000-0000-4000-8000-000000000003')<>v_first then
    raise exception 'receipt retry created another receipt'; end if;
  if (select state from public.supply_requests where id=v_request)<>'partially_received' then
    raise exception 'partial receipt state missing'; end if;
  v_second := public.receive_supply_request_item(v_item,30,'a0170000-0000-4000-8000-000000000004');
  if v_second=v_first or (select state from public.supply_requests where id=v_request)<>'received' then
    raise exception 'final receipt state missing'; end if;
  if public.list_supply_stock_balance('40000000-0000-4000-8000-000000000001',v_inventory_item)<>60 then
    raise exception 'receipt stock balance is not 60'; end if;
  if (select count(*) from public.list_site_supply_stock('40000000-0000-4000-8000-000000000001')
      where inventory_item_id=v_inventory_item and on_hand=60)<>1 then
    raise exception 'supervisor stock summary is wrong'; end if;
  begin
    perform public.record_supply_stock_movement('40000000-0000-4000-8000-000000000001',
      v_inventory_item,'issue',61,'a0170000-0000-4000-8000-000000000005','Too much issue');
    raise exception 'negative stock was accepted';
  exception when invalid_parameter_value then null; end;
  perform public.record_supply_stock_movement('40000000-0000-4000-8000-000000000001',
    v_inventory_item,'issue',10,'a0170000-0000-4000-8000-000000000006','Issued for site cleaning');
  perform public.record_supply_stock_movement('40000000-0000-4000-8000-000000000001',
    v_inventory_item,'return',2,'a0170000-0000-4000-8000-000000000007','Unused returned units');
  if public.list_supply_stock_balance('40000000-0000-4000-8000-000000000001',v_inventory_item)<>52 then
    raise exception 'issue/return stock arithmetic is wrong'; end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
do $$
declare v_item uuid;
begin
  select inventory_item_id into v_item from public.supply_request_items limit 1;
  perform public.record_supply_stock_movement('40000000-0000-4000-8000-000000000001',
    v_item,'transfer',5,'a0170000-0000-4000-8000-000000000008','Transfer to East site',
    '40000000-0000-4000-8000-000000000002');
  if public.list_supply_stock_balance('40000000-0000-4000-8000-000000000002',v_item)<>5 then
    raise exception 'transfer target balance is wrong'; end if;
  perform public.record_supply_stock_movement('40000000-0000-4000-8000-000000000001',
    v_item,'count',46,'a0170000-0000-4000-8000-000000000009','Counted shelf stock');
  if public.list_supply_stock_balance('40000000-0000-4000-8000-000000000001',v_item)<>46 then
    raise exception 'count adjustment did not reconcile'; end if;
  if not exists(select 1 from public.list_supply_site_comparison(date_trunc('month',current_date)::date)
    where site_id='40000000-0000-4000-8000-000000000001' and inventory_item_id=v_item
      and requested_amount=420 and approved_amount=420 and approved_expense=0) then
    raise exception 'site supply comparison is wrong'; end if;
  begin
    update public.inventory_transactions set quantity=2 where movement_key='a0170000-0000-4000-8000-000000000006';
    raise exception 'workflow stock movement was editable';
  exception when invalid_parameter_value then null; end;
end $$;

do $$
declare v_item uuid; v_request uuid; v_request_item uuid;
begin
  select id into v_item from public.list_supply_request_items('40000000-0000-4000-8000-000000000001')
    where sku='CHEM-NEUTRAL-5L';
  perform public.record_supply_stock_movement('40000000-0000-4000-8000-000000000001',
    v_item,'opening',24,'a0170000-0000-4000-8000-000000000010','Verified opening stock');
  v_request := public.submit_supply_request('40000000-0000-4000-8000-000000000001',
    'Twelve neutral cleaner containers',jsonb_build_array(jsonb_build_object(
      'itemId',v_item,'packCount',12,'baseUnitsPerPack',1,'pricePerPack',35,
      'priceSource','supplier_quote','priceReference','synthetic quote SQ-018')),
    'a0170000-0000-4000-8000-000000000011');
  perform public.decide_supply_request(v_request,'approved','Synthetic approval');
  perform public.order_supply_request(v_request,'ORDER-SYN-018');
  select id into v_request_item from public.supply_request_items where request_id=v_request;
  perform public.receive_supply_request_item(v_request_item,12,'a0170000-0000-4000-8000-000000000012');
  perform public.record_supply_stock_movement('40000000-0000-4000-8000-000000000001',
    v_item,'issue',10,'a0170000-0000-4000-8000-000000000013','Issued for site work');
  if public.list_supply_stock_balance('40000000-0000-4000-8000-000000000001',v_item)<>26 then
    raise exception 'opening 24 + received 12 - issued 10 did not close at 26'; end if;
  if not exists(select 1 from public.supply_request_items where id=v_request_item
    and requested_amount=420 and base_quantity=12) then
    raise exception 'twelve containers at CAD35 did not produce CAD420'; end if;
end $$;

set local role postgres;
update public.supply_requests set created_at=date_trunc('month',current_date)-interval '1 month'
  where request_key='a0170000-0000-4000-8000-000000000011';
set local role authenticated;
do $$
declare v_item uuid;
begin
  select id into v_item from public.list_supply_request_items('40000000-0000-4000-8000-000000000001')
    where sku='CHEM-NEUTRAL-5L';
  if not exists(select 1 from public.list_supply_site_comparison(date_trunc('month',current_date)::date)
    where inventory_item_id=v_item and site_id='40000000-0000-4000-8000-000000000001'
      and requested_amount=0 and approved_amount=0 and received_base_quantity=12) then
    raise exception 'receipt in a later month disappeared or duplicated request estimate'; end if;
end $$;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',true);
set local role postgres;
update public.member_site_access set ends_at=now()-interval '1 day'
  where id='41000000-0000-4000-8000-000000000001';
set local role authenticated;
do $$
begin
  begin
    perform public.list_site_supply_stock('40000000-0000-4000-8000-000000000001');
    raise exception 'revoked Supervisor grant retained stock access';
  exception when insufficient_privilege then null; end;
end $$;

set local role anon;
do $$
begin
  begin
    perform public.list_site_supply_stock('40000000-0000-4000-8000-000000000001');
    raise exception 'anonymous caller read site stock';
  exception when insufficient_privilege or undefined_function then null; end;
end $$;

reset role;
do $$
begin
  if exists(select 1 from private.finance_operational_records
    where organization_id='10000000-0000-4000-8000-000000000001'
      and site_id='40000000-0000-4000-8000-000000000001'
      and entity_type='inventory_issue' and amount>0
      and entity_id in (select id from public.inventory_transactions
        where movement_key='a0170000-0000-4000-8000-000000000006')) then
    raise exception 'stock issue became an unapproved finance cost'; end if;
end $$;

rollback;
