-- CLEAN-020: neutral accounting imports, immutable source rows and reconciled site totals.

create table public.finance_import_batches (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations(id) on delete cascade,
  source_system text not null default 'csv' check (char_length(source_system) between 1 and 80),
  source_file_name text not null check (char_length(source_file_name) between 1 and 255),
  source_file_hash text not null check (source_file_hash ~ '^[0-9a-f]{64}$'), mapping_version text not null check (char_length(mapping_version) between 1 and 80),
  currency text not null check (currency ~ '^[A-Z]{3}$'), service_period_start date not null, service_period_end date not null check (service_period_end >= service_period_start),
  state text not null default 'preview' check (state in ('preview','accepted','superseded','rejected')),
  completeness text not null default 'incomplete' check (completeness in ('complete','incomplete','estimated')),
  accepted_by uuid references auth.users(id) on delete restrict, accepted_at timestamptz, supersedes_batch_id uuid, created_at timestamptz not null default now(),
  unique (organization_id,id), unique (organization_id,source_file_hash,mapping_version),
  foreign key (organization_id,supersedes_batch_id) references public.finance_import_batches(organization_id,id) on delete restrict,
  check ((state in ('accepted','superseded')) = (accepted_by is not null and accepted_at is not null))
);

create table public.finance_source_rows (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, import_batch_id uuid not null,
  source_row_number integer not null check (source_row_number > 0), source_account_id text,
  source_document_id text not null check (char_length(source_document_id) between 1 and 160), source_line_id text not null check (char_length(source_line_id) between 1 and 160),
  site_id uuid, contract_reference text, job_reference text, asset_reference text,
  operational_reference_type text check (operational_reference_type in ('supply_invoice','supply_receipt','repair_invoice','repair_report')), operational_reference_id uuid,
  service_period date not null, accounting_period date not null, currency text not null check (currency ~ '^[A-Z]{3}$'),
  category text not null check (category in ('revenue','direct_labour','supplies','repairs','other_direct_cost','overhead','depreciation','tax','unmapped')),
  amount numeric(16,2) not null check (amount <> 0), tax_amount numeric(16,2) not null default 0,
  tax_treatment text not null default 'exclusive' check (tax_treatment in ('exclusive','inclusive','exempt','unknown')),
  approval_state text not null default 'approved' check (approval_state in ('pending','approved','rejected')),
  recognition_state text not null default 'actual' check (recognition_state in ('actual','estimate','committed')),
  allocation_state text not null default 'unallocated' check (allocation_state in ('allocated','unallocated')),
  supersedes_source_row_id uuid, raw_row jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  unique (organization_id,id), unique (organization_id,import_batch_id,source_row_number), unique (organization_id,import_batch_id,source_document_id,source_line_id),
  foreign key (organization_id,import_batch_id) references public.finance_import_batches(organization_id,id) on delete restrict,
  foreign key (organization_id,site_id) references public.sites(organization_id,id) on delete restrict,
  foreign key (organization_id,supersedes_source_row_id) references public.finance_source_rows(organization_id,id) on delete restrict,
  check (supersedes_source_row_id is null or supersedes_source_row_id <> id), check ((operational_reference_type is null) = (operational_reference_id is null))
);

create table public.finance_source_allocations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, source_row_id uuid not null, site_id uuid not null, job_reference text,
  amount numeric(16,2) not null check (amount <> 0), created_at timestamptz not null default now(), unique (organization_id,id),
  foreign key (organization_id,source_row_id) references public.finance_source_rows(organization_id,id) on delete restrict,
  foreign key (organization_id,site_id) references public.sites(organization_id,id) on delete restrict
);
create unique index finance_source_allocations_natural_key on public.finance_source_allocations (organization_id,source_row_id,site_id,coalesce(job_reference,''));

-- This aggregate is the only imported-finance surface available to Area Managers.
create table public.finance_reconciliations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, import_batch_id uuid not null, site_id uuid not null,
  service_period date not null, currency text not null check (currency ~ '^[A-Z]{3}$'), recognized_revenue numeric(16,2) not null default 0,
  direct_labour numeric(16,2) not null default 0, supplies numeric(16,2) not null default 0, repairs numeric(16,2) not null default 0,
  other_direct_cost numeric(16,2) not null default 0,
  direct_contribution numeric(16,2) generated always as (recognized_revenue-direct_labour-supplies-repairs-other_direct_cost) stored,
  completeness text not null check (completeness in ('complete','incomplete','estimated')), is_current boolean not null default true,
  reconciled_at timestamptz not null default now(), unique (organization_id,id), unique (organization_id,import_batch_id,site_id,service_period),
  foreign key (organization_id,import_batch_id) references public.finance_import_batches(organization_id,id) on delete restrict,
  foreign key (organization_id,site_id) references public.sites(organization_id,id) on delete restrict
);

alter table public.finance_import_batches enable row level security;
alter table public.finance_source_rows enable row level security;
alter table public.finance_source_allocations enable row level security;
alter table public.finance_reconciliations enable row level security;
grant select on public.finance_import_batches,public.finance_source_rows,public.finance_source_allocations,public.finance_reconciliations to authenticated;
grant all on public.finance_import_batches,public.finance_source_rows,public.finance_source_allocations,public.finance_reconciliations to service_role;
create policy finance_import_batches_select on public.finance_import_batches for select to authenticated using (private.can_administer_org(organization_id));
create policy finance_source_rows_select on public.finance_source_rows for select to authenticated using (private.can_administer_org(organization_id));
create policy finance_source_allocations_select on public.finance_source_allocations for select to authenticated using (private.can_administer_org(organization_id));
create policy finance_reconciliations_select on public.finance_reconciliations for select to authenticated using (private.can_view_site_finance(organization_id,site_id));
drop policy if exists labor_cost_entries_select on public.labor_cost_entries;
create policy labor_cost_entries_select on public.labor_cost_entries for select to authenticated using (private.can_administer_org(organization_id));

create or replace function public.stage_finance_csv_import(
  p_organization_id uuid,p_source_file_name text,p_source_file_hash text,p_mapping_version text,p_currency text,
  p_period_start date,p_period_end date,p_rows jsonb,p_supersedes_batch_id uuid default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_batch_id uuid; v_row jsonb; v_source_row_id uuid; v_site_id uuid;
begin
  if not private.can_administer_org(p_organization_id) then raise exception 'director access is required' using errcode='42501'; end if;
  if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)=0 or jsonb_array_length(p_rows)>5000 then raise exception 'import must contain between 1 and 5000 rows' using errcode='22023'; end if;
  insert into public.finance_import_batches (organization_id,source_file_name,source_file_hash,mapping_version,currency,service_period_start,service_period_end,supersedes_batch_id)
  values (p_organization_id,p_source_file_name,p_source_file_hash,p_mapping_version,p_currency,p_period_start,p_period_end,p_supersedes_batch_id)
  on conflict (organization_id,source_file_hash,mapping_version) do update set source_file_name=excluded.source_file_name returning id into v_batch_id;
  if exists (select 1 from public.finance_source_rows where organization_id=p_organization_id and import_batch_id=v_batch_id) then return v_batch_id; end if;
  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_site_id:=nullif(v_row->>'site_id','')::uuid;
    insert into public.finance_source_rows (
      organization_id,import_batch_id,source_row_number,source_account_id,source_document_id,source_line_id,site_id,contract_reference,job_reference,asset_reference,
      operational_reference_type,operational_reference_id,service_period,accounting_period,currency,category,amount,tax_amount,tax_treatment,approval_state,recognition_state,
      allocation_state,supersedes_source_row_id,raw_row
    ) values (
      p_organization_id,v_batch_id,(v_row->>'source_row_number')::integer,nullif(v_row->>'source_account_id',''),v_row->>'source_document_id',v_row->>'source_line_id',v_site_id,
      nullif(v_row->>'contract_reference',''),nullif(v_row->>'job_reference',''),nullif(v_row->>'asset_reference',''),nullif(v_row->>'operational_reference_type',''),
      nullif(v_row->>'operational_reference_id','')::uuid,(v_row->>'service_period')::date,(v_row->>'accounting_period')::date,v_row->>'currency',v_row->>'category',
      (v_row->>'amount')::numeric,coalesce(nullif(v_row->>'tax_amount','')::numeric,0),coalesce(nullif(v_row->>'tax_treatment',''),'exclusive'),coalesce(nullif(v_row->>'approval_state',''),'approved'),
      coalesce(nullif(v_row->>'recognition_state',''),'actual'),case when v_site_id is null or v_row->>'category'='unmapped' then 'unallocated' else 'allocated' end,
      nullif(v_row->>'supersedes_source_row_id','')::uuid,v_row
    ) returning id into v_source_row_id;
    if v_site_id is not null and v_row->>'category'<>'unmapped' then
      insert into public.finance_source_allocations (organization_id,source_row_id,site_id,job_reference,amount)
      values (p_organization_id,v_source_row_id,v_site_id,nullif(v_row->>'job_reference',''),(v_row->>'amount')::numeric);
    end if;
  end loop;
  return v_batch_id;
end; $$;

create or replace function public.accept_finance_import(p_batch_id uuid,p_completeness text)
returns void language plpgsql security definer set search_path='' as $$
declare v_batch public.finance_import_batches%rowtype;
begin
  select * into v_batch from public.finance_import_batches where id=p_batch_id for update;
  if not found or not private.can_administer_org(v_batch.organization_id) then raise exception 'finance import not found or forbidden' using errcode='42501'; end if;
  if v_batch.state='accepted' then return; end if;
  if v_batch.state<>'preview' then raise exception 'only preview imports may be accepted' using errcode='22023'; end if;
  if p_completeness not in ('complete','incomplete','estimated') then raise exception 'invalid completeness state' using errcode='22023'; end if;
  if exists (select 1 from public.finance_source_rows r where r.organization_id=v_batch.organization_id and r.import_batch_id=v_batch.id and r.currency<>v_batch.currency) then raise exception 'currency mismatch'; end if;
  if exists (select 1 from public.finance_source_rows r left join lateral (select coalesce(sum(a.amount),0) amount from public.finance_source_allocations a where a.organization_id=r.organization_id and a.source_row_id=r.id) allocated on true
    where r.organization_id=v_batch.organization_id and r.import_batch_id=v_batch.id and ((r.allocation_state='allocated' and allocated.amount<>r.amount) or (r.allocation_state='unallocated' and allocated.amount<>0))) then raise exception 'allocations do not reconcile'; end if;
  if p_completeness='complete' and exists (select 1 from public.finance_source_rows r where r.organization_id=v_batch.organization_id and r.import_batch_id=v_batch.id
    and (r.allocation_state='unallocated' or r.approval_state<>'approved' or r.recognition_state<>'actual')) then raise exception 'incomplete rows cannot produce a complete reconciliation'; end if;
  if v_batch.supersedes_batch_id is not null then
    update public.finance_import_batches set state='superseded' where organization_id=v_batch.organization_id and id=v_batch.supersedes_batch_id and state='accepted';
    update public.finance_reconciliations set is_current=false where organization_id=v_batch.organization_id and import_batch_id=v_batch.supersedes_batch_id;
  end if;
  update public.finance_import_batches set state='accepted',completeness=p_completeness,accepted_by=auth.uid(),accepted_at=now() where id=v_batch.id;
  insert into public.finance_reconciliations (organization_id,import_batch_id,site_id,service_period,currency,recognized_revenue,direct_labour,supplies,repairs,other_direct_cost,completeness)
  select r.organization_id,r.import_batch_id,a.site_id,r.service_period,v_batch.currency,
    sum(case when r.category='revenue' then a.amount else 0 end),sum(case when r.category='direct_labour' then a.amount else 0 end),
    sum(case when r.category='supplies' then a.amount else 0 end),sum(case when r.category='repairs' then a.amount else 0 end),
    sum(case when r.category='other_direct_cost' then a.amount else 0 end),p_completeness
  from public.finance_source_rows r join public.finance_source_allocations a on a.organization_id=r.organization_id and a.source_row_id=r.id
  where r.organization_id=v_batch.organization_id and r.import_batch_id=v_batch.id and r.approval_state='approved' and r.recognition_state='actual'
  group by r.organization_id,r.import_batch_id,a.site_id,r.service_period;
end; $$;

revoke execute on function public.stage_finance_csv_import(uuid,text,text,text,text,date,date,jsonb,uuid),public.accept_finance_import(uuid,text) from public,anon;
grant execute on function public.stage_finance_csv_import(uuid,text,text,text,text,date,date,jsonb,uuid),public.accept_finance_import(uuid,text) to authenticated,service_role;
