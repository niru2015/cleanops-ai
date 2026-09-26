-- CLEAN-018: source-backed equipment care and repair history.
-- Existing asset and fault records remain the source of identity and intake.
alter table public.equipment_assets add constraint equipment_assets_org_id_unique unique (organization_id,id);
alter table public.equipment_assets
  add column acquired_on date,
  add column acquisition_source_row_id uuid,
  add constraint equipment_asset_acquisition_source_fk
    foreign key (organization_id, acquisition_source_row_id)
    references public.finance_source_rows(organization_id,id);
alter table public.equipment_reports
  add column asset_id uuid,
  add constraint equipment_report_asset_fk
    foreign key (organization_id, asset_id)
    references public.equipment_assets(organization_id,id);
create index equipment_reports_asset_time on public.equipment_reports(organization_id,asset_id,reported_at desc)
  where asset_id is not null;

create table public.equipment_asset_site_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  asset_id uuid not null,
  site_id uuid not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  changed_by uuid references auth.users(id),
  reason text not null check (length(trim(reason)) between 3 and 500),
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  check (ended_at is null or ended_at > started_at),
  foreign key (organization_id,asset_id) references public.equipment_assets(organization_id,id) on delete cascade,
  foreign key (organization_id,site_id) references public.sites(organization_id,id)
);
create unique index equipment_asset_one_current_site on public.equipment_asset_site_history(organization_id,asset_id)
  where ended_at is null;
create index equipment_asset_site_history_lookup on public.equipment_asset_site_history(organization_id,site_id,asset_id,started_at desc);
insert into public.equipment_asset_site_history(organization_id,asset_id,site_id,reason)
select organization_id,id,site_id,'Initial register snapshot; earlier site history unknown'
from public.equipment_assets;
create function private.initialize_equipment_asset_site_history()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  insert into public.equipment_asset_site_history(organization_id,asset_id,site_id,started_at,changed_by,reason)
    values(new.organization_id,new.id,new.site_id,now(),auth.uid(),'Initial asset registration');
  return new;
end $$;
create trigger equipment_asset_initial_site after insert on public.equipment_assets
  for each row execute function private.initialize_equipment_asset_site_history();
revoke all on function private.initialize_equipment_asset_site_history() from public,anon,authenticated;

create table public.equipment_checklist_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  model_id uuid not null,
  version_number integer not null check (version_number > 0),
  source_kind text not null check (source_kind in ('manufacturer','customer_approved')),
  source_reference text not null check (length(trim(source_reference)) between 3 and 500),
  instructions jsonb not null check (jsonb_typeof(instructions)='array' and jsonb_array_length(instructions)>0),
  approved_by uuid not null references auth.users(id),
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,model_id,version_number),
  foreign key (organization_id,model_id) references public.equipment_models(organization_id,id)
);

create table public.equipment_inspections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  asset_id uuid not null,
  checklist_version_id uuid not null,
  operator_user_id uuid references auth.users(id),
  inspector_user_id uuid not null references auth.users(id),
  inspected_at timestamptz not null default now(),
  outcome text not null check (outcome in ('care_ok','follow_up_required')),
  answers jsonb not null check (jsonb_typeof(answers)='object'),
  notes text not null default '' check (length(notes)<=2000),
  follow_up_due_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  check (operator_user_id is null or operator_user_id<>inspector_user_id),
  check (outcome='follow_up_required' or follow_up_due_at is null),
  foreign key (organization_id,asset_id) references public.equipment_assets(organization_id,id),
  foreign key (organization_id,site_id) references public.sites(organization_id,id),
  foreign key (organization_id,checklist_version_id) references public.equipment_checklist_versions(organization_id,id)
);
create index equipment_inspections_asset_time on public.equipment_inspections(organization_id,asset_id,inspected_at desc);

create table public.equipment_maintenance_actions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  asset_id uuid not null,
  report_id uuid not null,
  event_key text not null check (length(trim(event_key)) between 3 and 180),
  action_kind text not null check (action_kind in ('triaged','maintenance_requested','work_completed','return_to_service','correction')),
  notes text not null check (length(trim(notes)) between 3 and 2000),
  vendor_reference text,
  performed_by uuid not null references auth.users(id),
  recorded_at timestamptz not null default now(),
  corrects_action_id uuid,
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,report_id,event_key),
  foreign key (organization_id,asset_id) references public.equipment_assets(organization_id,id),
  foreign key (organization_id,site_id,report_id) references public.equipment_reports(organization_id,site_id,id) on delete cascade,
  foreign key (organization_id,corrects_action_id) references public.equipment_maintenance_actions(organization_id,id)
);
create index equipment_maintenance_asset_time on public.equipment_maintenance_actions(organization_id,asset_id,recorded_at desc);

create table public.equipment_repair_cost_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  asset_id uuid not null,
  maintenance_action_id uuid not null,
  expense_posting_id uuid not null,
  finance_source_row_id uuid,
  invoice_reference text not null check (length(trim(invoice_reference)) between 2 and 180),
  linked_by uuid not null references auth.users(id),
  linked_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,expense_posting_id),
  unique (organization_id,finance_source_row_id),
  foreign key (organization_id,asset_id) references public.equipment_assets(organization_id,id),
  foreign key (organization_id,site_id) references public.sites(organization_id,id),
  foreign key (organization_id,maintenance_action_id) references public.equipment_maintenance_actions(organization_id,id),
  foreign key (organization_id,expense_posting_id) references public.expense_postings(organization_id,id),
  foreign key (organization_id,finance_source_row_id) references public.finance_source_rows(organization_id,id)
);
create index equipment_repair_cost_asset on public.equipment_repair_cost_links(organization_id,asset_id,site_id);

create table public.equipment_evidence_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  asset_id uuid not null,
  inspection_id uuid,
  maintenance_action_id uuid,
  task_evidence_id uuid not null,
  linked_by uuid not null references auth.users(id),
  linked_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,task_evidence_id),
  check ((inspection_id is null) <> (maintenance_action_id is null)),
  foreign key (organization_id,asset_id) references public.equipment_assets(organization_id,id),
  foreign key (organization_id,site_id) references public.sites(organization_id,id),
  foreign key (organization_id,inspection_id) references public.equipment_inspections(organization_id,id),
  foreign key (organization_id,maintenance_action_id) references public.equipment_maintenance_actions(organization_id,id),
  foreign key (organization_id,task_evidence_id) references public.task_evidence(organization_id,id)
);

alter table public.equipment_asset_site_history enable row level security;
alter table public.equipment_checklist_versions enable row level security;
alter table public.equipment_inspections enable row level security;
alter table public.equipment_maintenance_actions enable row level security;
alter table public.equipment_repair_cost_links enable row level security;
alter table public.equipment_evidence_links enable row level security;
revoke all on public.equipment_asset_site_history,public.equipment_checklist_versions,
  public.equipment_inspections,public.equipment_maintenance_actions,
  public.equipment_repair_cost_links,public.equipment_evidence_links from public,anon,authenticated;
grant select on public.equipment_asset_site_history,public.equipment_checklist_versions,
  public.equipment_inspections,public.equipment_maintenance_actions to authenticated;
grant select on public.equipment_repair_cost_links to authenticated;
grant select on public.equipment_evidence_links to authenticated;
grant all on public.equipment_asset_site_history,public.equipment_checklist_versions,
  public.equipment_inspections,public.equipment_maintenance_actions,
  public.equipment_repair_cost_links,public.equipment_evidence_links to service_role;
create policy equipment_site_history_read on public.equipment_asset_site_history for select to authenticated
  using (private.has_operational_site_access(organization_id,site_id));
create policy equipment_checklist_read on public.equipment_checklist_versions for select to authenticated
  using (private.has_org_role(organization_id,array['site_supervisor'::public.app_role,'area_manager'::public.app_role,'operations_manager'::public.app_role,'organization_administrator'::public.app_role]));
create policy equipment_inspection_read on public.equipment_inspections for select to authenticated
  using (private.has_operational_site_access(organization_id,site_id));
create policy equipment_maintenance_read on public.equipment_maintenance_actions for select to authenticated
  using (private.has_operational_site_access(organization_id,site_id));
create policy equipment_repair_cost_read on public.equipment_repair_cost_links for select to authenticated
  using (private.can_view_site_finance(organization_id,site_id));
create policy equipment_evidence_read on public.equipment_evidence_links for select to authenticated
  using (private.can_manage_site(organization_id,site_id));

create function public.link_equipment_report_asset(p_report_id uuid,p_asset_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_report public.equipment_reports%rowtype; v_asset public.equipment_assets%rowtype;
begin
  select * into v_report from public.equipment_reports where id=p_report_id for update;
  if not found or not private.can_manage_site(v_report.organization_id,v_report.site_id) then
    raise exception 'equipment report access required' using errcode='42501'; end if;
  select * into v_asset from public.equipment_assets where id=p_asset_id and organization_id=v_report.organization_id;
  if not found or v_asset.site_id<>v_report.site_id then
    raise exception 'asset must belong to the report site' using errcode='22023'; end if;
  if v_report.asset_id is not null and v_report.asset_id<>p_asset_id then
    raise exception 'asset link is immutable; record an attributed correction' using errcode='22023'; end if;
  update public.equipment_reports set asset_id=p_asset_id,updated_at=now() where id=p_report_id and asset_id is null;
  return p_asset_id;
end $$;
revoke all on function public.link_equipment_report_asset(uuid,uuid) from public,anon,authenticated;
grant execute on function public.link_equipment_report_asset(uuid,uuid) to authenticated;

create function public.move_equipment_asset(p_asset_id uuid,p_target_site_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_asset public.equipment_assets%rowtype; v_now timestamptz:=clock_timestamp();
begin
  select * into v_asset from public.equipment_assets where id=p_asset_id for update;
  if not found or not private.can_administer_org(v_asset.organization_id) then
    raise exception 'Director asset access required' using errcode='42501'; end if;
  if p_reason is null or length(trim(p_reason))<3 or length(p_reason)>500 then
    raise exception 'movement reason required' using errcode='22023'; end if;
  if not exists(select 1 from public.sites where id=p_target_site_id and organization_id=v_asset.organization_id) then
    raise exception 'target site unavailable' using errcode='22023'; end if;
  if p_target_site_id=v_asset.site_id then return p_asset_id; end if;
  if exists(select 1 from public.equipment_reports where organization_id=v_asset.organization_id
    and asset_id=p_asset_id and state<>'resolved') then
    raise exception 'resolve or review open asset faults before movement' using errcode='22023'; end if;
  update public.equipment_asset_site_history set ended_at=v_now
    where organization_id=v_asset.organization_id and asset_id=p_asset_id and ended_at is null;
  insert into public.equipment_asset_site_history(organization_id,asset_id,site_id,started_at,changed_by,reason)
    values(v_asset.organization_id,p_asset_id,p_target_site_id,v_now,auth.uid(),trim(p_reason));
  update public.equipment_assets set site_id=p_target_site_id,updated_at=v_now where id=p_asset_id;
  return p_asset_id;
end $$;
revoke all on function public.move_equipment_asset(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.move_equipment_asset(uuid,uuid,text) to authenticated;

create function public.create_equipment_checklist_version(
  p_model_id uuid,p_source_kind text,p_source_reference text,p_instructions jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_id uuid; v_version integer;
begin
  select organization_id into v_org from public.equipment_models where id=p_model_id;
  if v_org is null or not private.can_administer_org(v_org) then
    raise exception 'Director model access required' using errcode='42501'; end if;
  if p_source_kind not in ('manufacturer','customer_approved') or
     p_source_reference is null or length(trim(p_source_reference))<3 or
     jsonb_typeof(p_instructions) is distinct from 'array' or jsonb_array_length(p_instructions)=0 then
    raise exception 'approved source and checklist steps required' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(p_instructions) step
    where jsonb_typeof(step)<>'string' or length(trim(step #>> '{}'))<3) then
    raise exception 'checklist steps must be non-empty source text' using errcode='22023'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_model_id::text,0));
  select coalesce(max(version_number),0)+1 into v_version from public.equipment_checklist_versions
    where organization_id=v_org and model_id=p_model_id;
  insert into public.equipment_checklist_versions(organization_id,model_id,version_number,source_kind,
    source_reference,instructions,approved_by)
    values(v_org,p_model_id,v_version,p_source_kind,trim(p_source_reference),p_instructions,auth.uid()) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.create_equipment_checklist_version(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.create_equipment_checklist_version(uuid,text,text,jsonb) to authenticated;

create function public.record_equipment_inspection(
  p_asset_id uuid,p_checklist_version_id uuid,p_operator_user_id uuid,p_outcome text,
  p_answers jsonb,p_notes text,p_follow_up_due_at timestamptz)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_asset public.equipment_assets%rowtype; v_checklist public.equipment_checklist_versions%rowtype; v_id uuid;
begin
  select * into v_asset from public.equipment_assets where id=p_asset_id;
  if not found or not private.can_manage_site(v_asset.organization_id,v_asset.site_id) then
    raise exception 'site inspection access required' using errcode='42501'; end if;
  select * into v_checklist from public.equipment_checklist_versions where id=p_checklist_version_id
    and organization_id=v_asset.organization_id and model_id=v_asset.model_id;
  if not found then raise exception 'approved checklist for asset model required' using errcode='22023'; end if;
  if p_operator_user_id=auth.uid() or p_outcome not in ('care_ok','follow_up_required') or
    jsonb_typeof(p_answers) is distinct from 'object' then
    raise exception 'inspection actor, outcome or answers invalid' using errcode='22023'; end if;
  if p_operator_user_id is not null and not exists(select 1 from public.memberships
    where organization_id=v_asset.organization_id and user_id=p_operator_user_id and state='active') then
    raise exception 'operator is not an active organization member' using errcode='22023'; end if;
  insert into public.equipment_inspections(organization_id,site_id,asset_id,checklist_version_id,
    operator_user_id,inspector_user_id,outcome,answers,notes,follow_up_due_at)
    values(v_asset.organization_id,v_asset.site_id,p_asset_id,p_checklist_version_id,
      p_operator_user_id,auth.uid(),p_outcome,p_answers,coalesce(p_notes,''),p_follow_up_due_at)
    returning id into v_id;
  return v_id;
end $$;
revoke all on function public.record_equipment_inspection(uuid,uuid,uuid,text,jsonb,text,timestamptz) from public,anon,authenticated;
grant execute on function public.record_equipment_inspection(uuid,uuid,uuid,text,jsonb,text,timestamptz) to authenticated;

create function public.record_equipment_maintenance_action(
  p_report_id uuid,p_event_key text,p_action_kind text,p_notes text,
  p_vendor_reference text default null,p_corrects_action_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_report public.equipment_reports%rowtype; v_existing public.equipment_maintenance_actions%rowtype;
  v_asset public.equipment_assets%rowtype; v_id uuid;
begin
  select * into v_report from public.equipment_reports where id=p_report_id for update;
  if not found or not private.can_manage_site(v_report.organization_id,v_report.site_id) then
    raise exception 'site fault access required' using errcode='42501'; end if;
  if v_report.asset_id is null then raise exception 'link a site asset before maintenance' using errcode='22023'; end if;
  select * into v_asset from public.equipment_assets where id=v_report.asset_id;
  if v_asset.site_id<>v_report.site_id then
    raise exception 'historical-site fault requires review before new maintenance' using errcode='22023'; end if;
  if p_action_kind not in ('triaged','maintenance_requested','work_completed','return_to_service','correction') or
    p_notes is null or length(trim(p_notes))<3 or p_event_key is null or length(trim(p_event_key))<3 then
    raise exception 'maintenance action input invalid' using errcode='22023'; end if;
  select * into v_existing from public.equipment_maintenance_actions
    where organization_id=v_report.organization_id and report_id=p_report_id and event_key=p_event_key;
  if found then
    if v_existing.action_kind<>p_action_kind or v_existing.notes<>trim(p_notes) then
      raise exception 'event key belongs to another action' using errcode='22023'; end if;
    return v_existing.id;
  end if;
  if p_action_kind='triaged' and v_report.state<>'reported' then
    raise exception 'only reported faults can be triaged' using errcode='22023'; end if;
  if p_action_kind='maintenance_requested' and v_report.state<>'triaged' then
    raise exception 'triage required before maintenance request' using errcode='22023'; end if;
  if p_action_kind='work_completed' and v_report.state<>'maintenance_requested' then
    raise exception 'maintenance request required before completion' using errcode='22023'; end if;
  if p_action_kind='work_completed' and not private.has_org_role(v_report.organization_id,
    array['area_manager'::public.app_role,'operations_manager'::public.app_role,'organization_administrator'::public.app_role]) then
    raise exception 'authorized maintenance actor required' using errcode='42501'; end if;
  if p_action_kind='return_to_service' then
    if v_report.state<>'maintenance_requested' or not exists(
      select 1 from public.equipment_maintenance_actions where report_id=p_report_id
        and organization_id=v_report.organization_id and action_kind='work_completed') then
      raise exception 'verified completed work required before return to service' using errcode='22023'; end if;
    if not private.can_administer_org(v_report.organization_id) and not private.has_org_role(
      v_report.organization_id,array['operations_manager'::public.app_role]) then
      raise exception 'authorized return-to-service approver required' using errcode='42501'; end if;
    if exists(select 1 from public.equipment_maintenance_actions where report_id=p_report_id
      and organization_id=v_report.organization_id and action_kind='work_completed' and performed_by=auth.uid()) then
      raise exception 'return-to-service approver must differ from maintenance actor' using errcode='22023'; end if;
  end if;
  if p_action_kind='correction' and (p_corrects_action_id is null or not exists(
    select 1 from public.equipment_maintenance_actions where id=p_corrects_action_id
      and organization_id=v_report.organization_id and report_id=p_report_id)) then
    raise exception 'correction must name the original action' using errcode='22023'; end if;
  insert into public.equipment_maintenance_actions(organization_id,site_id,asset_id,report_id,event_key,
    action_kind,notes,vendor_reference,performed_by,corrects_action_id)
    values(v_report.organization_id,v_report.site_id,v_report.asset_id,p_report_id,p_event_key,
      p_action_kind,trim(p_notes),nullif(trim(p_vendor_reference),''),auth.uid(),p_corrects_action_id)
    returning id into v_id;
  if p_action_kind='triaged' then update public.equipment_reports set state='triaged',updated_at=now() where id=p_report_id; end if;
  if p_action_kind='maintenance_requested' then
    update public.equipment_reports set state='maintenance_requested',updated_at=now() where id=p_report_id;
    update public.equipment_assets set status='maintenance',updated_at=now() where id=v_report.asset_id; end if;
  if p_action_kind='return_to_service' then
    update public.equipment_reports set state='resolved',resolved_at=now(),updated_at=now() where id=p_report_id;
    update public.equipment_assets set status='available',updated_at=now() where id=v_report.asset_id; end if;
  return v_id;
end $$;
revoke all on function public.record_equipment_maintenance_action(uuid,text,text,text,text,uuid) from public,anon,authenticated;
grant execute on function public.record_equipment_maintenance_action(uuid,text,text,text,text,uuid) to authenticated;

create function public.link_equipment_repair_cost(
  p_action_id uuid,p_expense_posting_id uuid,p_invoice_reference text,p_finance_source_row_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_action public.equipment_maintenance_actions%rowtype; v_expense public.expense_postings%rowtype;
  v_source public.finance_source_rows%rowtype; v_id uuid;
begin
  select * into v_action from public.equipment_maintenance_actions where id=p_action_id;
  if not found or not private.can_administer_org(v_action.organization_id) then
    raise exception 'Director repair-cost access required' using errcode='42501'; end if;
  select * into v_expense from public.expense_postings where id=p_expense_posting_id
    and organization_id=v_action.organization_id and site_id=v_action.site_id and category='equipment_repair';
  if not found then raise exception 'approved repair expense at historical site required' using errcode='22023'; end if;
  if p_finance_source_row_id is not null then
    select r.* into v_source from public.finance_source_rows r join public.finance_import_batches b
      on b.organization_id=r.organization_id and b.id=r.import_batch_id
      where r.id=p_finance_source_row_id and r.organization_id=v_action.organization_id
        and r.site_id=v_action.site_id and b.state='accepted' and r.approval_state='approved'
        and r.recognition_state='actual' and r.category='repairs'
        and r.currency=v_expense.currency and r.amount>0;
    if not found then raise exception 'accepted repair finance source at historical site required' using errcode='22023'; end if;
  end if;
  if p_invoice_reference is null or length(trim(p_invoice_reference))<2 then
    raise exception 'invoice reference required' using errcode='22023'; end if;
  insert into public.equipment_repair_cost_links(organization_id,site_id,asset_id,maintenance_action_id,
    expense_posting_id,finance_source_row_id,invoice_reference,linked_by)
    values(v_action.organization_id,v_action.site_id,v_action.asset_id,p_action_id,
      p_expense_posting_id,p_finance_source_row_id,trim(p_invoice_reference),auth.uid())
    on conflict (organization_id,expense_posting_id) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.equipment_repair_cost_links where organization_id=v_action.organization_id
      and expense_posting_id=p_expense_posting_id and maintenance_action_id=p_action_id;
    if v_id is null then raise exception 'expense is already linked to another repair' using errcode='22023'; end if;
  end if;
  return v_id;
end $$;
revoke all on function public.link_equipment_repair_cost(uuid,uuid,text,uuid) from public,anon,authenticated;
grant execute on function public.link_equipment_repair_cost(uuid,uuid,text,uuid) to authenticated;

create function public.link_equipment_evidence(
  p_task_evidence_id uuid,p_inspection_id uuid default null,p_maintenance_action_id uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_evidence public.task_evidence%rowtype; v_org uuid; v_site uuid; v_asset uuid; v_id uuid;
begin
  if (p_inspection_id is null)=(p_maintenance_action_id is null) then
    raise exception 'select one equipment event' using errcode='22023'; end if;
  if p_inspection_id is not null then
    select organization_id,site_id,asset_id into v_org,v_site,v_asset
      from public.equipment_inspections where id=p_inspection_id;
  else
    select organization_id,site_id,asset_id into v_org,v_site,v_asset
      from public.equipment_maintenance_actions where id=p_maintenance_action_id;
  end if;
  if v_org is null or not private.can_manage_site(v_org,v_site) then
    raise exception 'equipment evidence access required' using errcode='42501'; end if;
  select * into v_evidence from public.task_evidence where id=p_task_evidence_id
    and organization_id=v_org and site_id=v_site and processing_status='ready';
  if not found then raise exception 'ready private evidence at the same site required' using errcode='22023'; end if;
  insert into public.equipment_evidence_links(organization_id,site_id,asset_id,inspection_id,
    maintenance_action_id,task_evidence_id,linked_by)
    values(v_org,v_site,v_asset,p_inspection_id,p_maintenance_action_id,p_task_evidence_id,auth.uid())
    on conflict (organization_id,task_evidence_id) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.equipment_evidence_links where organization_id=v_org
      and task_evidence_id=p_task_evidence_id and inspection_id is not distinct from p_inspection_id
      and maintenance_action_id is not distinct from p_maintenance_action_id;
    if v_id is null then raise exception 'evidence belongs to another equipment event' using errcode='22023'; end if;
  end if;
  return v_id;
end $$;
revoke all on function public.link_equipment_evidence(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.link_equipment_evidence(uuid,uuid,uuid) to authenticated;
