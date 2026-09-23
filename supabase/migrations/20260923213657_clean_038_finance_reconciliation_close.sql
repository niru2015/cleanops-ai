-- CLEAN-038: organization-wide period close, with site-scoped aggregate reads.
-- Operational cost stays in its source ledger; accounting remains authoritative.
create table public.finance_periods (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id),
  period_start date not null, period_end date not null,
  currency text not null default 'CAD' check (currency ~ '^[A-Z]{3}$'),
  state text not null default 'open' check (state in ('open','review','closed','reopened')),
  close_version integer not null default 0 check (close_version>=0),
  close_snapshot jsonb, closed_by uuid references auth.users(id), closed_at timestamptz,
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  unique (organization_id,id), unique (organization_id,period_start),
  check (period_start=date_trunc('month',period_start)::date),
  check (period_end=(period_start+interval '1 month - 1 day')::date),
  check ((state='closed')=(closed_by is not null and closed_at is not null))
);
create index finance_periods_org_period on public.finance_periods(organization_id,period_start desc);
create table public.finance_period_events (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  period_id uuid not null, event_kind text not null check (event_kind in ('created','review','closed','reopened')),
  close_version integer not null, snapshot jsonb, reason text,
  actor_id uuid not null references auth.users(id), created_at timestamptz not null default now(),
  foreign key (organization_id,period_id) references public.finance_periods(organization_id,id)
);
create table public.finance_reconciliation_links (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  period_id uuid not null, site_id uuid not null,
  source_row_id uuid not null, source_allocation_id uuid not null,
  operational_entity_type text not null check (operational_entity_type in
    ('expense_posting','labor_cost_entry','inventory_issue')),
  operational_entity_id uuid not null,
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  matched_amount numeric(16,2) not null check (matched_amount>0),
  match_rule text not null check (match_rule in ('source_id_v1','document_reference_v1','context_v1','manual_v1')),
  rationale text not null check (length(trim(rationale)) between 4 and 1000),
  state text not null default 'active' check (state in ('active','voided')),
  linked_by uuid not null references auth.users(id), linked_at timestamptz not null default now(),
  voided_by uuid references auth.users(id), voided_at timestamptz, void_reason text,
  unique (organization_id,id),
  foreign key (organization_id,period_id) references public.finance_periods(organization_id,id),
  foreign key (organization_id,site_id) references public.sites(organization_id,id),
  foreign key (organization_id,source_row_id) references public.finance_source_rows(organization_id,id),
  foreign key (organization_id,source_allocation_id) references public.finance_source_allocations(organization_id,id),
  check ((state='voided')=(voided_by is not null and voided_at is not null and void_reason is not null))
);
create index finance_links_source on public.finance_reconciliation_links(organization_id,source_allocation_id,state);
create index finance_links_operational on public.finance_reconciliation_links(organization_id,operational_entity_type,operational_entity_id,state);
create index finance_links_period_site on public.finance_reconciliation_links(organization_id,period_id,site_id,state);
create unique index finance_links_active_pair on public.finance_reconciliation_links
  (organization_id,source_allocation_id,operational_entity_type,operational_entity_id) where state='active';
create table public.finance_reconciliation_events (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  link_id uuid not null, event_kind text not null check (event_kind in ('linked','voided')),
  detail jsonb not null, actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (organization_id,link_id) references public.finance_reconciliation_links(organization_id,id)
);

alter table public.finance_periods enable row level security;
alter table public.finance_period_events enable row level security;
alter table public.finance_reconciliation_links enable row level security;
alter table public.finance_reconciliation_events enable row level security;
revoke all on public.finance_periods,public.finance_period_events,
  public.finance_reconciliation_links,public.finance_reconciliation_events from public,anon,authenticated;
grant select on public.finance_periods,public.finance_period_events,
  public.finance_reconciliation_links,public.finance_reconciliation_events to authenticated;
grant all on public.finance_periods,public.finance_period_events,
  public.finance_reconciliation_links,public.finance_reconciliation_events to service_role;
create policy finance_periods_director_read on public.finance_periods for select to authenticated
  using (private.can_administer_org(organization_id));
create policy finance_period_events_director_read on public.finance_period_events for select to authenticated
  using (private.can_administer_org(organization_id));
create policy finance_links_director_read on public.finance_reconciliation_links for select to authenticated
  using (private.can_administer_org(organization_id));
create policy finance_link_events_director_read on public.finance_reconciliation_events for select to authenticated
  using (private.can_administer_org(organization_id));

-- A private view resolves only existing approved, posted operational cost rows.
-- Legacy labour and stock ledgers are CAD-only; CLEAN-036 rejects non-CAD rates.
create view private.finance_operational_records as
  select e.organization_id,e.site_id,'expense_posting'::text entity_type,e.id entity_id,
    e.currency,e.amount::numeric(16,2) amount,c.expense_date service_date,
    case when e.category='supplies' then 'supplies'
      when e.category='equipment_repair' then 'repairs' else 'other_direct_cost' end::text category,
    e.project_id, e.claim_id::text source_reference, c.vendor context_name
  from public.expense_postings e join public.expense_claims c
    on c.organization_id=e.organization_id and c.id=e.claim_id
  where e.category<>'equipment_purchase'
  union all
  select l.organization_id,l.site_id,'labor_cost_entry',l.id,'CAD',l.total_cost,l.work_date,
    'direct_labour',l.project_id,coalesce(l.time_entry_id::text,l.id::text),null::text
  from public.labor_cost_entries l
  union all
  select i.organization_id,i.site_id,'inventory_issue',i.id,'CAD',i.total_cost,
    i.occurred_at::date,'supplies',i.project_id,i.id::text,null::text
  from public.inventory_transactions i where i.transaction_type='issue';
revoke all on private.finance_operational_records from public,anon,authenticated;

create function private.finance_match_rule(p_source public.finance_source_rows,
  p_allocation public.finance_source_allocations,p_op private.finance_operational_records)
returns text language plpgsql stable set search_path='' as $$
begin
  if p_source.category not in ('direct_labour','supplies','repairs','other_direct_cost')
    or p_source.approval_state<>'approved' or p_source.recognition_state<>'actual'
    or p_source.amount<=0 or p_allocation.amount<=0 or p_op.amount<=0
    or p_source.currency<>p_op.currency
    or p_allocation.site_id<>p_op.site_id or p_source.category<>p_op.category
    or p_allocation.project_id is distinct from p_op.project_id then return null; end if;
  if p_source.operational_reference_id=p_op.entity_id
    or p_source.raw_row->>'operational_id'=p_op.entity_id::text then return 'source_id_v1'; end if;
  if p_source.source_document_id in (p_op.entity_id::text,p_op.source_reference)
    then return 'document_reference_v1'; end if;
  if p_allocation.amount=p_op.amount and abs(p_source.service_period-p_op.service_date)<=3
    and (p_op.entity_type<>'expense_posting' or
      nullif(trim(p_source.raw_row->>'vendor'),'') is not null and
      lower(trim(p_source.raw_row->>'vendor'))=lower(trim(p_op.context_name)))
    then return 'context_v1'; end if;
  return null;
end $$;

create function public.list_finance_match_candidates(p_period_id uuid)
returns table(source_allocation_id uuid,source_row_id uuid,operational_entity_type text,
  operational_entity_id uuid,site_id uuid,currency text,amount numeric,
  rule text,rule_priority integer,ambiguous boolean)
language plpgsql security definer set search_path='' as $$
declare v_period public.finance_periods%rowtype;
begin
  select * into v_period from public.finance_periods where id=p_period_id;
  if not found or not private.can_administer_org(v_period.organization_id) then
    raise exception 'director period access required' using errcode='42501'; end if;
  return query
  with candidates as (
    select a.id allocation_id,r.id row_id,o.entity_type,o.entity_id,a.site_id,r.currency,
      a.amount,private.finance_match_rule(r,a,o) match_rule
    from public.finance_source_allocations a
    join public.finance_source_rows r on r.organization_id=a.organization_id and r.id=a.source_row_id
    join public.finance_import_batches b on b.organization_id=r.organization_id and b.id=r.import_batch_id
    join private.finance_operational_records o on o.organization_id=a.organization_id
      and o.site_id=a.site_id and o.category=r.category and o.currency=r.currency
      and o.project_id is not distinct from a.project_id and o.amount=a.amount
      and o.service_date between v_period.period_start and v_period.period_end
    where a.organization_id=v_period.organization_id and b.state='accepted'
      and r.service_period between v_period.period_start and v_period.period_end
      and a.amount>0 and not exists(select 1 from public.finance_reconciliation_links l
        where l.organization_id=a.organization_id and l.source_allocation_id=a.id and l.state='active')
      and not exists(select 1 from public.finance_reconciliation_links l
        where l.organization_id=o.organization_id and l.operational_entity_type=o.entity_type
          and l.operational_entity_id=o.entity_id and l.state='active')
  ), ranked as (
    select c.*,case c.match_rule when 'source_id_v1' then 1
      when 'document_reference_v1' then 2 when 'context_v1' then 3 else 99 end priority
    from candidates c where c.match_rule is not null
  ), top_source as (
    select x.*,min(priority) over(partition by allocation_id) best_priority from ranked x
  ), best as (
    select x.*,count(*) over(partition by allocation_id) source_choices,
      count(*) over(partition by entity_type,entity_id) operational_choices
    from top_source x where priority=best_priority
  )
  select x.allocation_id,x.row_id,x.entity_type,x.entity_id,x.site_id,x.currency,
    x.amount,x.match_rule,x.priority,(x.source_choices>1 or x.operational_choices>1)
  from best x order by x.allocation_id,x.entity_type,x.entity_id;
end $$;

create function public.list_finance_operational_rows(p_period_id uuid)
returns table(entity_type text,entity_id uuid,site_id uuid,category text,currency text,
  amount numeric,matched_amount numeric,service_date date,project_id uuid,source_reference text)
language plpgsql security definer set search_path='' as $$
declare v_period public.finance_periods%rowtype;
begin
  select * into v_period from public.finance_periods where id=p_period_id;
  if not found or not private.can_administer_org(v_period.organization_id) then
    raise exception 'director period access required' using errcode='42501'; end if;
  return query select o.entity_type,o.entity_id,o.site_id,o.category,o.currency,o.amount,
    coalesce((select sum(l.matched_amount) from public.finance_reconciliation_links l
      where l.organization_id=o.organization_id and l.operational_entity_type=o.entity_type
        and l.operational_entity_id=o.entity_id and l.state='active'),0),
    o.service_date,o.project_id,o.source_reference
    from private.finance_operational_records o where o.organization_id=v_period.organization_id
      and o.service_date between v_period.period_start and v_period.period_end and o.amount>0
    order by o.service_date,o.entity_type,o.entity_id;
end $$;

create function public.run_finance_auto_match(p_period_id uuid)
returns integer language plpgsql security definer set search_path='' as $$
declare v_period public.finance_periods%rowtype; v_candidate record; v_count integer:=0;
begin
  select * into v_period from public.finance_periods where id=p_period_id for update;
  if not found or not private.can_administer_org(v_period.organization_id) then
    raise exception 'director period access required' using errcode='42501'; end if;
  if v_period.state='closed' then raise exception 'reopen period before matching'; end if;
  for v_candidate in select * from public.list_finance_match_candidates(p_period_id)
    where not ambiguous order by rule_priority,source_allocation_id loop
    perform private.finance_create_link(v_period,v_candidate.source_allocation_id,
      v_candidate.operational_entity_type,v_candidate.operational_entity_id,
      v_candidate.amount,v_candidate.rule,
      'Unique deterministic '||v_candidate.rule||' match: same site, category, currency and project');
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;

create function private.finance_create_link(p_period public.finance_periods,
  p_allocation_id uuid,p_type text,p_entity_id uuid,p_amount numeric,p_rule text,p_rationale text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_alloc public.finance_source_allocations%rowtype;
  v_source public.finance_source_rows%rowtype; v_batch public.finance_import_batches%rowtype;
  v_op private.finance_operational_records%rowtype; v_id uuid;
  v_source_used numeric; v_op_used numeric;
begin
  if p_period.state not in ('open','review','reopened') then raise exception 'period must be reopened before matching'; end if;
  if p_amount is null or p_amount<=0 or p_amount<>round(p_amount,2) then raise exception 'positive cent-precision match required'; end if;
  select * into v_alloc from public.finance_source_allocations where id=p_allocation_id and organization_id=p_period.organization_id for update;
  if not found then raise exception 'source allocation unavailable'; end if;
  select * into v_source from public.finance_source_rows where id=v_alloc.source_row_id and organization_id=p_period.organization_id;
  select * into v_batch from public.finance_import_batches where id=v_source.import_batch_id and organization_id=p_period.organization_id;
  if v_batch.state<>'accepted' or v_source.approval_state<>'approved' or v_source.recognition_state<>'actual'
    or v_source.currency<>p_period.currency or v_batch.currency<>p_period.currency
    or v_source.service_period<p_period.period_start or v_source.service_period>p_period.period_end
    or v_alloc.amount<=0 or v_source.category not in ('direct_labour','supplies','repairs','other_direct_cost')
    then raise exception 'eligible accepted direct-cost allocation required'; end if;
  select * into v_op from private.finance_operational_records where organization_id=p_period.organization_id
    and entity_type=p_type and entity_id=p_entity_id;
  if not found or v_op.site_id<>v_alloc.site_id or v_op.category<>v_source.category
    or v_op.currency<>v_source.currency or v_op.project_id is distinct from v_alloc.project_id
    or v_op.service_date<p_period.period_start or v_op.service_date>p_period.period_end
    then raise exception 'operational source site, project, category, currency or period mismatch'; end if;
  select coalesce(sum(matched_amount),0) into v_source_used from public.finance_reconciliation_links
    where organization_id=p_period.organization_id and source_allocation_id=v_alloc.id and state='active';
  select coalesce(sum(matched_amount),0) into v_op_used from public.finance_reconciliation_links
    where organization_id=p_period.organization_id and operational_entity_type=p_type
      and operational_entity_id=p_entity_id and state='active';
  if v_source_used+p_amount>v_alloc.amount or v_op_used+p_amount>v_op.amount
    then raise exception 'matched amount exceeds remaining source or operational balance'; end if;
  insert into public.finance_reconciliation_links(organization_id,period_id,site_id,
    source_row_id,source_allocation_id,operational_entity_type,operational_entity_id,
    currency,matched_amount,match_rule,rationale,linked_by)
  values(p_period.organization_id,p_period.id,v_alloc.site_id,v_source.id,v_alloc.id,p_type,p_entity_id,
    v_source.currency,p_amount,p_rule,p_rationale,auth.uid()) returning id into v_id;
  insert into public.finance_reconciliation_events(organization_id,link_id,event_kind,detail,actor_id)
  values(p_period.organization_id,v_id,'linked',jsonb_build_object('amount',p_amount,'rule',p_rule,'rationale',p_rationale),auth.uid());
  return v_id;
end $$;

create function public.open_finance_period(p_organization_id uuid,p_period_start date)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_end date;
begin
  if not private.can_administer_org(p_organization_id) then raise exception 'director access required' using errcode='42501'; end if;
  if p_period_start is null or p_period_start<>date_trunc('month',p_period_start)::date then raise exception 'calendar month start required'; end if;
  v_end:=(p_period_start+interval '1 month - 1 day')::date;
  insert into public.finance_periods(organization_id,period_start,period_end,created_by)
  values(p_organization_id,p_period_start,v_end,auth.uid())
  on conflict (organization_id,period_start) do nothing;
  select id into v_id from public.finance_periods where organization_id=p_organization_id and period_start=p_period_start;
  insert into public.finance_period_events(organization_id,period_id,event_kind,close_version,actor_id)
  select p_organization_id,v_id,'created',0,auth.uid() where not exists(
    select 1 from public.finance_period_events where organization_id=p_organization_id and period_id=v_id and event_kind='created');
  return v_id;
end $$;

create function public.match_finance_allocation(p_period_id uuid,p_allocation_id uuid,p_type text,
  p_entity_id uuid,p_amount numeric,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_period public.finance_periods%rowtype;
begin
  select * into v_period from public.finance_periods where id=p_period_id for update;
  if not found or not private.can_administer_org(v_period.organization_id) then
    raise exception 'director period access required' using errcode='42501'; end if;
  if length(trim(coalesce(p_reason,'')))<4 then raise exception 'match explanation required'; end if;
  return private.finance_create_link(v_period,p_allocation_id,p_type,p_entity_id,p_amount,
    'manual_v1',trim(p_reason));
end $$;

create function public.void_finance_match(p_link_id uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare v_link public.finance_reconciliation_links%rowtype; v_period public.finance_periods%rowtype;
begin
  select * into v_link from public.finance_reconciliation_links where id=p_link_id;
  if not found or not private.can_administer_org(v_link.organization_id) then
    raise exception 'director link access required' using errcode='42501'; end if;
  select * into v_period from public.finance_periods where id=v_link.period_id for update;
  if v_period.state='closed' then raise exception 'reopen period before correction'; end if;
  if length(trim(coalesce(p_reason,'')))<4 then raise exception 'void reason required'; end if;
  update public.finance_reconciliation_links set state='voided',voided_by=auth.uid(),
    voided_at=now(),void_reason=trim(p_reason) where id=p_link_id and state='active';
  if not found then raise exception 'link already voided'; end if;
  insert into public.finance_reconciliation_events(organization_id,link_id,event_kind,detail,actor_id)
  values(v_link.organization_id,v_link.id,'voided',jsonb_build_object('reason',trim(p_reason)),auth.uid());
end $$;

create function private.finance_period_metrics(p_period public.finance_periods)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_complete_batches bigint; v_incomplete_batches bigint; v_accepted_batches bigint;
  v_operational_count bigint; v_operational_amount numeric; v_matched_count bigint; v_matched_amount numeric;
  v_source_count bigint; v_source_amount numeric; v_unallocated_amount numeric;
  v_unallocated_rows numeric; v_invalid_count bigint; v_invalid_links bigint; v_ambiguous_count bigint;
  v_batch_fingerprint text; v_source_fingerprint text; v_operational_fingerprint text;
begin
  select count(*) filter (where b.completeness='complete' and b.service_period_start<=p_period.period_start
      and b.service_period_end>=p_period.period_end),
    count(*) filter (where b.completeness<>'complete'),count(*),
    md5(coalesce(string_agg(b.id::text||':'||b.completeness,',' order by b.id),''))
  into v_complete_batches,v_incomplete_batches,v_accepted_batches,v_batch_fingerprint
  from public.finance_import_batches b where b.organization_id=p_period.organization_id
    and b.state='accepted' and b.service_period_start<=p_period.period_end
    and b.service_period_end>=p_period.period_start;
  select count(*),coalesce(sum(o.amount),0),
    md5(coalesce(string_agg(o.entity_type||':'||o.entity_id::text||':'||o.amount::text,','
      order by o.entity_type,o.entity_id),''))
  into v_operational_count,v_operational_amount,v_operational_fingerprint
  from private.finance_operational_records o where o.organization_id=p_period.organization_id
    and o.service_date between p_period.period_start and p_period.period_end and o.amount>0;
  select count(*),coalesce(sum(l.matched_amount),0) into v_matched_count,v_matched_amount
  from public.finance_reconciliation_links l where l.organization_id=p_period.organization_id
    and l.period_id=p_period.id and l.state='active';
  select count(*),coalesce(sum(abs(a.amount)),0),
    coalesce(sum(case when a.amount>0 then greatest(a.amount-coalesce(x.used,0),0)
      else abs(a.amount) end),0),
    md5(coalesce(string_agg(a.id::text||':'||a.amount::text,',' order by a.id),''))
  into v_source_count,v_source_amount,v_unallocated_amount,v_source_fingerprint
  from public.finance_source_allocations a
  join public.finance_source_rows r on r.organization_id=a.organization_id and r.id=a.source_row_id
  join public.finance_import_batches b on b.organization_id=r.organization_id and b.id=r.import_batch_id
  left join lateral (select sum(l.matched_amount) used from public.finance_reconciliation_links l
    where l.organization_id=a.organization_id and l.source_allocation_id=a.id and l.state='active') x on true
  where a.organization_id=p_period.organization_id and b.state='accepted'
    and r.service_period between p_period.period_start and p_period.period_end
    and r.category in ('direct_labour','supplies','repairs','other_direct_cost')
    and r.approval_state='approved' and r.recognition_state='actual';
  select coalesce(sum(abs(r.amount)),0) into v_unallocated_rows
  from public.finance_source_rows r
  join public.finance_import_batches b on b.organization_id=r.organization_id and b.id=r.import_batch_id
  where r.organization_id=p_period.organization_id and b.state='accepted'
    and r.service_period between p_period.period_start and p_period.period_end
    and not exists(select 1 from public.finance_source_allocations a
      where a.organization_id=r.organization_id and a.source_row_id=r.id);
  v_unallocated_amount:=v_unallocated_amount+v_unallocated_rows;
  select count(*) into v_invalid_count from public.finance_source_rows r
  join public.finance_import_batches b on b.organization_id=r.organization_id and b.id=r.import_batch_id
  where r.organization_id=p_period.organization_id and b.state='accepted'
    and r.service_period between p_period.period_start and p_period.period_end
    and (r.currency<>p_period.currency or b.currency<>p_period.currency
      or r.service_period<b.service_period_start or r.service_period>b.service_period_end
      or r.allocation_state<>'allocated'
      or (r.category in ('direct_labour','supplies','repairs','other_direct_cost')
        and (r.approval_state<>'approved' or r.recognition_state<>'actual' or r.amount<=0))
      or (r.allocation_state='allocated' and
        coalesce((select sum(a.amount) from public.finance_source_allocations a
          where a.organization_id=r.organization_id and a.source_row_id=r.id),0)<>r.amount));
  select count(*) into v_invalid_links from public.finance_reconciliation_links l
  left join public.finance_source_allocations a on a.organization_id=l.organization_id and a.id=l.source_allocation_id
  left join public.finance_source_rows r on r.organization_id=l.organization_id and r.id=l.source_row_id
  left join public.finance_import_batches b on b.organization_id=r.organization_id and b.id=r.import_batch_id
  left join private.finance_operational_records o on o.organization_id=l.organization_id
    and o.entity_type=l.operational_entity_type and o.entity_id=l.operational_entity_id
  where l.organization_id=p_period.organization_id and l.period_id=p_period.id and l.state='active'
    and (a.id is null or r.id is null or b.state<>'accepted' or o.entity_id is null
      or r.approval_state<>'approved' or r.recognition_state<>'actual'
      or a.source_row_id<>r.id or a.site_id<>l.site_id or o.site_id<>l.site_id
      or o.category<>r.category or o.project_id is distinct from a.project_id
      or o.currency<>l.currency or r.currency<>l.currency
      or r.service_period not between p_period.period_start and p_period.period_end
      or o.service_date not between p_period.period_start and p_period.period_end
      or (select sum(x.matched_amount) from public.finance_reconciliation_links x
          where x.organization_id=l.organization_id and x.source_allocation_id=l.source_allocation_id and x.state='active')>a.amount
      or (select sum(x.matched_amount) from public.finance_reconciliation_links x
          where x.organization_id=l.organization_id and x.operational_entity_type=l.operational_entity_type
            and x.operational_entity_id=l.operational_entity_id and x.state='active')>o.amount);
  select count(*) into v_ambiguous_count from (
    select a.id from public.finance_source_allocations a
    join public.finance_source_rows r on r.organization_id=a.organization_id and r.id=a.source_row_id
    join public.finance_import_batches b on b.organization_id=r.organization_id and b.id=r.import_batch_id
    join private.finance_operational_records o on o.organization_id=a.organization_id
      and o.site_id=a.site_id and o.category=r.category and o.currency=r.currency
      and o.project_id is not distinct from a.project_id and o.amount=a.amount
      and o.service_date between p_period.period_start and p_period.period_end
    where a.organization_id=p_period.organization_id and b.state='accepted'
      and r.service_period between p_period.period_start and p_period.period_end
      and private.finance_match_rule(r,a,o) is not null
      and not exists(select 1 from public.finance_reconciliation_links l
        where l.organization_id=a.organization_id and l.source_allocation_id=a.id and l.state='active')
    group by a.id having count(*)>1
  ) ambiguous_allocations;
  return jsonb_build_object(
    'acceptedBatches',v_accepted_batches,'completeCoverageBatches',v_complete_batches,
    'incompleteBatches',v_incomplete_batches,'operationalCount',v_operational_count,
    'operationalAmount',v_operational_amount,'matchedCount',v_matched_count,
    'matchedAmount',v_matched_amount,
    'unmatchedOperationalAmount',greatest(v_operational_amount-v_matched_amount,0),
    'sourceAllocationCount',v_source_count,'sourceAmount',v_source_amount,
    'unallocatedSourceAmount',v_unallocated_amount,'ambiguousSourceCount',v_ambiguous_count,
    'invalidSourceCount',v_invalid_count,'invalidLinkCount',v_invalid_links,
    'batchFingerprint',v_batch_fingerprint,'sourceFingerprint',v_source_fingerprint,
    'operationalFingerprint',v_operational_fingerprint,
    'coverage',case when v_complete_batches=0 then 'missing'
      when v_incomplete_batches>0 then 'incomplete' else 'complete' end);
end $$;

create function public.list_finance_period_status()
returns table(period_id uuid,period_start date,period_end date,currency text,state text,
  close_version integer,metrics jsonb,stale boolean)
language plpgsql security definer set search_path='' as $$
declare p public.finance_periods%rowtype; v_metrics jsonb;
begin
  for p in select * from public.finance_periods where private.can_administer_org(organization_id)
    order by period_start desc loop
    v_metrics:=private.finance_period_metrics(p);
    period_id:=p.id; period_start:=p.period_start; period_end:=p.period_end;
    currency:=p.currency;state:=p.state;close_version:=p.close_version;
    metrics:=v_metrics;stale:=p.state='closed' and p.close_snapshot is distinct from v_metrics;
    return next;
  end loop;
end $$;

create function public.list_finance_period_site_status()
returns table(period_id uuid,site_id uuid,period_start date,currency text,state text,
  coverage text,operational_count bigint,operational_amount numeric,matched_amount numeric,
  unmatched_amount numeric,unallocated_source_amount numeric,stale boolean)
language plpgsql security definer set search_path='' as $$
declare p public.finance_periods%rowtype; s public.sites%rowtype; v_metrics jsonb;
begin
  for p in select * from public.finance_periods order by period_start desc loop
    for s in select * from public.sites where organization_id=p.organization_id
      and private.can_view_site_finance(organization_id,id) loop
      v_metrics:=private.finance_period_metrics(p);
      period_id:=p.id;site_id:=s.id;period_start:=p.period_start;currency:=p.currency;
      state:=p.state;coverage:=v_metrics->>'coverage';
      select count(*),coalesce(sum(o.amount),0) into operational_count,operational_amount
        from private.finance_operational_records o where o.organization_id=p.organization_id
        and o.site_id=s.id and o.service_date between p.period_start and p.period_end and o.amount>0;
      select coalesce(sum(l.matched_amount),0) into matched_amount
        from public.finance_reconciliation_links l where l.organization_id=p.organization_id
        and l.period_id=p.id and l.site_id=s.id and l.state='active';
      unmatched_amount:=greatest(operational_amount-matched_amount,0);
      select coalesce(sum(case when a.amount>0 then greatest(a.amount-coalesce(x.used,0),0)
        else abs(a.amount) end),0) into unallocated_source_amount
        from public.finance_source_allocations a
        join public.finance_source_rows r on r.organization_id=a.organization_id and r.id=a.source_row_id
        join public.finance_import_batches b on b.organization_id=r.organization_id and b.id=r.import_batch_id
        left join lateral (select sum(l.matched_amount) used from public.finance_reconciliation_links l
          where l.organization_id=a.organization_id and l.source_allocation_id=a.id and l.state='active') x on true
        where a.organization_id=p.organization_id and a.site_id=s.id and b.state='accepted'
          and r.service_period between p.period_start and p.period_end
          and r.category in ('direct_labour','supplies','repairs','other_direct_cost')
          and r.approval_state='approved' and r.recognition_state='actual';
      stale:=p.state='closed' and p.close_snapshot is distinct from v_metrics;
      return next;
    end loop;
  end loop;
end $$;

create function public.review_finance_period(p_period_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare p public.finance_periods%rowtype;
begin
  select * into p from public.finance_periods where id=p_period_id for update;
  if not found or not private.can_administer_org(p.organization_id) then
    raise exception 'director period access required' using errcode='42501'; end if;
  if p.state not in ('open','reopened') then raise exception 'period cannot enter review'; end if;
  update public.finance_periods set state='review' where id=p.id;
  insert into public.finance_period_events(organization_id,period_id,event_kind,close_version,actor_id)
  values(p.organization_id,p.id,'review',p.close_version,auth.uid());
end $$;

create function public.close_finance_period(p_period_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.finance_periods%rowtype; v_metrics jsonb;
begin
  select * into p from public.finance_periods where id=p_period_id for update;
  if not found or not private.can_administer_org(p.organization_id) then
    raise exception 'director period access required' using errcode='42501'; end if;
  if p.state<>'review' then raise exception 'period must be in review before close'; end if;
  v_metrics:=private.finance_period_metrics(p);
  if (v_metrics->>'completeCoverageBatches')::integer=0
    or (v_metrics->>'incompleteBatches')::integer>0
    or (v_metrics->>'unmatchedOperationalAmount')::numeric>0
    or (v_metrics->>'unallocatedSourceAmount')::numeric>0
    or (v_metrics->>'ambiguousSourceCount')::integer>0
    or (v_metrics->>'invalidSourceCount')::integer>0
    or (v_metrics->>'invalidLinkCount')::integer>0 then
    raise exception 'period has missing coverage or unresolved material amounts'; end if;
  update public.finance_periods set state='closed',close_version=close_version+1,
    close_snapshot=v_metrics,closed_by=auth.uid(),closed_at=now() where id=p.id;
  insert into public.finance_period_events(organization_id,period_id,event_kind,
    close_version,snapshot,actor_id)
  values(p.organization_id,p.id,'closed',p.close_version+1,v_metrics,auth.uid());
  return v_metrics;
end $$;

create function public.reopen_finance_period(p_period_id uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare p public.finance_periods%rowtype;
begin
  select * into p from public.finance_periods where id=p_period_id for update;
  if not found or not private.can_administer_org(p.organization_id) then
    raise exception 'director period access required' using errcode='42501'; end if;
  if p.state<>'closed' then raise exception 'only closed periods may be reopened'; end if;
  if length(trim(coalesce(p_reason,'')))<4 then raise exception 'reopen reason required'; end if;
  update public.finance_periods set state='reopened',closed_by=null,closed_at=null where id=p.id;
  insert into public.finance_period_events(organization_id,period_id,event_kind,
    close_version,snapshot,reason,actor_id)
  values(p.organization_id,p.id,'reopened',p.close_version,p.close_snapshot,trim(p_reason),auth.uid());
end $$;

revoke all on function public.open_finance_period(uuid,date),
  public.match_finance_allocation(uuid,uuid,text,uuid,numeric,text),public.void_finance_match(uuid,text),
  public.list_finance_match_candidates(uuid),public.list_finance_operational_rows(uuid),public.run_finance_auto_match(uuid),
  public.list_finance_period_status(),public.list_finance_period_site_status(),
  public.review_finance_period(uuid),public.close_finance_period(uuid),
  public.reopen_finance_period(uuid,text) from public,anon;
grant execute on function public.open_finance_period(uuid,date),
  public.match_finance_allocation(uuid,uuid,text,uuid,numeric,text),public.void_finance_match(uuid,text),
  public.list_finance_match_candidates(uuid),public.list_finance_operational_rows(uuid),public.run_finance_auto_match(uuid),
  public.list_finance_period_status(),public.list_finance_period_site_status(),
  public.review_finance_period(uuid),public.close_finance_period(uuid),
  public.reopen_finance_period(uuid,text) to authenticated;
revoke all on function private.finance_match_rule(public.finance_source_rows,public.finance_source_allocations,private.finance_operational_records),
  private.finance_create_link(public.finance_periods,uuid,text,uuid,numeric,text,text),
  private.finance_period_metrics(public.finance_periods) from public,anon,authenticated;
