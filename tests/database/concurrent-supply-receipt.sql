begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',true);
select public.receive_supply_request_item(
  (select i.id from public.supply_request_items i join public.supply_requests r
    on r.id=i.request_id where r.request_key='a0170000-0000-4000-8000-000000000020'),
  1,'a0170000-0000-4000-8000-000000000021');
select pg_sleep(1);
commit;
