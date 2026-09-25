-- CLEAN-017: operational supply requests and stock, distinct from finance expense posting.
create table public.supply_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  request_key uuid not null,
  source_message_id uuid,
  requested_by uuid not null references auth.users(id),
  purpose text not null check (char_length(purpose) between 3 and 500),
  currency text not null default 'CAD' check (currency='CAD'),
  state text not null default 'requested' check (state in ('requested','approved','rejected','ordered','partially_received','received','cancelled')),
  version integer not null default 1 check (version > 0),
  supply_responsibility text not null default 'unknown' check (supply_responsibility in ('included','reimbursable','client_provided','mixed','unknown')),
  decision_reason text,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  order_reference text,
  ordered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,site_id,id),
  unique (organization_id,request_key),
  unique (organization_id,source_message_id),
  foreign key (organization_id,site_id) references public.sites(organization_id,id),
  foreign key (organization_id,source_message_id) references public.external_messages(organization_id,id)
);

create table public.supply_request_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  request_id uuid not null,
  inventory_item_id uuid not null,
  pack_count numeric(12,3) not null check (pack_count > 0),
  base_units_per_pack numeric(12,3) not null check (base_units_per_pack > 0),
  base_quantity numeric(15,3) generated always as (pack_count * base_units_per_pack) stored,
  price_per_pack numeric(12,2) not null check (price_per_pack >= 0),
  requested_amount numeric(14,2) generated always as (round(pack_count * price_per_pack,2)) stored,
  price_source text not null check (price_source in ('supplier_quote','catalogue','invoice','manual_estimate')),
  price_reference text,
  received_base_quantity numeric(15,3) not null default 0 check (received_base_quantity >= 0),
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,site_id,id),
  unique (organization_id,site_id,request_id,id),
  foreign key (organization_id,site_id,request_id) references public.supply_requests(organization_id,site_id,id),
  foreign key (organization_id,inventory_item_id) references public.inventory_items(organization_id,id),
  check (received_base_quantity <= base_quantity),
  check (price_source <> 'manual_estimate' or price_reference is null or char_length(price_reference) <= 200)
);

create table public.supply_request_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  request_id uuid not null,
  event_kind text not null check (event_kind in ('submitted','revised','approved','rejected','ordered','received','cancelled')),
  actor_id uuid not null references auth.users(id),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (organization_id,site_id,request_id) references public.supply_requests(organization_id,site_id,id)
);

alter table public.inventory_transactions
  drop constraint if exists inventory_transactions_transaction_type_check;
alter table public.inventory_transactions
  add constraint inventory_transactions_transaction_type_check
    check (transaction_type in ('receipt','issue','adjustment','count','opening','transfer_in','transfer_out','return','adjustment_in','adjustment_out')),
  add column supply_request_item_id uuid,
  add column movement_key uuid,
  add column movement_leg text,
  add column recorded_by uuid references auth.users(id),
  add constraint inventory_transactions_supply_item_fk
    foreign key (organization_id,site_id,supply_request_item_id)
    references public.supply_request_items(organization_id,site_id,id),
  add constraint inventory_transactions_movement_leg_check
    check ((movement_key is null) = (movement_leg is null));
create unique index inventory_transactions_movement_key
  on public.inventory_transactions(organization_id,movement_key,movement_leg)
  where movement_key is not null;

create table public.supply_receipts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  request_id uuid not null,
  request_item_id uuid not null,
  receipt_key uuid not null,
  base_quantity numeric(15,3) not null check (base_quantity > 0),
  inventory_transaction_id uuid not null,
  received_by uuid not null references auth.users(id),
  received_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,site_id,id),
  unique (organization_id,receipt_key),
  unique (organization_id,inventory_transaction_id),
  foreign key (organization_id,site_id,request_id) references public.supply_requests(organization_id,site_id,id),
  foreign key (organization_id,site_id,request_id,request_item_id)
    references public.supply_request_items(organization_id,site_id,request_id,id),
  foreign key (organization_id,inventory_transaction_id) references public.inventory_transactions(organization_id,id)
);

create table public.supply_stock_counts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  inventory_item_id uuid not null,
  count_key uuid not null,
  previous_quantity numeric(15,3) not null,
  counted_quantity numeric(15,3) not null check (counted_quantity >= 0),
  adjustment_transaction_id uuid,
  counted_by uuid not null references auth.users(id),
  reason text not null check (char_length(reason) between 3 and 500),
  counted_at timestamptz not null default now(),
  unique (organization_id,count_key),
  foreign key (organization_id,site_id) references public.sites(organization_id,id),
  foreign key (organization_id,inventory_item_id) references public.inventory_items(organization_id,id),
  foreign key (organization_id,adjustment_transaction_id) references public.inventory_transactions(organization_id,id)
);

create table public.supply_expense_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  receipt_id uuid not null,
  expense_posting_id uuid not null,
  linked_by uuid not null references auth.users(id),
  linked_at timestamptz not null default now(),
  unique (organization_id,receipt_id),
  unique (organization_id,expense_posting_id),
  foreign key (organization_id,site_id,receipt_id) references public.supply_receipts(organization_id,site_id,id),
  foreign key (organization_id,expense_posting_id) references public.expense_postings(organization_id,id),
  foreign key (organization_id,site_id) references public.sites(organization_id,id)
);

create index supply_requests_site_state on public.supply_requests(organization_id,site_id,state,created_at desc);
create index supply_request_items_request on public.supply_request_items(organization_id,request_id);
create index supply_receipts_request on public.supply_receipts(organization_id,request_id,received_at desc);
create index supply_stock_counts_item on public.supply_stock_counts(organization_id,site_id,inventory_item_id,counted_at desc);

alter table public.supply_requests enable row level security;
alter table public.supply_request_items enable row level security;
alter table public.supply_request_events enable row level security;
alter table public.supply_receipts enable row level security;
alter table public.supply_stock_counts enable row level security;
alter table public.supply_expense_links enable row level security;

revoke all on public.supply_requests,public.supply_request_items,public.supply_request_events,
  public.supply_receipts,public.supply_stock_counts,public.supply_expense_links from public,anon,authenticated;
grant select on public.supply_requests,public.supply_request_items,public.supply_request_events,
  public.supply_receipts,public.supply_stock_counts to authenticated;
grant select on public.supply_expense_links to authenticated;
grant all on public.supply_requests,public.supply_request_items,public.supply_request_events,
  public.supply_receipts,public.supply_stock_counts,public.supply_expense_links to service_role;

create policy supply_requests_read on public.supply_requests for select to authenticated
  using (private.can_manage_site(organization_id,site_id));
create policy supply_request_items_read on public.supply_request_items for select to authenticated
  using (private.can_manage_site(organization_id,site_id));
create policy supply_request_events_read on public.supply_request_events for select to authenticated
  using (private.can_manage_site(organization_id,site_id));
create policy supply_receipts_read on public.supply_receipts for select to authenticated
  using (private.can_manage_site(organization_id,site_id));
create policy supply_stock_counts_read on public.supply_stock_counts for select to authenticated
  using (private.can_manage_site(organization_id,site_id));
create policy supply_expense_links_director_read on public.supply_expense_links for select to authenticated
  using (private.can_administer_org(organization_id));

-- Supervisors can choose active items without receiving broad catalogue table access.
create function public.list_supply_request_items(p_site_id uuid)
returns table(id uuid,name text,sku text,unit_of_measure text)
language plpgsql stable security definer set search_path='' as $$
declare v_org uuid;
begin
  select s.organization_id into v_org from public.sites s where s.id=p_site_id;
  if auth.uid() is null or v_org is null or not private.can_manage_site(v_org,p_site_id) then
    raise exception 'site supply access required' using errcode='42501'; end if;
  return query select i.id,i.name,i.sku,i.unit_of_measure from public.inventory_items i
    where i.organization_id=v_org and i.active order by i.name;
end $$;
revoke all on function public.list_supply_request_items(uuid) from public,anon,authenticated;
grant execute on function public.list_supply_request_items(uuid) to authenticated;

create function private.can_approve_supply(p_organization_id uuid,p_site_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select private.can_manage_site(p_organization_id,p_site_id)
    and private.has_org_role(p_organization_id,array[
      'area_manager'::public.app_role,'operations_manager'::public.app_role,
      'organization_administrator'::public.app_role]);
$$;
revoke all on function private.can_approve_supply(uuid,uuid) from public,anon,authenticated;

create function public.submit_supply_request(
  p_site_id uuid,p_purpose text,p_items jsonb,p_request_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_org uuid; v_request uuid; v_existing public.supply_requests%rowtype;
  v_item jsonb; v_item_id uuid; v_pack_count numeric; v_factor numeric;
  v_price numeric; v_source text; v_reference text; v_responsibility text;
begin
  if auth.uid() is null or p_request_key is null or p_site_id is null then
    raise exception 'authenticated site and request key required' using errcode='42501'; end if;
  select organization_id into v_org from public.sites where id=p_site_id;
  if v_org is null or not private.can_manage_site(v_org,p_site_id) then
    raise exception 'site supply access required' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_purpose,''))) not between 3 and 500
    or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 20 then
    raise exception 'request needs a purpose and 1 to 20 items' using errcode='22023'; end if;
  select * into v_existing from public.supply_requests
    where organization_id=v_org and request_key=p_request_key;
  if found then
    if v_existing.site_id<>p_site_id or v_existing.requested_by<>auth.uid() then
      raise exception 'request key belongs to another request' using errcode='42501'; end if;
    return v_existing.id;
  end if;
  select cv.supply_responsibility into v_responsibility
    from public.contract_versions cv
    where cv.organization_id=v_org and cv.site_id=p_site_id and cv.state='active'
      and cv.effective_from<=current_date
      and (cv.effective_to is null or cv.effective_to>=current_date)
    order by cv.effective_from desc,cv.version_number desc limit 1;
  insert into public.supply_requests(organization_id,site_id,request_key,requested_by,purpose,supply_responsibility)
    values(v_org,p_site_id,p_request_key,auth.uid(),trim(p_purpose),coalesce(v_responsibility,'unknown'))
    on conflict do nothing returning id into v_request;
  if v_request is null then
    select * into v_existing from public.supply_requests
      where organization_id=v_org and request_key=p_request_key;
    if not found or v_existing.site_id<>p_site_id or v_existing.requested_by<>auth.uid() then
      raise exception 'request key belongs to another request' using errcode='42501'; end if;
    return v_existing.id;
  end if;
  for v_item in select value from jsonb_array_elements(p_items) as value loop
    v_item_id := (v_item->>'itemId')::uuid;
    v_pack_count := (v_item->>'packCount')::numeric;
    v_factor := (v_item->>'baseUnitsPerPack')::numeric;
    v_price := (v_item->>'pricePerPack')::numeric;
    v_source := v_item->>'priceSource';
    v_reference := nullif(trim(v_item->>'priceReference'),'');
    if not exists(select 1 from public.inventory_items
      where organization_id=v_org and id=v_item_id and active) then
      raise exception 'request item is unavailable' using errcode='22023'; end if;
    if v_pack_count is null or v_pack_count<=0 or v_factor is null or v_factor<=0
      or v_price is null or v_price<0 or v_source is null
      or v_source not in ('supplier_quote','catalogue','invoice','manual_estimate')
      or (v_source<>'manual_estimate' and v_reference is null)
      or char_length(coalesce(v_reference,''))>200 then
      raise exception 'request item quantity, conversion or price source is invalid' using errcode='22023'; end if;
    insert into public.supply_request_items(organization_id,site_id,request_id,inventory_item_id,
      pack_count,base_units_per_pack,price_per_pack,price_source,price_reference)
    values(v_org,p_site_id,v_request,v_item_id,v_pack_count,v_factor,v_price,v_source,v_reference);
  end loop;
  insert into public.supply_request_events(organization_id,site_id,request_id,event_kind,actor_id,detail)
    values(v_org,p_site_id,v_request,'submitted',auth.uid(),jsonb_build_object('item_count',jsonb_array_length(p_items)));
  return v_request;
end $$;
revoke all on function public.submit_supply_request(uuid,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.submit_supply_request(uuid,text,jsonb,uuid) to authenticated;

create function public.revise_supply_request_item(
  p_item_id uuid,p_inventory_item_id uuid,p_pack_count numeric,
  p_base_units_per_pack numeric,p_price_per_pack numeric,p_price_source text,p_price_reference text)
returns void language plpgsql security definer set search_path='' as $$
declare v_item public.supply_request_items%rowtype; v_request public.supply_requests%rowtype;
begin
  select * into v_item from public.supply_request_items where id=p_item_id for update;
  if not found then raise exception 'supply request item not found' using errcode='22023'; end if;
  select * into v_request from public.supply_requests where id=v_item.request_id for update;
  if not private.can_manage_site(v_request.organization_id,v_request.site_id)
    or (v_request.requested_by<>auth.uid() and not private.can_approve_supply(v_request.organization_id,v_request.site_id)) then
    raise exception 'site supply access required' using errcode='42501'; end if;
  if v_request.state not in ('requested','approved') then
    raise exception 'ordered or received requests cannot be revised' using errcode='22023'; end if;
  if not exists(select 1 from public.inventory_items where organization_id=v_request.organization_id
    and id=p_inventory_item_id and active)
    or p_pack_count<=0 or p_base_units_per_pack<=0 or p_price_per_pack<0
    or p_price_source is null or p_price_source not in ('supplier_quote','catalogue','invoice','manual_estimate')
    or (p_price_source<>'manual_estimate' and nullif(trim(coalesce(p_price_reference,'')),'') is null)
    or char_length(coalesce(p_price_reference,''))>200 then
    raise exception 'revised item is invalid' using errcode='22023'; end if;
  update public.supply_request_items set inventory_item_id=p_inventory_item_id,
    pack_count=p_pack_count,base_units_per_pack=p_base_units_per_pack,
    price_per_pack=p_price_per_pack,price_source=p_price_source,
    price_reference=nullif(trim(coalesce(p_price_reference,'')),'') where id=p_item_id;
  update public.supply_requests set state='requested',version=version+1,
    decided_by=null,decided_at=null,decision_reason=null,updated_at=now() where id=v_request.id;
  insert into public.supply_request_events(organization_id,site_id,request_id,event_kind,actor_id,detail)
    values(v_request.organization_id,v_request.site_id,v_request.id,'revised',auth.uid(),
      jsonb_build_object('item_id',p_item_id,'old_item',to_jsonb(v_item),'previous_state',v_request.state));
end $$;
revoke all on function public.revise_supply_request_item(uuid,uuid,numeric,numeric,numeric,text,text) from public,anon,authenticated;
grant execute on function public.revise_supply_request_item(uuid,uuid,numeric,numeric,numeric,text,text) to authenticated;

create function public.decide_supply_request(p_request_id uuid,p_decision text,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare v_request public.supply_requests%rowtype;
begin
  select * into v_request from public.supply_requests where id=p_request_id for update;
  if not found then raise exception 'supply request not found' using errcode='22023'; end if;
  if not private.can_approve_supply(v_request.organization_id,v_request.site_id) then
    raise exception 'supply approval access required' using errcode='42501'; end if;
  if v_request.state<>'requested' or p_decision is null or p_decision not in ('approved','rejected')
    or (p_decision='rejected' and char_length(trim(coalesce(p_reason,'')))<3) then
    raise exception 'request decision or reason is invalid' using errcode='22023'; end if;
  update public.supply_requests set state=p_decision,decision_reason=nullif(trim(coalesce(p_reason,'')),''),
    decided_by=auth.uid(),decided_at=now(),updated_at=now() where id=p_request_id;
  insert into public.supply_request_events(organization_id,site_id,request_id,event_kind,actor_id,detail)
    values(v_request.organization_id,v_request.site_id,p_request_id,p_decision,auth.uid(),
      jsonb_build_object('reason',p_reason,'version',v_request.version));
end $$;
revoke all on function public.decide_supply_request(uuid,text,text) from public,anon,authenticated;
grant execute on function public.decide_supply_request(uuid,text,text) to authenticated;

create function public.order_supply_request(p_request_id uuid,p_order_reference text)
returns void language plpgsql security definer set search_path='' as $$
declare v_request public.supply_requests%rowtype;
begin
  select * into v_request from public.supply_requests where id=p_request_id for update;
  if not found then raise exception 'supply request not found' using errcode='22023'; end if;
  if not private.can_approve_supply(v_request.organization_id,v_request.site_id) then
    raise exception 'supply order access required' using errcode='42501'; end if;
  if v_request.state<>'approved' or char_length(trim(coalesce(p_order_reference,''))) not between 3 and 160 then
    raise exception 'approved request and order reference required' using errcode='22023'; end if;
  update public.supply_requests set state='ordered',order_reference=trim(p_order_reference),
    ordered_at=now(),updated_at=now() where id=p_request_id;
  insert into public.supply_request_events(organization_id,site_id,request_id,event_kind,actor_id,detail)
    values(v_request.organization_id,v_request.site_id,p_request_id,'ordered',auth.uid(),
      jsonb_build_object('order_reference',trim(p_order_reference),'version',v_request.version));
end $$;
revoke all on function public.order_supply_request(uuid,text) from public,anon,authenticated;
grant execute on function public.order_supply_request(uuid,text) to authenticated;

create function public.cancel_supply_request(p_request_id uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare v_request public.supply_requests%rowtype;
begin
  select * into v_request from public.supply_requests where id=p_request_id for update;
  if not found then raise exception 'supply request not found' using errcode='22023'; end if;
  if not private.can_manage_site(v_request.organization_id,v_request.site_id)
    or (v_request.requested_by<>auth.uid() and not private.can_approve_supply(v_request.organization_id,v_request.site_id)) then
    raise exception 'site supply access required' using errcode='42501'; end if;
  if v_request.state not in ('requested','approved','ordered')
    or (v_request.state<>'requested' and not private.can_approve_supply(v_request.organization_id,v_request.site_id))
    or char_length(trim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception 'request cannot be cancelled in this state' using errcode='22023'; end if;
  update public.supply_requests set state='cancelled',updated_at=now() where id=p_request_id;
  insert into public.supply_request_events(organization_id,site_id,request_id,event_kind,actor_id,detail)
    values(v_request.organization_id,v_request.site_id,p_request_id,'cancelled',auth.uid(),
      jsonb_build_object('reason',trim(p_reason),'previous_state',v_request.state));
end $$;
revoke all on function public.cancel_supply_request(uuid,text) from public,anon,authenticated;
grant execute on function public.cancel_supply_request(uuid,text) to authenticated;

create function private.supply_stock_balance(p_organization_id uuid,p_site_id uuid,p_item_id uuid)
returns numeric language plpgsql stable security definer set search_path='' as $$
declare v_unknown integer; v_balance numeric;
begin
  select count(*) filter (where transaction_type in ('adjustment','count')),
    coalesce(sum(case
      when transaction_type in ('opening','receipt','transfer_in','return','adjustment_in') then quantity
      when transaction_type in ('issue','transfer_out','adjustment_out') then -quantity
      else 0 end),0)
    into v_unknown,v_balance
    from public.inventory_transactions
    where organization_id=p_organization_id and site_id=p_site_id and inventory_item_id=p_item_id;
  if v_unknown>0 then return null; end if;
  return v_balance;
end $$;
revoke all on function private.supply_stock_balance(uuid,uuid,uuid) from public,anon,authenticated;

create function public.list_supply_stock_balance(p_site_id uuid,p_item_id uuid)
returns numeric language plpgsql stable security definer set search_path='' as $$
declare v_org uuid;
begin
  select s.organization_id into v_org from public.sites s where s.id=p_site_id;
  if auth.uid() is null or v_org is null or not private.can_manage_site(v_org,p_site_id) then
    raise exception 'site stock access required' using errcode='42501'; end if;
  return private.supply_stock_balance(v_org,p_site_id,p_item_id);
end $$;
revoke all on function public.list_supply_stock_balance(uuid,uuid) from public,anon,authenticated;
grant execute on function public.list_supply_stock_balance(uuid,uuid) to authenticated;

create function public.list_site_supply_stock(p_site_id uuid)
returns table(inventory_item_id uuid,item_name text,unit_of_measure text,on_hand numeric)
language plpgsql stable security definer set search_path='' as $$
declare v_org uuid;
begin
  select s.organization_id into v_org from public.sites s where s.id=p_site_id;
  if auth.uid() is null or v_org is null or not private.can_manage_site(v_org,p_site_id) then
    raise exception 'site stock access required' using errcode='42501'; end if;
  return query select i.id,i.name,i.unit_of_measure,
    private.supply_stock_balance(v_org,p_site_id,i.id)
    from public.inventory_items i where i.organization_id=v_org and i.active order by i.name;
end $$;
revoke all on function public.list_site_supply_stock(uuid) from public,anon,authenticated;
grant execute on function public.list_site_supply_stock(uuid) to authenticated;

create function public.list_site_supply_stock_history(p_site_id uuid)
returns table(id uuid,inventory_item_id uuid,transaction_type text,quantity numeric,
  occurred_at timestamptz,notes text,supply_request_item_id uuid)
language plpgsql stable security definer set search_path='' as $$
declare v_org uuid;
begin
  select s.organization_id into v_org from public.sites s where s.id=p_site_id;
  if auth.uid() is null or v_org is null or not private.can_manage_site(v_org,p_site_id) then
    raise exception 'site stock access required' using errcode='42501'; end if;
  return query select x.id,x.inventory_item_id,x.transaction_type,x.quantity,
    x.occurred_at,x.notes,x.supply_request_item_id
    from public.inventory_transactions x where x.organization_id=v_org and x.site_id=p_site_id
    order by x.occurred_at desc,x.id limit 100;
end $$;
revoke all on function public.list_site_supply_stock_history(uuid) from public,anon,authenticated;
grant execute on function public.list_site_supply_stock_history(uuid) to authenticated;

create function public.record_supply_stock_movement(
  p_site_id uuid,p_item_id uuid,p_kind text,p_quantity numeric,p_key uuid,
  p_reason text,p_target_site_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_org uuid; v_balance numeric; v_existing public.inventory_transactions%rowtype;
  v_id uuid; v_target_balance numeric; v_delta numeric; v_kind text;
begin
  select organization_id into v_org from public.sites where id=p_site_id;
  if auth.uid() is null or v_org is null or not private.can_manage_site(v_org,p_site_id) then
    raise exception 'site stock access required' using errcode='42501'; end if;
  if p_key is null or p_item_id is null or p_quantity is null or p_quantity<0
    or char_length(trim(coalesce(p_reason,''))) not between 3 and 500
    or p_kind is null or p_kind not in ('opening','issue','return','transfer','count') then
    raise exception 'stock movement input is invalid' using errcode='22023'; end if;
  if not exists(select 1 from public.inventory_items where organization_id=v_org and id=p_item_id and active) then
    raise exception 'stock item is unavailable' using errcode='22023'; end if;
  -- Serializes all changes to this item, including transfers between sites.
  perform 1 from public.inventory_items where organization_id=v_org and id=p_item_id for update;
  if p_kind='count' then
    select adjustment_transaction_id into v_id from public.supply_stock_counts
      where organization_id=v_org and count_key=p_key;
    if found then return coalesce(v_id,p_key); end if;
  else
    select * into v_existing from public.inventory_transactions
      where organization_id=v_org and movement_key=p_key and movement_leg='source';
    if found then
      if v_existing.site_id<>p_site_id or v_existing.inventory_item_id<>p_item_id
        or v_existing.quantity<>p_quantity
        or v_existing.transaction_type<>(case when p_kind='transfer' then 'transfer_out' else p_kind end) then
        raise exception 'movement key belongs to another stock event' using errcode='42501'; end if;
      return v_existing.id;
    end if;
  end if;
  v_balance := private.supply_stock_balance(v_org,p_site_id,p_item_id);
  if v_balance is null then
    raise exception 'legacy stock adjustment needs review before a verified balance can be used' using errcode='22023'; end if;
  if p_kind='opening' then
    if exists(select 1 from public.inventory_transactions where organization_id=v_org
      and site_id=p_site_id and inventory_item_id=p_item_id) or p_quantity<=0 then
      raise exception 'opening balance requires an item with no prior site movements' using errcode='22023'; end if;
    v_kind := 'opening';
  elsif p_kind='issue' or p_kind='transfer' then
    if p_quantity<=0 or v_balance<p_quantity then
      raise exception 'stock cannot become negative' using errcode='22023'; end if;
    v_kind := case when p_kind='transfer' then 'transfer_out' else 'issue' end;
  elsif p_kind='return' then
    if p_quantity<=0 then raise exception 'return quantity must be positive' using errcode='22023'; end if;
    v_kind := 'return';
  else
    v_delta := p_quantity-v_balance;
    if v_delta<>0 then
      insert into public.inventory_transactions(organization_id,site_id,inventory_item_id,
        transaction_type,quantity,unit_cost,occurred_at,notes,movement_key,movement_leg,recorded_by)
      values(v_org,p_site_id,p_item_id,case when v_delta>0 then 'adjustment_in' else 'adjustment_out' end,
        abs(v_delta),0,now(),trim(p_reason),p_key,'source',auth.uid()) returning id into v_id;
    end if;
    insert into public.supply_stock_counts(organization_id,site_id,inventory_item_id,count_key,
      previous_quantity,counted_quantity,adjustment_transaction_id,counted_by,reason)
      values(v_org,p_site_id,p_item_id,p_key,v_balance,p_quantity,v_id,auth.uid(),trim(p_reason));
    return coalesce(v_id,p_key);
  end if;
  if p_kind='transfer' then
    if p_target_site_id is null or p_target_site_id=p_site_id
      or not exists(select 1 from public.sites where organization_id=v_org and id=p_target_site_id)
      or not private.can_manage_site(v_org,p_target_site_id) then
      raise exception 'target site access required for transfer' using errcode='42501'; end if;
    v_target_balance := private.supply_stock_balance(v_org,p_target_site_id,p_item_id);
    if v_target_balance is null then
      raise exception 'target site stock balance needs review' using errcode='22023'; end if;
  end if;
  insert into public.inventory_transactions(organization_id,site_id,inventory_item_id,
    transaction_type,quantity,unit_cost,occurred_at,notes,movement_key,movement_leg,recorded_by)
  values(v_org,p_site_id,p_item_id,v_kind,p_quantity,0,now(),trim(p_reason),p_key,'source',auth.uid())
    returning id into v_id;
  if p_kind='transfer' then
    insert into public.inventory_transactions(organization_id,site_id,inventory_item_id,
      transaction_type,quantity,unit_cost,occurred_at,notes,movement_key,movement_leg,recorded_by)
    values(v_org,p_target_site_id,p_item_id,'transfer_in',p_quantity,0,now(),trim(p_reason),
      p_key,'target',auth.uid());
  end if;
  return v_id;
end $$;
revoke all on function public.record_supply_stock_movement(uuid,uuid,text,numeric,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.record_supply_stock_movement(uuid,uuid,text,numeric,uuid,text,uuid) to authenticated;

create function public.receive_supply_request_item(p_request_item_id uuid,p_base_quantity numeric,p_receipt_key uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_item public.supply_request_items%rowtype; v_request public.supply_requests%rowtype;
  v_existing public.supply_receipts%rowtype; v_transaction uuid; v_receipt uuid;
begin
  select * into v_item from public.supply_request_items where id=p_request_item_id for update;
  if not found then raise exception 'supply request item not found' using errcode='22023'; end if;
  select * into v_request from public.supply_requests where id=v_item.request_id for update;
  if not private.can_manage_site(v_request.organization_id,v_request.site_id) then
    raise exception 'site receipt access required' using errcode='42501'; end if;
  if p_receipt_key is null then raise exception 'receipt key required' using errcode='22023'; end if;
  select * into v_existing from public.supply_receipts
    where organization_id=v_request.organization_id and receipt_key=p_receipt_key;
  if found then
    if v_existing.request_item_id<>p_request_item_id or v_existing.base_quantity<>p_base_quantity then
      raise exception 'receipt key belongs to another receipt' using errcode='42501'; end if;
    return v_existing.id;
  end if;
  if v_request.state not in ('ordered','partially_received') or p_base_quantity is null
    or p_base_quantity<=0 or v_item.received_base_quantity+p_base_quantity>v_item.base_quantity then
    raise exception 'ordered request and remaining quantity required' using errcode='22023'; end if;
  perform 1 from public.inventory_items where organization_id=v_request.organization_id
    and id=v_item.inventory_item_id for update;
  insert into public.inventory_transactions(organization_id,site_id,inventory_item_id,
    transaction_type,quantity,unit_cost,occurred_at,notes,supply_request_item_id,
    movement_key,movement_leg,recorded_by)
  values(v_request.organization_id,v_request.site_id,v_item.inventory_item_id,'receipt',
    p_base_quantity,round(v_item.price_per_pack/v_item.base_units_per_pack,2),now(),
    'Supply order '||v_request.order_reference,p_request_item_id,p_receipt_key,'receipt',auth.uid())
  returning id into v_transaction;
  update public.supply_request_items set received_base_quantity=received_base_quantity+p_base_quantity
    where id=p_request_item_id;
  insert into public.supply_receipts(organization_id,site_id,request_id,request_item_id,
    receipt_key,base_quantity,inventory_transaction_id,received_by)
  values(v_request.organization_id,v_request.site_id,v_request.id,p_request_item_id,
    p_receipt_key,p_base_quantity,v_transaction,auth.uid()) returning id into v_receipt;
  update public.supply_requests set state=case when not exists(
    select 1 from public.supply_request_items where request_id=v_request.id
      and received_base_quantity<base_quantity) then 'received' else 'partially_received' end,
    updated_at=now() where id=v_request.id;
  insert into public.supply_request_events(organization_id,site_id,request_id,event_kind,actor_id,detail)
  values(v_request.organization_id,v_request.site_id,v_request.id,'received',auth.uid(),
    jsonb_build_object('receipt_id',v_receipt,'item_id',p_request_item_id,'base_quantity',p_base_quantity));
  return v_receipt;
end $$;
revoke all on function public.receive_supply_request_item(uuid,numeric,uuid) from public,anon,authenticated;
grant execute on function public.receive_supply_request_item(uuid,numeric,uuid) to authenticated;

create function public.link_supply_receipt_expense(p_receipt_id uuid,p_expense_posting_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_receipt public.supply_receipts%rowtype; v_expense public.expense_postings%rowtype; v_id uuid;
begin
  select * into v_receipt from public.supply_receipts where id=p_receipt_id;
  if not found or not private.can_administer_org(v_receipt.organization_id) then
    raise exception 'director receipt access required' using errcode='42501'; end if;
  select * into v_expense from public.expense_postings where id=p_expense_posting_id;
  if not found or v_expense.organization_id<>v_receipt.organization_id
    or v_expense.site_id<>v_receipt.site_id or v_expense.category<>'supplies'
    or v_expense.currency<>'CAD' then
    raise exception 'approved supply expense for the same site required' using errcode='22023'; end if;
  insert into public.supply_expense_links(organization_id,site_id,receipt_id,expense_posting_id,linked_by)
  values(v_receipt.organization_id,v_receipt.site_id,p_receipt_id,p_expense_posting_id,auth.uid())
    on conflict (organization_id,receipt_id) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.supply_expense_links
      where organization_id=v_receipt.organization_id and receipt_id=p_receipt_id
        and expense_posting_id=p_expense_posting_id;
    if v_id is null then raise exception 'receipt is linked to a different expense' using errcode='22023'; end if;
  end if;
  return v_id;
end $$;
revoke all on function public.link_supply_receipt_expense(uuid,uuid) from public,anon,authenticated;
grant execute on function public.link_supply_receipt_expense(uuid,uuid) to authenticated;

-- Stock movements written through the workflow are append-only even for Directors.
create function private.protect_supply_stock_movement()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.movement_key is not null then
    raise exception 'record a correction or count adjustment; supply stock history is immutable' using errcode='22023'; end if;
  return old;
end $$;
create trigger supply_stock_movement_immutable before update or delete on public.inventory_transactions
  for each row execute function private.protect_supply_stock_movement();
revoke all on function private.protect_supply_stock_movement() from public,anon,authenticated;

create function public.list_supply_site_comparison(p_month date)
returns table(site_id uuid,inventory_item_id uuid,item_name text,requested_amount numeric,
  approved_amount numeric,received_base_quantity numeric,approved_expense numeric,
  approved_labour_hours numeric,expense_per_approved_hour numeric)
language plpgsql stable security definer set search_path='' as $$
declare v_org uuid; v_memberships integer;
begin
  if auth.uid() is null or p_month is null or p_month<>date_trunc('month',p_month)::date then
    raise exception 'first day of a month required' using errcode='22023'; end if;
  select count(*),min(m.organization_id::text)::uuid into v_memberships,v_org from public.memberships m
    where m.user_id=auth.uid() and m.state='active';
  if v_memberships<>1 or v_org is null or not private.has_org_role(v_org,array[
    'area_manager'::public.app_role,'operations_manager'::public.app_role,
    'organization_administrator'::public.app_role]) then
    raise exception 'supply comparison access required' using errcode='42501'; end if;
  return query
  with request_totals as (
    select r.site_id,i.inventory_item_id,
      sum(i.requested_amount) requested,
      sum(case when r.state in ('approved','ordered','partially_received','received')
        then i.requested_amount else 0 end) approved
    from public.supply_requests r join public.supply_request_items i
      on i.organization_id=r.organization_id and i.request_id=r.id
    where r.organization_id=v_org and r.created_at>=p_month
      and r.created_at<(p_month+interval '1 month')
      and private.can_approve_supply(r.organization_id,r.site_id)
    group by r.site_id,i.inventory_item_id
  ), receipt_totals as (
    select receipt.site_id,i.inventory_item_id,sum(receipt.base_quantity) received
    from public.supply_receipts receipt join public.supply_request_items i
      on i.organization_id=receipt.organization_id and i.id=receipt.request_item_id
    where receipt.organization_id=v_org and receipt.received_at>=p_month
      and receipt.received_at<(p_month+interval '1 month')
      and private.can_approve_supply(receipt.organization_id,receipt.site_id)
    group by receipt.site_id,i.inventory_item_id
  ), expense_totals as (
    select l.site_id,i.inventory_item_id,sum(e.amount) amount
    from public.supply_expense_links l join public.supply_receipts receipt
      on receipt.organization_id=l.organization_id and receipt.id=l.receipt_id
    join public.supply_request_items i
      on i.organization_id=receipt.organization_id and i.id=receipt.request_item_id
    join public.expense_postings e
      on e.organization_id=l.organization_id and e.id=l.expense_posting_id
    join public.expense_claims c
      on c.organization_id=e.organization_id and c.id=e.claim_id
    where l.organization_id=v_org and c.expense_date>=p_month
      and c.expense_date<(p_month+interval '1 month')
      and private.can_approve_supply(l.organization_id,l.site_id)
    group by l.site_id,i.inventory_item_id
  ), comparison_keys as (
    select q.site_id,q.inventory_item_id from request_totals q
    union select r.site_id,r.inventory_item_id from receipt_totals r
    union select e.site_id,e.inventory_item_id from expense_totals e
  ), labour_hours as (
    select t.site_id,sum(t.hours) hours from public.time_entries t
    where t.organization_id=v_org and t.work_date>=p_month
      and t.work_date<(p_month+interval '1 month')
      and t.state in ('approved','posted') group by t.site_id
  )
  select k.site_id,k.inventory_item_id,item.name,coalesce(q.requested,0),
    coalesce(q.approved,0),coalesce(receipt.received,0),
    coalesce(e.amount,0),h.hours,
    case when h.hours>0 then round(coalesce(e.amount,0)/h.hours,2) else null end
  from comparison_keys k join public.inventory_items item
    on item.organization_id=v_org and item.id=k.inventory_item_id
  left join request_totals q on q.site_id=k.site_id and q.inventory_item_id=k.inventory_item_id
  left join receipt_totals receipt on receipt.site_id=k.site_id and receipt.inventory_item_id=k.inventory_item_id
  left join expense_totals e on e.site_id=k.site_id and e.inventory_item_id=k.inventory_item_id
  left join labour_hours h on h.site_id=k.site_id
  order by k.site_id,item.name;
end $$;
revoke all on function public.list_supply_site_comparison(date) from public,anon,authenticated;
grant execute on function public.list_supply_site_comparison(date) to authenticated;
