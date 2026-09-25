set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
do $$
declare v_request uuid;
begin
  select id into v_request from public.supply_requests
    where request_key='a0170000-0000-4000-8000-000000000020';
  if v_request is null then raise exception 'concurrent request was not created'; end if;
  if (select count(*) from public.supply_requests
    where request_key='a0170000-0000-4000-8000-000000000020')<>1
    or (select count(*) from public.supply_request_items where request_id=v_request)<>1
    or (select count(*) from public.supply_request_events
      where request_id=v_request and event_kind='submitted')<>1 then
    raise exception 'concurrent retry duplicated the request or its children'; end if;
  perform public.decide_supply_request(v_request,'approved','Concurrent receipt fixture');
  perform public.order_supply_request(v_request,'ORDER-SYN-CONCURRENT');
end $$;
