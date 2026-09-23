-- CLEAN-034: private source files and immutable machine/human review provenance.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('contract-documents','contract-documents',false,15728640,
  array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.contract_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  contract_version_id uuid not null,
  file_name text not null check (length(file_name) between 1 and 180),
  declared_mime text not null,
  detected_mime text,
  claimed_byte_size bigint not null check (claimed_byte_size between 1 and 15728640),
  byte_size bigint check (byte_size between 1 and 15728640),
  claimed_sha256 text not null check (claimed_sha256 ~ '^[0-9a-f]{64}$'),
  sha256 text check (sha256 ~ '^[0-9a-f]{64}$'),
  page_count integer check (page_count between 1 and 20),
  storage_path text not null unique,
  uploaded_by uuid not null references auth.users(id),
  status text not null default 'staged' check (status in ('staged','ready','duplicate','rejected')),
  duplicate_of uuid,
  created_at timestamptz not null default now(),
  finalized_at timestamptz,
  unique (organization_id,site_id,contract_version_id,id),
  foreign key (organization_id,site_id,contract_version_id)
    references public.contract_versions(organization_id,site_id,id) on delete restrict,
  foreign key (organization_id,site_id,contract_version_id,duplicate_of)
    references public.contract_documents(organization_id,site_id,contract_version_id,id),
  check ((status = 'ready') = (sha256 is not null and detected_mime is not null
    and byte_size is not null and page_count is not null and finalized_at is not null))
);
create unique index contract_documents_ready_hash on public.contract_documents
  (organization_id,site_id,contract_version_id,sha256) where status = 'ready';
create index contract_documents_version on public.contract_documents
  (organization_id,site_id,contract_version_id,created_at desc);

create table public.contract_extraction_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  contract_version_id uuid not null,
  document_id uuid not null,
  provider text not null,
  provider_version text not null,
  schema_version integer not null check (schema_version > 0),
  status text not null check (status in ('succeeded','failed')),
  failure_code text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id,site_id,contract_version_id,id),
  foreign key (organization_id,site_id,contract_version_id)
    references public.contract_versions(organization_id,site_id,id) on delete restrict,
  foreign key (organization_id,site_id,contract_version_id,document_id)
    references public.contract_documents(organization_id,site_id,contract_version_id,id) on delete restrict
);
create index contract_extraction_runs_document on public.contract_extraction_runs(document_id,created_at desc);

create table public.contract_extraction_proposals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  contract_version_id uuid not null,
  run_id uuid not null,
  field_key text not null,
  category text not null check (category in ('identity','commercial','operational')),
  proposed_value jsonb,
  business_state text not null check (business_state in ('clear','review_recommended','not_found')),
  source_page integer check (source_page between 1 and 20),
  source_span text check (length(source_span) <= 500),
  source_start integer check (source_start >= 0),
  source_end integer check (source_end >= source_start),
  created_at timestamptz not null default now(),
  unique (organization_id,site_id,contract_version_id,id),
  foreign key (organization_id,site_id,contract_version_id)
    references public.contract_versions(organization_id,site_id,id) on delete restrict,
  foreign key (organization_id,site_id,contract_version_id,run_id)
    references public.contract_extraction_runs(organization_id,site_id,contract_version_id,id) on delete restrict,
  check (business_state <> 'clear' or (source_page is not null and source_span is not null
    and proposed_value is not null))
);
create index contract_extraction_proposals_run on public.contract_extraction_proposals(run_id);

create table public.contract_extraction_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  contract_version_id uuid not null,
  proposal_id uuid not null,
  decision text not null check (decision in ('accept','edit','reject','unknown')),
  reviewed_value jsonb,
  reason text check (length(reason) <= 500),
  canonical_table text,
  canonical_id uuid,
  reviewed_by uuid not null references auth.users(id),
  reviewed_at timestamptz not null default now(),
  unique (proposal_id),
  foreign key (organization_id,site_id,contract_version_id)
    references public.contract_versions(organization_id,site_id,id) on delete restrict,
  foreign key (organization_id,site_id,contract_version_id,proposal_id)
    references public.contract_extraction_proposals(organization_id,site_id,contract_version_id,id) on delete restrict
);
create index contract_extraction_decisions_proposal on public.contract_extraction_decisions(proposal_id,reviewed_at desc);

create function private.prevent_contract_review_mutation()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Contract extraction provenance is immutable';
end;
$$;
create trigger contract_proposals_immutable before update or delete
  on public.contract_extraction_proposals for each row
  execute function private.prevent_contract_review_mutation();
create trigger contract_decisions_immutable before update or delete
  on public.contract_extraction_decisions for each row
  execute function private.prevent_contract_review_mutation();

alter table public.contract_documents enable row level security;
alter table public.contract_extraction_runs enable row level security;
alter table public.contract_extraction_proposals enable row level security;
alter table public.contract_extraction_decisions enable row level security;
revoke all on public.contract_documents,public.contract_extraction_runs,
  public.contract_extraction_proposals,public.contract_extraction_decisions from anon,authenticated;
grant select on public.contract_documents,public.contract_extraction_runs,
  public.contract_extraction_proposals,public.contract_extraction_decisions to authenticated;
grant all on public.contract_documents,public.contract_extraction_runs,
  public.contract_extraction_proposals,public.contract_extraction_decisions to service_role;

create policy contract_documents_read on public.contract_documents for select to authenticated
  using (private.can_edit_contract(organization_id,site_id));
create policy contract_runs_read on public.contract_extraction_runs for select to authenticated
  using (private.can_edit_contract(organization_id,site_id));
create policy contract_proposals_read on public.contract_extraction_proposals for select to authenticated
  using (private.can_edit_contract(organization_id,site_id) or
    (category = 'operational' and private.can_operate_org(organization_id)));
create policy contract_decisions_read on public.contract_extraction_decisions for select to authenticated
  using (private.can_edit_contract(organization_id,site_id) or exists (
    select 1 from public.contract_extraction_proposals p where p.id = proposal_id
      and p.category = 'operational' and private.can_operate_org(p.organization_id)));
create policy contract_document_objects_read on storage.objects for select to authenticated
  using (bucket_id = 'contract-documents' and exists (
    select 1 from public.contract_documents d where d.storage_path = name
      and d.status = 'ready' and private.can_edit_contract(d.organization_id,d.site_id)));

create function public.review_contract_extraction_proposal(
  p_proposal_id uuid, p_decision text, p_reviewed_value jsonb default null, p_reason text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare p public.contract_extraction_proposals%rowtype;
declare v public.contract_versions%rowtype;
declare chosen jsonb;
declare applied_table text;
declare applied_id uuid;
declare decision_id uuid;
declare actor_can_edit boolean;
declare source_ref text;
begin
  if p_decision not in ('accept','edit','reject','unknown') or length(coalesce(p_reason,'')) > 500 then
    raise exception 'Invalid contract review decision';
  end if;
  select * into p from public.contract_extraction_proposals where id = p_proposal_id for share;
  if not found then raise exception 'Proposal unavailable' using errcode = '42501'; end if;
  select * into v from public.contract_versions where id = p.contract_version_id for update;
  actor_can_edit := private.can_edit_contract(p.organization_id,p.site_id);
  if auth.uid() is null or v.state <> 'draft' or v.organization_id <> p.organization_id
    or v.site_id <> p.site_id or not (actor_can_edit or
      (p.category = 'operational' and private.can_operate_org(p.organization_id))) then
    raise exception 'Contract review access denied' using errcode = '42501';
  end if;
  if exists (select 1 from public.contract_extraction_decisions where proposal_id = p.id) then
    raise exception 'This proposal was already reviewed';
  end if;
  if p_decision = 'accept' and (p.business_state <> 'clear' or p.proposed_value is null) then
    raise exception 'Only clear proposals can be accepted';
  end if;
  if p_decision = 'edit' and p_reviewed_value is null then
    raise exception 'An edited value is required';
  end if;
  chosen := case when p_decision = 'accept' then p.proposed_value
    when p_decision = 'edit' then p_reviewed_value else null end;
  source_ref := 'document-proposal:' || p.id::text ||
    case when p.source_page is null then '' else ':page-' || p.source_page::text end;
  if chosen is not null and actor_can_edit then
    case p.field_key
      when 'contract_name' then
        update public.contracts set name = trim(chosen #>> '{}'), updated_at = now()
          where id = v.contract_id;
        applied_table := 'contracts'; applied_id := v.contract_id;
      when 'effective_from' then
        update public.contract_versions set effective_from = (chosen #>> '{}')::date,
          updated_at = now() where id = v.id;
        applied_table := 'contract_versions'; applied_id := v.id;
      when 'effective_to' then
        update public.contract_versions set effective_to = (chosen #>> '{}')::date,
          updated_at = now() where id = v.id;
        applied_table := 'contract_versions'; applied_id := v.id;
      when 'financial_term' then
        insert into public.contract_financial_terms(organization_id,site_id,contract_version_id,
          basis,amount,currency,effective_from,description,source_reference)
        values (p.organization_id,p.site_id,v.id,chosen->>'basis',
          (chosen->>'amount')::numeric,chosen->>'currency',v.effective_from,
          chosen->>'description',source_ref) returning id into applied_id;
        applied_table := 'contract_financial_terms';
      when 'payment_terms', 'additional_work' then
        insert into public.contract_financial_terms(organization_id,site_id,contract_version_id,
          basis,description,effective_from,source_reference)
        values (p.organization_id,p.site_id,v.id,'custom',
          p.field_key || ': ' || left(chosen #>> '{}',500),v.effective_from,source_ref)
          returning id into applied_id;
        applied_table := 'contract_financial_terms';
      when 'staffing' then
        insert into public.contract_staffing_requirements(organization_id,site_id,
          contract_version_id,weekday,local_start,local_end,required_positions,source_reference)
        values (p.organization_id,p.site_id,v.id,(chosen->>'weekday')::integer,
          (chosen->>'localStart')::time,(chosen->>'localEnd')::time,
          (chosen->>'requiredPositions')::integer,source_ref) returning id into applied_id;
        applied_table := 'contract_staffing_requirements';
      when 'obligation' then
        insert into public.contract_obligations(organization_id,site_id,contract_version_id,
          name,recurrence,zone_id,source_reference)
        values (p.organization_id,p.site_id,v.id,chosen->>'name',chosen->>'recurrence',
          nullif(chosen->>'zoneId','')::uuid,source_ref) returning id into applied_id;
        applied_table := 'contract_obligations';
      when 'supply_responsibility' then
        update public.contract_versions set supply_responsibility = chosen #>> '{}',
          updated_at = now() where id = v.id;
        applied_table := 'contract_versions'; applied_id := v.id;
      when 'equipment_responsibility' then
        update public.contract_versions set equipment_responsibility = chosen #>> '{}',
          updated_at = now() where id = v.id;
        applied_table := 'contract_versions'; applied_id := v.id;
      when 'repair_responsibility' then
        update public.contract_versions set repair_responsibility = chosen #>> '{}',
          updated_at = now() where id = v.id;
        applied_table := 'contract_versions'; applied_id := v.id;
      when 'sla_term' then
        if jsonb_typeof(chosen) <> 'object' then
          raise exception 'Edit the SLA into name, numerator, denominator and exclusion rules';
        end if;
        insert into public.contract_sla_terms(organization_id,site_id,contract_version_id,
          name,numerator_rule,denominator_rule,exclusion_rule,source_reference)
        values (p.organization_id,p.site_id,v.id,chosen->>'name',chosen->>'numeratorRule',
          chosen->>'denominatorRule',chosen->>'exclusionRule',source_ref)
          returning id into applied_id;
        applied_table := 'contract_sla_terms';
      else
        -- Reporting prose remains a review note until translated to a canonical SLA rule.
        null;
    end case;
  end if;
  insert into public.contract_extraction_decisions(organization_id,site_id,contract_version_id,
    proposal_id,decision,reviewed_value,reason,canonical_table,canonical_id,reviewed_by)
  values (p.organization_id,p.site_id,v.id,p.id,p_decision,chosen,p_reason,
    applied_table,applied_id,auth.uid()) returning id into decision_id;
  return decision_id;
end;
$$;
revoke all on function public.review_contract_extraction_proposal(uuid,text,jsonb,text) from public,anon;
grant execute on function public.review_contract_extraction_proposal(uuid,text,jsonb,text) to authenticated,service_role;

create function private.require_document_proposals_reviewed()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.state = 'approved' and old.state <> 'approved' and exists (
    select 1 from public.contract_extraction_proposals p
    join public.contract_extraction_runs r on r.id = p.run_id
    where p.contract_version_id = new.id and r.status = 'succeeded'
      and p.business_state <> 'not_found'
      and not exists (select 1 from public.contract_extraction_decisions d where d.proposal_id = p.id)
  ) then raise exception 'Resolve material document proposals before approval'; end if;
  return new;
end;
$$;
create trigger contract_document_review_gate before update on public.contract_versions
for each row execute function private.require_document_proposals_reviewed();
