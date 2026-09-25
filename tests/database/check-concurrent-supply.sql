do $$
declare v_request uuid; v_item uuid; v_inventory_item uuid;
begin
  select id into v_request from public.supply_requests
    where request_key='a0170000-0000-4000-8000-000000000020';
  select id,inventory_item_id into v_item,v_inventory_item from public.supply_request_items
    where request_id=v_request;
  if (select count(*) from public.supply_receipts
    where request_id=v_request and receipt_key='a0170000-0000-4000-8000-000000000021')<>1
    or (select count(*) from public.inventory_transactions
      where organization_id='10000000-0000-4000-8000-000000000001'
        and movement_key='a0170000-0000-4000-8000-000000000021')<>1
    or (select received_base_quantity from public.supply_request_items where id=v_item)<>1
    or (select count(*) from public.supply_request_events
      where request_id=v_request and event_kind='received')<>1 then
    raise exception 'concurrent receipt retry duplicated stock or receipt history'; end if;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000003',false);
do $$
begin
  if exists(select 1 from public.list_supply_site_comparison(date_trunc('month',current_date)::date)
    where site_id='40000000-0000-4000-8000-000000000001') then
    raise exception 'Area Manager comparison leaked a forbidden site'; end if;
  if not exists(select 1 from public.list_supply_site_comparison(date_trunc('month',current_date)::date)
    where site_id='40000000-0000-4000-8000-000000000002'
      and requested_amount=24 and approved_amount=24 and received_base_quantity=1
      and approved_expense=0 and approved_labour_hours is null) then
    raise exception 'Area Manager comparison lost their permitted site or N/A denominator'; end if;
end $$;
