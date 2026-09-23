-- CLEAN-037: one-off project contribution. Accounting imports remain source of truth.
create table public.projects (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  site_id uuid not null, contract_id uuid, project_code text not null
    check (project_code ~ '^[A-Z0-9][A-Z0-9_-]{1,39}$'),
  name text not null check (length(trim(name)) between 2 and 160),
  scope text not null check (length(trim(scope)) between 4 and 2000),
  state text not null default 'draft' check (state in ('draft','active','completed','cancelled')),
  starts_on date, ends_on date, currency text not null default 'CAD' check (currency ~ '^[A-Z]{3}$'),
  costs_complete boolean not null default false,
  created_by uuid not null references auth.users(id), approved_by uuid references auth.users(id),
  approved_at timestamptz, created_at timestamptz not null default now(),
  unique (organization_id,id), unique (organization_id,site_id,id), unique (organization_id,project_code),
  foreign key (organization_id,site_id) references public.sites(organization_id,id),
  foreign key (organization_id,site_id,contract_id) references public.contracts(organization_id,site_id,id),
  check (ends_on is null or starts_on is null or ends_on>=starts_on),
  check ((state='draft')=(approved_by is null and approved_at is null))
);
create index projects_site_state on public.projects(organization_id,site_id,state,starts_on);

create table public.project_revenue_terms (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  site_id uuid not null, project_id uuid not null,
  pricing_model text not null check (pricing_model in ('fixed','hourly')),
  fixed_quote numeric(14,2), hourly_rate numeric(12,4),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  approved_by uuid not null references auth.users(id), approved_at timestamptz not null default now(),
  unique (organization_id,project_id),
  foreign key (organization_id,site_id,project_id) references public.projects(organization_id,site_id,id),
  check ((pricing_model='fixed' and fixed_quote is not null and fixed_quote>=0 and hourly_rate is null) or
    (pricing_model='hourly' and hourly_rate is not null and hourly_rate>=0 and fixed_quote is null))
);
create table public.project_billable_approvals (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  site_id uuid not null, project_id uuid not null, time_entry_id uuid not null,
  billable_hours numeric(10,6) not null check (billable_hours>0 and billable_hours<=24),
  approved_by uuid not null references auth.users(id), approved_at timestamptz not null default now(),
  unique (organization_id,time_entry_id),
  foreign key (organization_id,site_id,project_id) references public.projects(organization_id,site_id,id),
  foreign key (organization_id,site_id,time_entry_id) references public.time_entries(organization_id,site_id,id)
);
create table public.project_invoices (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  site_id uuid not null, project_id uuid not null,
  invoice_reference text not null check (length(trim(invoice_reference)) between 2 and 160),
  invoiced_on date not null, amount numeric(14,2) not null check (amount>0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  recorded_by uuid not null references auth.users(id), created_at timestamptz not null default now(),
  unique (organization_id,invoice_reference),
  foreign key (organization_id,site_id,project_id) references public.projects(organization_id,site_id,id)
);
create table public.project_source_links (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null,
  site_id uuid not null, project_id uuid not null,
  source_type text not null check (source_type in ('expense','inventory_issue','accounting')),
  source_id uuid not null, linked_by uuid not null references auth.users(id),
  linked_at timestamptz not null default now(),
  unique (organization_id,source_type,source_id),
  foreign key (organization_id,site_id,project_id) references public.projects(organization_id,site_id,id)
);

alter table public.time_entries add column project_id uuid,
  add constraint time_entries_project_fk foreign key (organization_id,site_id,project_id)
  references public.projects(organization_id,site_id,id);
alter table public.labor_cost_entries add column project_id uuid,
  add constraint labor_cost_entries_project_fk foreign key (organization_id,site_id,project_id)
  references public.projects(organization_id,site_id,id);
alter table public.expense_allocations add column project_id uuid,
  add constraint expense_allocations_project_fk foreign key (organization_id,site_id,project_id)
  references public.projects(organization_id,site_id,id);
alter table public.expense_postings add column project_id uuid,
  add constraint expense_postings_project_fk foreign key (organization_id,site_id,project_id)
  references public.projects(organization_id,site_id,id);
alter table public.inventory_transactions add column project_id uuid,
  add constraint inventory_transactions_project_fk foreign key (organization_id,site_id,project_id)
  references public.projects(organization_id,site_id,id);
alter table public.finance_source_allocations add column project_id uuid,
  add constraint finance_source_allocations_project_fk foreign key (organization_id,site_id,project_id)
  references public.projects(organization_id,site_id,id);
create index labor_cost_project on public.labor_cost_entries(organization_id,project_id) where project_id is not null;
create index expense_postings_project on public.expense_postings(organization_id,project_id) where project_id is not null;
create index inventory_transactions_project on public.inventory_transactions(organization_id,project_id) where project_id is not null;
create index finance_source_allocations_project on public.finance_source_allocations(organization_id,project_id) where project_id is not null;

-- Resolve legacy text references at the point of posting, without changing the
-- authenticated import or time-posting interfaces.
create function private.resolve_project_reference() returns trigger language plpgsql set search_path='' as $$
begin
  if new.project_id is null then
    select p.id into new.project_id from public.projects p
      where p.organization_id=new.organization_id and p.site_id=new.site_id
        and p.project_code=upper(trim(new.project_reference)) and p.state<>'cancelled';
  end if;
  return new;
end $$;
create trigger resolve_time_project before insert or update of project_reference on public.time_entries
  for each row execute function private.resolve_project_reference();
create trigger resolve_labor_project before insert on public.labor_cost_entries
  for each row execute function private.resolve_project_reference();
create trigger resolve_expense_allocation_project before insert on public.expense_allocations
  for each row execute function private.resolve_project_reference();
create trigger resolve_expense_posting_project before insert on public.expense_postings
  for each row execute function private.resolve_project_reference();
create function private.resolve_accounting_project() returns trigger language plpgsql set search_path='' as $$
begin
  if new.project_id is null then
    select p.id into new.project_id from public.projects p
      where p.organization_id=new.organization_id and p.site_id=new.site_id
        and p.project_code=upper(trim(new.job_reference)) and p.state<>'cancelled';
  end if;
  return new;
end $$;
create trigger resolve_accounting_project before insert on public.finance_source_allocations
  for each row execute function private.resolve_accounting_project();

alter table public.projects enable row level security;
alter table public.project_revenue_terms enable row level security;
alter table public.project_billable_approvals enable row level security;
alter table public.project_invoices enable row level security;
alter table public.project_source_links enable row level security;
grant select on public.projects,public.project_revenue_terms,public.project_billable_approvals,public.project_invoices,public.project_source_links to authenticated;
grant all on public.projects,public.project_revenue_terms,public.project_billable_approvals,public.project_invoices,public.project_source_links to service_role;
create policy projects_read on public.projects for select to authenticated using (private.can_view_site_finance(organization_id,site_id));
create policy project_terms_read on public.project_revenue_terms for select to authenticated using (private.can_administer_org(organization_id));
create policy project_billable_read on public.project_billable_approvals for select to authenticated using (private.can_administer_org(organization_id));
create policy project_invoices_read on public.project_invoices for select to authenticated using (private.can_administer_org(organization_id));
create policy project_source_links_read on public.project_source_links for select to authenticated using (private.can_view_site_finance(organization_id,site_id));

create function public.create_finance_project(p_site_id uuid,p_project_code text,p_name text,p_scope text,
  p_contract_id uuid default null,p_starts_on date default null,p_ends_on date default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_id uuid;
begin
  select s.organization_id into v_org from public.sites s where s.id=p_site_id;
  if v_org is null or not private.can_view_site_finance(v_org,p_site_id) then
    raise exception 'site project access required' using errcode='42501'; end if;
  insert into public.projects(organization_id,site_id,contract_id,project_code,name,scope,starts_on,ends_on,created_by)
  values(v_org,p_site_id,p_contract_id,upper(trim(p_project_code)),trim(p_name),trim(p_scope),p_starts_on,p_ends_on,auth.uid())
  returning id into v_id;
  return v_id;
end $$;
create function public.update_finance_project_scope(p_project_id uuid,p_name text,p_scope text,
  p_contract_id uuid default null,p_starts_on date default null,p_ends_on date default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_project public.projects%rowtype;
begin
  select * into v_project from public.projects where id=p_project_id for update;
  if not found or not private.can_view_site_finance(v_project.organization_id,v_project.site_id) then
    raise exception 'site project access required' using errcode='42501'; end if;
  if v_project.state<>'draft' then raise exception 'only draft scope is editable'; end if;
  update public.projects set name=trim(p_name),scope=trim(p_scope),contract_id=p_contract_id,
    starts_on=p_starts_on,ends_on=p_ends_on where id=p_project_id;
end $$;
create function public.approve_finance_project(p_project_id uuid,p_pricing_model text,
  p_fixed_quote numeric default null,p_hourly_rate numeric default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_project public.projects%rowtype;
begin
  select * into v_project from public.projects where id=p_project_id for update;
  if not found or not private.can_administer_org(v_project.organization_id) then
    raise exception 'director project access required' using errcode='42501'; end if;
  if v_project.state<>'draft' then raise exception 'only draft projects may be activated'; end if;
  insert into public.project_revenue_terms(organization_id,site_id,project_id,pricing_model,fixed_quote,hourly_rate,currency,approved_by)
  values(v_project.organization_id,v_project.site_id,v_project.id,p_pricing_model,p_fixed_quote,p_hourly_rate,v_project.currency,auth.uid());
  update public.projects set state='active',approved_by=auth.uid(),approved_at=now() where id=p_project_id;
end $$;
create function public.assign_finance_project_time(p_project_id uuid,p_time_entry_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_project public.projects%rowtype;
begin
  select * into v_project from public.projects where id=p_project_id;
  if not found or not private.can_view_site_finance(v_project.organization_id,v_project.site_id) then
    raise exception 'site project access required' using errcode='42501'; end if;
  if v_project.state not in ('draft','active') then raise exception 'project is closed'; end if;
  if exists(select 1 from public.project_billable_approvals where organization_id=v_project.organization_id
    and time_entry_id=p_time_entry_id) then raise exception 'billable time allocation is already approved'; end if;
  update public.time_entries set project_id=v_project.id,project_reference=v_project.project_code
    where id=p_time_entry_id and organization_id=v_project.organization_id and site_id=v_project.site_id
      and state in ('draft','exception','approved');
  if not found then raise exception 'editable time entry at this site required'; end if;
end $$;
create function public.approve_finance_project_billable_time(p_project_id uuid,p_time_entry_id uuid,p_hours numeric)
returns void language plpgsql security definer set search_path='' as $$
declare v_project public.projects%rowtype; v_hours numeric;
begin
  select * into v_project from public.projects where id=p_project_id;
  if not found or not private.can_administer_org(v_project.organization_id) then
    raise exception 'director project access required' using errcode='42501'; end if;
  if v_project.state<>'active' then raise exception 'project must be active for billable approval'; end if;
  select t.hours into v_hours from public.time_entries t where t.id=p_time_entry_id
    and t.organization_id=v_project.organization_id and t.site_id=v_project.site_id
    and t.project_id=v_project.id and t.state in ('approved','posted');
  if v_hours is null or p_hours<=0 or p_hours>v_hours then raise exception 'billable hours exceed approved project time'; end if;
  insert into public.project_billable_approvals(organization_id,site_id,project_id,time_entry_id,billable_hours,approved_by)
  values(v_project.organization_id,v_project.site_id,v_project.id,p_time_entry_id,p_hours,auth.uid())
  on conflict (organization_id,time_entry_id) do update set billable_hours=excluded.billable_hours,
    approved_by=excluded.approved_by,approved_at=now();
end $$;
create function public.record_finance_project_invoice(p_project_id uuid,p_reference text,p_date date,p_amount numeric)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_project public.projects%rowtype; v_id uuid;
begin
  select * into v_project from public.projects where id=p_project_id;
  if not found or not private.can_administer_org(v_project.organization_id) then
    raise exception 'director project access required' using errcode='42501'; end if;
  insert into public.project_invoices(organization_id,site_id,project_id,invoice_reference,invoiced_on,amount,currency,recorded_by)
  values(v_project.organization_id,v_project.site_id,v_project.id,trim(p_reference),p_date,p_amount,v_project.currency,auth.uid())
  returning id into v_id;
  return v_id;
end $$;
create function public.set_finance_project_completion(p_project_id uuid,p_complete boolean)
returns void language plpgsql security definer set search_path='' as $$
declare v_project public.projects%rowtype;
begin
  select * into v_project from public.projects where id=p_project_id for update;
  if not found or not private.can_administer_org(v_project.organization_id) then
    raise exception 'director project access required' using errcode='42501'; end if;
  if v_project.state='draft' or v_project.state='cancelled' then raise exception 'project is not active'; end if;
  update public.projects set costs_complete=p_complete,state=case when p_complete then 'completed' else 'active' end where id=p_project_id;
end $$;
create function public.cancel_finance_project(p_project_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_project public.projects%rowtype;
begin
  select * into v_project from public.projects where id=p_project_id for update;
  if not found or not private.can_administer_org(v_project.organization_id) then
    raise exception 'director project access required' using errcode='42501'; end if;
  if v_project.state<>'active' then raise exception 'only active projects may be cancelled'; end if;
  update public.projects set state='cancelled',costs_complete=false where id=p_project_id;
end $$;
create function public.assign_finance_project_source(p_project_id uuid,p_source_type text,p_source_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_project public.projects%rowtype; v_existing_project uuid;
begin
  select * into v_project from public.projects where id=p_project_id;
  if not found or not private.can_administer_org(v_project.organization_id) then
    raise exception 'director project access required' using errcode='42501'; end if;
  if v_project.state<>'active' then raise exception 'project must be active for source linkage'; end if;
  if p_source_type='expense' then
    select project_id into v_existing_project from public.expense_postings
      where id=p_source_id and organization_id=v_project.organization_id and site_id=v_project.site_id
        and category<>'equipment_purchase';
  elsif p_source_type='inventory_issue' then
    select project_id into v_existing_project from public.inventory_transactions
      where id=p_source_id and organization_id=v_project.organization_id and site_id=v_project.site_id
        and transaction_type='issue';
  elsif p_source_type='accounting' then
    select project_id into v_existing_project from public.finance_source_allocations
      where id=p_source_id and organization_id=v_project.organization_id and site_id=v_project.site_id;
  else raise exception 'unsupported project source'; end if;
  if not found then raise exception 'eligible source at this site required'; end if;
  if v_existing_project is not null and v_existing_project<>v_project.id then
    raise exception 'source is assigned to another project'; end if;
  insert into public.project_source_links(organization_id,site_id,project_id,source_type,source_id,linked_by)
  values(v_project.organization_id,v_project.site_id,v_project.id,p_source_type,p_source_id,auth.uid())
  on conflict (organization_id,source_type,source_id) do nothing;
  if exists(select 1 from public.project_source_links where organization_id=v_project.organization_id
    and source_type=p_source_type and source_id=p_source_id and project_id<>v_project.id) then
    raise exception 'source is linked to another project'; end if;
end $$;

-- A project is a dimension on source ledgers. Imported accounting direct costs
-- are shown as reconciliation evidence, not added to operational costs again.
create function public.list_finance_projects(p_site_id uuid default null)
returns table(project_id uuid,site_id uuid,project_code text,name text,state text,currency text,
  pricing_model text,expected_revenue numeric,invoiced_revenue numeric,recognized_revenue numeric,
  labour_cost numeric,expense_cost numeric,supply_cost numeric,direct_cost numeric,
  expected_contribution numeric,recognized_contribution numeric,recognized_margin_pct numeric,
  completeness text)
language plpgsql security definer set search_path='' as $$
begin
  return query
  select p.id,p.site_id,p.project_code,p.name,p.state,p.currency,t.pricing_model,
    case when t.pricing_model='fixed' then t.fixed_quote
      when t.pricing_model='hourly' then round(coalesce(b.hours,0)*t.hourly_rate,2) end,
    coalesce(i.amount,0),coalesce(a.amount,0),coalesce(l.amount,0),coalesce(e.amount,0),coalesce(s.amount,0),
    coalesce(l.amount,0)+coalesce(e.amount,0)+coalesce(s.amount,0),
    case when t.id is not null then (case when t.pricing_model='fixed' then t.fixed_quote else round(coalesce(b.hours,0)*t.hourly_rate,2) end)
      -coalesce(l.amount,0)-coalesce(e.amount,0)-coalesce(s.amount,0) end,
    case when p.costs_complete and a.complete and a.amount is not null then a.amount-coalesce(l.amount,0)-coalesce(e.amount,0)-coalesce(s.amount,0) end,
    case when p.costs_complete and a.complete and a.amount>0 then round(100*(a.amount-coalesce(l.amount,0)-coalesce(e.amount,0)-coalesce(s.amount,0))/a.amount,2) end,
    case when p.state='draft' then 'draft' when not p.costs_complete or not coalesce(a.complete,false) then 'incomplete' else 'complete' end
  from public.projects p
  left join public.project_revenue_terms t on t.organization_id=p.organization_id and t.project_id=p.id
  left join lateral (select sum(x.billable_hours) hours from public.project_billable_approvals x where x.organization_id=p.organization_id and x.project_id=p.id) b on true
  left join lateral (select sum(x.amount) amount from public.project_invoices x where x.organization_id=p.organization_id and x.project_id=p.id) i on true
  left join lateral (select sum(x.total_cost) amount from public.labor_cost_entries x where x.organization_id=p.organization_id and x.project_id=p.id) l on true
  left join lateral (select sum(x.amount) amount from public.expense_postings x where x.organization_id=p.organization_id and x.category<>'equipment_purchase'
    and (x.project_id=p.id or (x.project_id is null and exists(select 1 from public.project_source_links link
      where link.organization_id=x.organization_id and link.source_type='expense' and link.source_id=x.id and link.project_id=p.id)))) e on true
  left join lateral (select sum(x.total_cost) amount from public.inventory_transactions x where x.organization_id=p.organization_id and x.transaction_type='issue'
    and (x.project_id=p.id or (x.project_id is null and exists(select 1 from public.project_source_links link
      where link.organization_id=x.organization_id and link.source_type='inventory_issue' and link.source_id=x.id and link.project_id=p.id)))) s on true
  left join lateral (select sum(x.amount) filter (where r.category='revenue' and r.approval_state='approved' and r.recognition_state='actual' and q.state='accepted') amount,
    bool_and(q.completeness='complete') filter (where r.category='revenue' and r.approval_state='approved' and r.recognition_state='actual' and q.state='accepted') complete
    from public.finance_source_allocations x join public.finance_source_rows r on r.organization_id=x.organization_id and r.id=x.source_row_id
      join public.finance_import_batches q on q.organization_id=r.organization_id and q.id=r.import_batch_id
    where x.organization_id=p.organization_id and (x.project_id=p.id or (x.project_id is null and exists(
      select 1 from public.project_source_links link where link.organization_id=x.organization_id
        and link.source_type='accounting' and link.source_id=x.id and link.project_id=p.id)))) a on true
  where (p_site_id is null or p.site_id=p_site_id)
    and private.can_view_site_finance(p.organization_id,p.site_id)
  order by p.created_at desc;
end $$;
create function public.list_finance_project_reconciliation()
returns table(project_id uuid,recognized_source_count bigint,unresolved_source_count bigint,incomplete_source_count bigint)
language sql security definer set search_path='' as $$
  select p.id,
    count(a.id) filter (where (a.project_id=p.id or exists(select 1 from public.project_source_links l
      where l.organization_id=a.organization_id and l.source_type='accounting' and l.source_id=a.id and l.project_id=p.id))
      and r.category='revenue' and r.approval_state='approved'
      and r.recognition_state='actual' and b.state='accepted'),
    count(a.id) filter (where a.project_id is null and upper(trim(a.job_reference))=p.project_code
      and not exists(select 1 from public.project_source_links l where l.organization_id=a.organization_id
        and l.source_type='accounting' and l.source_id=a.id)),
    count(a.id) filter (where (a.project_id=p.id or exists(select 1 from public.project_source_links l
      where l.organization_id=a.organization_id and l.source_type='accounting' and l.source_id=a.id and l.project_id=p.id))
      and r.category='revenue'
      and (b.state<>'accepted' or b.completeness<>'complete' or r.approval_state<>'approved'
        or r.recognition_state<>'actual'))
  from public.projects p
  left join public.finance_source_allocations a on a.organization_id=p.organization_id and a.site_id=p.site_id
    and (a.project_id=p.id or upper(trim(a.job_reference))=p.project_code
      or exists(select 1 from public.project_source_links l where l.organization_id=a.organization_id
        and l.source_type='accounting' and l.source_id=a.id and l.project_id=p.id))
  left join public.finance_source_rows r on r.organization_id=a.organization_id and r.id=a.source_row_id
  left join public.finance_import_batches b on b.organization_id=r.organization_id and b.id=r.import_batch_id
  where private.can_view_site_finance(p.organization_id,p.site_id)
  group by p.id;
$$;
revoke all on function public.create_finance_project(uuid,text,text,text,uuid,date,date),
  public.update_finance_project_scope(uuid,text,text,uuid,date,date),
  public.approve_finance_project(uuid,text,numeric,numeric),
  public.assign_finance_project_time(uuid,uuid),public.approve_finance_project_billable_time(uuid,uuid,numeric),
  public.record_finance_project_invoice(uuid,text,date,numeric),public.set_finance_project_completion(uuid,boolean),
  public.assign_finance_project_source(uuid,text,uuid),public.list_finance_projects(uuid),
  public.cancel_finance_project(uuid),public.list_finance_project_reconciliation() from public,anon;
grant execute on function public.create_finance_project(uuid,text,text,text,uuid,date,date),
  public.update_finance_project_scope(uuid,text,text,uuid,date,date),
  public.approve_finance_project(uuid,text,numeric,numeric),
  public.assign_finance_project_time(uuid,uuid),public.approve_finance_project_billable_time(uuid,uuid,numeric),
  public.record_finance_project_invoice(uuid,text,date,numeric),public.set_finance_project_completion(uuid,boolean),
  public.assign_finance_project_source(uuid,text,uuid),public.list_finance_projects(uuid),
  public.cancel_finance_project(uuid),public.list_finance_project_reconciliation() to authenticated;
