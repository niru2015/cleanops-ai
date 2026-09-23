-- CLEAN-035: candidates are untrusted; only a Director's transaction posts cost.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('expense-receipts','expense-receipts',false,10485760,
  array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create table public.finance_intake_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  site_id uuid,
  source_kind text not null check (source_kind in ('whatsapp','app')),
  source_message_id uuid,
  submitted_by uuid references auth.users(id),
  source_text text not null default '' check (length(source_text)<=8000),
  classifier_version integer not null default 1 check (classifier_version>0),
  proposed jsonb not null default '{}'::jsonb check (jsonb_typeof(proposed)='object'),
  extraction_state text not null default 'pending' check (extraction_state in ('pending','suggested','failed')),
  review_state text not null default 'pending' check (review_state in ('pending','needs_review','resolved','rejected','posted')),
  project_reference text check (length(project_reference)<=180),
  rejection_reason text check (length(rejection_reason)<=500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,source_message_id,classifier_version),
  foreign key (organization_id,site_id) references public.sites(organization_id,id),
  foreign key (organization_id,source_message_id)
    references public.external_messages(organization_id,id) on delete restrict,
  check ((source_kind='whatsapp' and source_message_id is not null and submitted_by is null)
    or (source_kind='app' and source_message_id is null and submitted_by is not null))
);
create index finance_intake_queue on public.finance_intake_items(organization_id,site_id,review_state,created_at desc);

create table public.expense_claims (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  intake_id uuid not null,
  site_id uuid not null,
  contract_id uuid,
  project_reference text check (length(project_reference)<=180),
  vendor text not null check (length(trim(vendor)) between 1 and 200),
  expense_date date not null,
  payment_method text not null check (payment_method in
    ('employee_personal','company_card','company_cash','supplier_invoice','other')),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  subtotal numeric(14,2) check (subtotal>=0),
  tax numeric(14,2) check (tax>=0),
  total numeric(14,2) not null check (total>0),
  category text not null check (category in
    ('meals','fuel_travel','supplies','equipment_purchase','equipment_repair',
     'parking_tolls','contractor','other_direct')),
  status text not null default 'submitted' check (status in
    ('draft','submitted','approved','rejected','posted','reconciled','voided')),
  revision integer not null default 1 check (revision>0),
  review_reason text check (length(review_reason)<=500),
  receipt_sha256 text check (receipt_sha256 ~ '^[0-9a-f]{64}$'),
  asset_review_required boolean generated always as (category='equipment_purchase') stored,
  reimbursement_status text not null default 'not_applicable' check (reimbursement_status in
    ('not_applicable','pending','recorded')),
  reimbursement_reference text check (length(reimbursement_reference)<=180),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,intake_id),
  foreign key (organization_id,intake_id) references public.finance_intake_items(organization_id,id),
  foreign key (organization_id,site_id) references public.sites(organization_id,id),
  foreign key (organization_id,site_id,contract_id)
    references public.contracts(organization_id,site_id,id),
  check (subtotal is null or tax is null or abs(subtotal+tax-total)<=0.01)
);
create unique index expense_one_posted_receipt on public.expense_claims(organization_id,receipt_sha256)
  where status in ('posted','reconciled') and receipt_sha256 is not null;
create index expense_claims_site_status on public.expense_claims(organization_id,site_id,status,expense_date desc);

create table public.expense_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  claim_id uuid not null,
  category text not null check (category in
    ('meals','fuel_travel','supplies','equipment_purchase','equipment_repair',
     'parking_tolls','contractor','other_direct')),
  description text not null check (length(trim(description)) between 1 and 500),
  subtotal numeric(14,2) check (subtotal>=0),
  tax numeric(14,2) check (tax>=0),
  total numeric(14,2) not null check (total>0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  unique (organization_id,id),
  unique (organization_id,claim_id),
  foreign key (organization_id,claim_id) references public.expense_claims(organization_id,id),
  check (subtotal is null or tax is null or abs(subtotal+tax-total)<=0.01)
);

create table public.expense_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  claim_id uuid not null,
  site_id uuid not null,
  project_reference text check (length(project_reference)<=180),
  amount numeric(14,2) not null check (amount>0),
  unique (organization_id,id),
  foreign key (organization_id,claim_id) references public.expense_claims(organization_id,id),
  foreign key (organization_id,site_id) references public.sites(organization_id,id)
);

create table public.expense_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  intake_id uuid not null,
  source_evidence_id uuid,
  storage_bucket text not null check (storage_bucket in ('operational-evidence','expense-receipts')),
  storage_path text not null unique,
  declared_mime text,
  detected_mime text,
  claimed_byte_size bigint check (claimed_byte_size between 1 and 10485760),
  byte_size bigint check (byte_size between 1 and 10485760),
  claimed_sha256 text check (claimed_sha256 ~ '^[0-9a-f]{64}$'),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  extraction_provenance jsonb not null default '{}'::jsonb,
  status text not null check (status in ('staged','ready','quarantined','failed')),
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  unique (organization_id,id),
  unique (organization_id,source_evidence_id),
  foreign key (organization_id,intake_id) references public.finance_intake_items(organization_id,id),
  foreign key (organization_id,source_evidence_id) references public.task_evidence(organization_id,id),
  check ((status='ready')=(sha256 is not null and byte_size is not null and verified_at is not null))
);
create index expense_documents_hash on public.expense_documents(organization_id,sha256) where status='ready';

create table public.expense_postings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  claim_id uuid not null,
  claim_revision integer not null,
  allocation_id uuid not null,
  site_id uuid not null,
  project_reference text,
  category text not null,
  currency text not null,
  amount numeric(14,2) not null check (amount>0),
  source_kind text not null default 'expense',
  approved_by uuid not null references auth.users(id),
  posted_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,claim_id,claim_revision,allocation_id),
  foreign key (organization_id,claim_id) references public.expense_claims(organization_id,id),
  foreign key (organization_id,allocation_id) references public.expense_allocations(organization_id,id),
  foreign key (organization_id,site_id) references public.sites(organization_id,id)
);
create index expense_postings_site_date on public.expense_postings(organization_id,site_id,posted_at desc);

create table public.expense_audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  intake_id uuid not null,
  claim_id uuid,
  event_kind text not null,
  old_value jsonb,
  new_value jsonb,
  reason text,
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (organization_id,intake_id) references public.finance_intake_items(organization_id,id),
  foreign key (organization_id,claim_id) references public.expense_claims(organization_id,id)
);

alter table public.finance_intake_items enable row level security;
alter table public.expense_claims enable row level security;
alter table public.expense_items enable row level security;
alter table public.expense_allocations enable row level security;
alter table public.expense_documents enable row level security;
alter table public.expense_postings enable row level security;
alter table public.expense_audit_events enable row level security;
revoke all on public.finance_intake_items,public.expense_claims,public.expense_items,
  public.expense_allocations,public.expense_documents,public.expense_postings,
  public.expense_audit_events from anon,authenticated;
grant select on public.finance_intake_items,public.expense_claims,public.expense_items,
  public.expense_allocations,public.expense_documents,public.expense_postings,
  public.expense_audit_events to authenticated;
grant all on public.finance_intake_items,public.expense_claims,public.expense_items,
  public.expense_allocations,public.expense_documents,public.expense_postings,
  public.expense_audit_events to service_role;

create policy finance_intake_read on public.finance_intake_items for select to authenticated
  using (private.can_administer_org(organization_id) or
    (site_id is not null and private.can_view_site_finance(organization_id,site_id)));
create policy expense_claims_read on public.expense_claims for select to authenticated
  using (private.can_view_site_finance(organization_id,site_id));
create policy expense_items_read on public.expense_items for select to authenticated
  using (exists(select 1 from public.expense_claims c where c.organization_id=expense_items.organization_id
    and c.id=expense_items.claim_id and private.can_view_site_finance(c.organization_id,c.site_id)));
create policy expense_allocations_read on public.expense_allocations for select to authenticated
  using (private.can_view_site_finance(organization_id,site_id));
create policy expense_documents_read on public.expense_documents for select to authenticated
  using (exists(select 1 from public.finance_intake_items i where i.organization_id=expense_documents.organization_id
    and i.id=expense_documents.intake_id and (private.can_administer_org(i.organization_id) or
      (i.site_id is not null and private.can_view_site_finance(i.organization_id,i.site_id)))));
create policy expense_postings_read on public.expense_postings for select to authenticated
  using (private.can_view_site_finance(organization_id,site_id));
create policy expense_audit_read on public.expense_audit_events for select to authenticated
  using (exists(select 1 from public.finance_intake_items i where i.organization_id=expense_audit_events.organization_id
    and i.id=expense_audit_events.intake_id and (private.can_administer_org(i.organization_id) or
      (i.site_id is not null and private.can_view_site_finance(i.organization_id,i.site_id)))));
create policy expense_receipt_objects_read on storage.objects for select to authenticated
  using (bucket_id='expense-receipts' and exists (select 1 from public.expense_documents d
    join public.finance_intake_items i on i.organization_id=d.organization_id and i.id=d.intake_id
    where d.storage_bucket='expense-receipts' and d.storage_path=name and d.status='ready'
      and (private.can_administer_org(i.organization_id) or
        (i.site_id is not null and private.can_view_site_finance(i.organization_id,i.site_id)))));

-- Durable normalized messages create candidates. The text is an untrusted source, not a posting.
create function private.capture_finance_message_candidate()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_site_id uuid;
begin
  if coalesce(new.text_content,'') !~* '(^|[^a-z])(expense|receipt|fuel|meal|lunch|parking|toll|repair|supplies)([^a-z]|$)' then
    return new;
  end if;
  select site_id into v_site_id from public.integration_accounts
    where organization_id=new.organization_id and id=new.integration_account_id;
  insert into public.finance_intake_items(organization_id,site_id,source_kind,source_message_id,
    source_text,review_state)
  values(new.organization_id,v_site_id,'whatsapp',new.id,coalesce(new.text_content,''),
    case when v_site_id is null then 'needs_review' else 'pending' end)
  on conflict(organization_id,source_message_id,classifier_version) do nothing;
  return new;
end;
$$;
create trigger external_message_finance_candidate after insert on public.external_messages
  for each row execute function private.capture_finance_message_candidate();

create function private.capture_finance_receipt_evidence()
returns trigger language plpgsql security definer set search_path='' as $$
declare v_intake_id uuid;
begin
  select id into v_intake_id from public.finance_intake_items
    where organization_id=new.organization_id and source_message_id=new.external_message_id;
  if v_intake_id is null then return new; end if;
  insert into public.expense_documents(organization_id,intake_id,source_evidence_id,storage_bucket,
    storage_path,declared_mime,detected_mime,byte_size,sha256,status,verified_at)
  values(new.organization_id,v_intake_id,new.id,'operational-evidence',new.storage_path,
    new.content_type,new.content_type,case when new.processing_status='ready' then new.byte_size else null end,
    case when new.processing_status='ready' then new.sha256 else null end,
    case when new.processing_status='ready' then 'ready'
      when new.processing_status='quarantined' then 'quarantined'
      when new.processing_status='missing' then 'failed' else 'staged' end,
    case when new.processing_status='ready' then now() else null end)
  on conflict(organization_id,source_evidence_id) do update
  set detected_mime=excluded.detected_mime,byte_size=excluded.byte_size,
    sha256=excluded.sha256,status=excluded.status,verified_at=excluded.verified_at;
  return new;
end;
$$;
create trigger task_evidence_finance_receipt after insert or update of processing_status,sha256,byte_size
  on public.task_evidence for each row execute function private.capture_finance_receipt_evidence();

create function public.submit_app_finance_intake(p_site_id uuid,p_text text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_id uuid;
begin
  if auth.uid() is null or length(trim(coalesce(p_text,''))) not between 4 and 2000 then
    raise exception 'Valid signed-in expense submission required' using errcode='42501'; end if;
  select s.organization_id into v_org from public.sites s where s.id=p_site_id;
  if v_org is null or not private.has_site_access(v_org,p_site_id) or
    not private.has_org_role(v_org,array['cleaner'::public.app_role,
      'site_supervisor'::public.app_role,'area_manager'::public.app_role]) then
    raise exception 'Expense site access denied' using errcode='42501'; end if;
  insert into public.finance_intake_items(organization_id,site_id,source_kind,submitted_by,source_text)
  values(v_org,p_site_id,'app',auth.uid(),trim(p_text)) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.submit_app_finance_intake(uuid,text) from public,anon;
grant execute on function public.submit_app_finance_intake(uuid,text) to authenticated;

create function public.resolve_finance_intake(
  p_intake_id uuid,p_site_id uuid,p_category text,p_vendor text,p_expense_date date,
  p_payment_method text,p_currency text,p_subtotal numeric,p_tax numeric,p_total numeric,
  p_description text,p_contract_id uuid default null,p_project_reference text default null,
  p_allocations jsonb default null,p_reason text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare i public.finance_intake_items%rowtype;
declare c public.expense_claims%rowtype;
declare v_claim_id uuid;
declare v_org uuid;
declare v_hash text;
declare v_item jsonb;
declare v_sum numeric := 0;
declare v_site uuid;
declare v_amount numeric;
declare v_project text;
declare v_admin boolean;
begin
  select * into i from public.finance_intake_items where id=p_intake_id for update;
  if not found or auth.uid() is null then raise exception 'Finance candidate unavailable' using errcode='42501'; end if;
  v_org:=i.organization_id;
  v_admin:=private.can_administer_org(v_org);
  if not (v_admin or (i.site_id is not null and private.can_view_site_finance(v_org,i.site_id)))
    or not private.can_view_site_finance(v_org,p_site_id) then
    raise exception 'Finance site review denied' using errcode='42501'; end if;
  if i.review_state in ('rejected','posted') then raise exception 'Candidate is already final'; end if;
  if p_category not in ('meals','fuel_travel','supplies','equipment_purchase',
      'equipment_repair','parking_tolls','contractor','other_direct')
    or p_payment_method not in ('employee_personal','company_card','company_cash','supplier_invoice','other')
    or p_currency !~ '^[A-Z]{3}$' or p_total is null or p_total<=0
    or (p_subtotal is not null and p_subtotal<0) or (p_tax is not null and p_tax<0)
    or (p_subtotal is not null and p_tax is not null and abs(p_subtotal+p_tax-p_total)>0.01)
    or p_expense_date is null or length(trim(coalesce(p_vendor,''))) not between 1 and 200
    or length(trim(coalesce(p_description,''))) not between 1 and 500
    or length(coalesce(p_project_reference,''))>180 or length(coalesce(p_reason,''))>500 then
    raise exception 'Invalid expense details'; end if;
  if p_contract_id is not null and not exists(select 1 from public.contracts
      where organization_id=v_org and site_id=p_site_id and id=p_contract_id) then
    raise exception 'Contract does not belong to expense site'; end if;
  select d.sha256 into v_hash from public.expense_documents d
    where d.organization_id=v_org and d.intake_id=i.id and d.status='ready'
    order by d.created_at,d.id limit 1;
  select * into c from public.expense_claims where organization_id=v_org and intake_id=i.id for update;
  if found and c.status in ('approved','posted','reconciled','voided') then
    raise exception 'Posted expense cannot be revised'; end if;
  if found then
    v_claim_id:=c.id;
    delete from public.expense_allocations where organization_id=v_org and claim_id=v_claim_id;
    delete from public.expense_items where organization_id=v_org and claim_id=v_claim_id;
    update public.expense_claims set site_id=p_site_id,contract_id=p_contract_id,
      project_reference=nullif(trim(p_project_reference),''),vendor=trim(p_vendor),
      expense_date=p_expense_date,payment_method=p_payment_method,currency=p_currency,
      subtotal=p_subtotal,tax=p_tax,total=p_total,category=p_category,status='submitted',
      revision=revision+1,review_reason=p_reason,receipt_sha256=v_hash,
      reimbursement_status=case when p_payment_method='employee_personal' then 'pending' else 'not_applicable' end,
      updated_at=now() where id=v_claim_id;
  else
    insert into public.expense_claims(organization_id,intake_id,site_id,contract_id,
      project_reference,vendor,expense_date,payment_method,currency,subtotal,tax,total,
      category,review_reason,receipt_sha256,reimbursement_status)
    values(v_org,i.id,p_site_id,p_contract_id,nullif(trim(p_project_reference),''),
      trim(p_vendor),p_expense_date,p_payment_method,p_currency,p_subtotal,p_tax,p_total,
      p_category,p_reason,v_hash,
      case when p_payment_method='employee_personal' then 'pending' else 'not_applicable' end)
    returning id into v_claim_id;
  end if;
  insert into public.expense_items(organization_id,claim_id,category,description,
    subtotal,tax,total,currency)
  values(v_org,v_claim_id,p_category,trim(p_description),p_subtotal,p_tax,p_total,p_currency);
  if p_allocations is null then
    insert into public.expense_allocations(organization_id,claim_id,site_id,project_reference,amount)
    values(v_org,v_claim_id,p_site_id,nullif(trim(p_project_reference),''),p_total);
  else
    if jsonb_typeof(p_allocations)<>'array' or jsonb_array_length(p_allocations) not between 1 and 20 then
      raise exception 'Invalid expense allocations'; end if;
    for v_item in select value from jsonb_array_elements(p_allocations) loop
      v_site:=(v_item->>'siteId')::uuid;
      v_amount:=(v_item->>'amount')::numeric;
      v_project:=nullif(trim(v_item->>'projectReference'),'');
      if v_site is null or v_amount is null or v_amount<=0 or length(coalesce(v_project,''))>180
        or not exists(select 1 from public.sites where organization_id=v_org and id=v_site)
        or not private.can_view_site_finance(v_org,v_site) then
        raise exception 'Invalid allocation site or amount'; end if;
      insert into public.expense_allocations(organization_id,claim_id,site_id,project_reference,amount)
      values(v_org,v_claim_id,v_site,v_project,v_amount);
      v_sum:=v_sum+v_amount;
    end loop;
    if abs(v_sum-p_total)>0.01 then raise exception 'Expense allocations do not balance'; end if;
  end if;
  update public.finance_intake_items set site_id=p_site_id,project_reference=p_project_reference,
    review_state='resolved',updated_at=now() where id=i.id;
  insert into public.expense_audit_events(organization_id,intake_id,claim_id,event_kind,
    old_value,new_value,reason,actor_id)
  values(v_org,i.id,v_claim_id,'resolved',case when c.id is null then null else to_jsonb(c) end,
    jsonb_build_object('siteId',p_site_id,'category',p_category,'total',p_total,
      'currency',p_currency,'revision',(select revision from public.expense_claims where id=v_claim_id)),
    p_reason,auth.uid());
  return v_claim_id;
end;
$$;
revoke all on function public.resolve_finance_intake(uuid,uuid,text,text,date,text,text,numeric,
  numeric,numeric,text,uuid,text,jsonb,text) from public,anon;
grant execute on function public.resolve_finance_intake(uuid,uuid,text,text,date,text,text,numeric,
  numeric,numeric,text,uuid,text,jsonb,text) to authenticated;

create function public.reject_finance_intake(p_intake_id uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
declare i public.finance_intake_items%rowtype;
declare v_claim_id uuid;
begin
  select * into i from public.finance_intake_items where id=p_intake_id for update;
  if not found or auth.uid() is null or length(trim(coalesce(p_reason,''))) not between 4 and 500
    or not (private.can_administer_org(i.organization_id) or
      (i.site_id is not null and private.can_view_site_finance(i.organization_id,i.site_id))) then
    raise exception 'Finance rejection denied' using errcode='42501'; end if;
  if i.review_state in ('posted','rejected') then raise exception 'Candidate is already final'; end if;
  select id into v_claim_id from public.expense_claims where organization_id=i.organization_id and intake_id=i.id;
  update public.finance_intake_items set review_state='rejected',rejection_reason=trim(p_reason),
    updated_at=now() where id=i.id;
  update public.expense_claims set status='rejected',updated_at=now() where id=v_claim_id;
  insert into public.expense_audit_events(organization_id,intake_id,claim_id,event_kind,reason,actor_id)
  values(i.organization_id,i.id,v_claim_id,'rejected',trim(p_reason),auth.uid());
end;
$$;
revoke all on function public.reject_finance_intake(uuid,text) from public,anon;
grant execute on function public.reject_finance_intake(uuid,text) to authenticated;

create function public.approve_finance_expense(p_claim_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare c public.expense_claims%rowtype;
declare i public.finance_intake_items%rowtype;
declare a public.expense_allocations%rowtype;
declare v_hash text;
declare v_count integer;
begin
  select * into c from public.expense_claims where id=p_claim_id for update;
  if not found or auth.uid() is null or not private.can_administer_org(c.organization_id) then
    raise exception 'Director expense approval required' using errcode='42501'; end if;
  if c.status in ('posted','reconciled') then return c.id; end if;
  if c.status<>'submitted' then raise exception 'Expense is not ready for approval'; end if;
  select * into i from public.finance_intake_items where organization_id=c.organization_id and id=c.intake_id for update;
  if i.review_state<>'resolved' or i.site_id<>c.site_id then raise exception 'Expense context unresolved'; end if;
  select d.sha256 into v_hash from public.expense_documents d
    where d.organization_id=c.organization_id and d.intake_id=i.id and d.status='ready'
    order by d.created_at,d.id limit 1;
  if v_hash is null then raise exception 'Verified receipt required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(c.organization_id::text||v_hash,0));
  if exists(select 1 from public.expense_claims other where other.organization_id=c.organization_id
      and other.receipt_sha256=v_hash and other.id<>c.id and other.status in ('posted','reconciled')) then
    raise exception 'Duplicate receipt already posted'; end if;
  if not exists(select 1 from public.expense_items e where e.organization_id=c.organization_id
      and e.claim_id=c.id and e.total=c.total and e.category=c.category and e.currency=c.currency) then
    raise exception 'Expense item does not match claim'; end if;
  select count(*) into v_count from public.expense_allocations where organization_id=c.organization_id and claim_id=c.id;
  if v_count<1 or abs(coalesce((select sum(amount) from public.expense_allocations
      where organization_id=c.organization_id and claim_id=c.id),0)-c.total)>0.01 then
    raise exception 'Expense allocations do not balance'; end if;
  if i.proposed ? 'total' and i.proposed->>'total' is distinct from c.total::text
    and length(trim(coalesce(c.review_reason,'')))<4 then
    raise exception 'Conflicting extracted amount needs a review reason'; end if;
  for a in select * from public.expense_allocations where organization_id=c.organization_id and claim_id=c.id loop
    insert into public.expense_postings(organization_id,claim_id,claim_revision,allocation_id,
      site_id,project_reference,category,currency,amount,approved_by)
    values(c.organization_id,c.id,c.revision,a.id,a.site_id,a.project_reference,
      c.category,c.currency,a.amount,auth.uid());
  end loop;
  update public.expense_claims set status='posted',receipt_sha256=v_hash,
    approved_by=auth.uid(),approved_at=now(),updated_at=now() where id=c.id;
  update public.finance_intake_items set review_state='posted',updated_at=now() where id=i.id;
  insert into public.expense_audit_events(organization_id,intake_id,claim_id,event_kind,
    new_value,actor_id)
  values(c.organization_id,i.id,c.id,'posted',jsonb_build_object('revision',c.revision,
    'total',c.total,'receiptSha256',v_hash,'allocationCount',v_count),auth.uid());
  return c.id;
end;
$$;
revoke all on function public.approve_finance_expense(uuid) from public,anon;
grant execute on function public.approve_finance_expense(uuid) to authenticated;

create function private.prevent_expense_provenance_mutation()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'Posted expense provenance is immutable';
end;
$$;
create trigger expense_postings_immutable before update or delete on public.expense_postings
  for each row execute function private.prevent_expense_provenance_mutation();
create trigger expense_audit_immutable before update or delete on public.expense_audit_events
  for each row execute function private.prevent_expense_provenance_mutation();
