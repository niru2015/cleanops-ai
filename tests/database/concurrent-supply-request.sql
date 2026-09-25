begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select public.submit_supply_request(
  '40000000-0000-4000-8000-000000000002',
  'Concurrent synthetic supply request',
  jsonb_build_array(jsonb_build_object(
    'itemId',(select id from public.list_supply_request_items('40000000-0000-4000-8000-000000000002')
      where sku='PPE-NITRILE-M'),
    'packCount',2,'baseUnitsPerPack',1,'pricePerPack',12,
    'priceSource','manual_estimate')),
  'a0170000-0000-4000-8000-000000000020');
select pg_sleep(1);
commit;
