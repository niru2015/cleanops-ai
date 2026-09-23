-- CLEAN-036: approved operational hours precede confidential Director cost posting.
-- One minute is represented as 1/60 hour rounded to six decimal places; this is
-- a technical precision limit, not a wage or overtime rule.
alter table public.labor_cost_entries drop column total_cost;
alter table public.labor_cost_entries alter column hours type numeric(10,6);
alter table public.labor_cost_entries alter column hourly_cost type numeric(12,4);
alter table public.labor_cost_entries add column total_cost numeric(14,2)
  generated always as (round(hours * hourly_cost,2)) stored;

create table public.worker_cost_rates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  worker_id uuid not null,
  rate_type text not null check (rate_type in ('regular','overtime','contractor')),
  hourly_cost numeric(12,4) not null check (hourly_cost>=0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  effective_from date not null,
  effective_to date,
  state text not null default 'active' check (state in ('active','superseded')),
  reference text check (length(reference)<=180),
  reason text not null check (length(trim(reason)) between 4 and 500),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (organization_id,id),
  foreign key (organization_id,worker_id) references public.workers(organization_id,id),
  check (effective_to is null or effective_to>effective_from)
);
create extension if not exists btree_gist with schema extensions;
alter table public.worker_cost_rates add constraint worker_cost_rates_active_nonoverlap
  exclude using gist (organization_id with =,worker_id with =,rate_type with =,
    daterange(effective_from,effective_to,'[)') with &&) where (state='active');
create index worker_cost_rates_worker_date on public.worker_cost_rates
  (organization_id,worker_id,rate_type,effective_from desc);

create table public.worker_cost_rate_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  rate_id uuid not null,
  action text not null check (action in ('created','ended','superseded')),
  before_value jsonb,
  after_value jsonb,
  reason text not null,
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (organization_id,rate_id) references public.worker_cost_rates(organization_id,id)
);

create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  worker_id uuid not null,
  assignment_id uuid,
  shift_id uuid,
  task_run_id uuid,
  contract_version_id uuid,
  project_reference text check (length(project_reference)<=180),
  source_type text not null check (source_type in
    ('shift_attendance','manual_project','correction','import_reference')),
  source_fingerprint text,
  work_date date not null,
  started_at timestamptz,
  ended_at timestamptz,
  hours numeric(10,6) check (hours>0 and hours<=24),
  cost_type text not null default 'regular' check (cost_type in ('regular','overtime','contractor')),
  state text not null default 'draft' check (state in ('draft','exception','approved','rejected','posted')),
  exception_code text,
  revision integer not null default 1 check (revision>0),
  review_reason text check (length(review_reason)<=500),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  labor_cost_entry_id uuid,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id,id),
  unique (organization_id,site_id,id),
  foreign key (organization_id,site_id) references public.sites(organization_id,id),
  foreign key (organization_id,worker_id) references public.workers(organization_id,id),
  foreign key (organization_id,site_id,worker_id)
    references public.worker_site_permissions(organization_id,site_id,worker_id),
  foreign key (organization_id,site_id,assignment_id)
    references public.shift_assignments(organization_id,site_id,id),
  foreign key (organization_id,site_id,shift_id)
    references public.shifts(organization_id,site_id,id),
  foreign key (organization_id,site_id,task_run_id)
    references public.task_runs(organization_id,site_id,id),
  foreign key (organization_id,site_id,contract_version_id)
    references public.contract_versions(organization_id,site_id,id),
  check ((source_type='shift_attendance' and assignment_id is not null and shift_id is not null)
    or (source_type<>'shift_attendance' and assignment_id is null)),
  check (source_type<>'manual_project' or length(trim(coalesce(project_reference,'')))>=2),
  check (ended_at is null or started_at is null or ended_at>started_at),
  check ((state='exception' and exception_code is not null)
    or (state<>'exception' and exception_code is null)),
  check ((state in ('approved','posted'))=(approved_by is not null and approved_at is not null)),
  check ((state='posted')=(labor_cost_entry_id is not null))
);
create unique index time_one_shift_entry on public.time_entries(organization_id,assignment_id)
  where source_type='shift_attendance';
create index time_entries_site_date on public.time_entries(organization_id,site_id,work_date desc,state);

create table public.time_entry_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  time_entry_id uuid not null,
  action text not null,
  before_value jsonb,
  after_value jsonb,
  reason text,
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (organization_id,site_id,time_entry_id)
    references public.time_entries(organization_id,site_id,id)
);

alter table public.labor_cost_entries add column time_entry_id uuid,
  add column contract_version_id uuid,
  add column project_reference text check (length(project_reference)<=180),
  add constraint labor_cost_time_entry_fk foreign key (organization_id,site_id,time_entry_id)
    references public.time_entries(organization_id,site_id,id),
  add constraint labor_cost_contract_version_fk foreign key (organization_id,site_id,contract_version_id)
    references public.contract_versions(organization_id,site_id,id);
create unique index labor_cost_time_entry_once on public.labor_cost_entries(organization_id,time_entry_id)
  where time_entry_id is not null;
alter table public.time_entries add constraint time_entry_posted_ledger_fk
  foreign key (organization_id,labor_cost_entry_id)
  references public.labor_cost_entries(organization_id,id);

alter table public.worker_cost_rates enable row level security;
alter table public.worker_cost_rate_events enable row level security;
alter table public.time_entries enable row level security;
alter table public.time_entry_events enable row level security;
revoke all on public.worker_cost_rates,public.worker_cost_rate_events,
  public.time_entries,public.time_entry_events from public,anon,authenticated;
grant select on public.worker_cost_rates,public.worker_cost_rate_events,
  public.time_entries,public.time_entry_events to authenticated;
grant all on public.worker_cost_rates,public.worker_cost_rate_events,
  public.time_entries,public.time_entry_events to service_role;
create policy worker_cost_rates_director_read on public.worker_cost_rates for select to authenticated
  using (private.can_administer_org(organization_id));
create policy worker_cost_rate_events_director_read on public.worker_cost_rate_events for select to authenticated
  using (private.can_administer_org(organization_id));
create policy time_entries_operational_read on public.time_entries for select to authenticated
  using (private.can_manage_site(organization_id,site_id));
create policy time_entry_events_operational_read on public.time_entry_events for select to authenticated
  using (private.can_manage_site(organization_id,site_id));

create function private.guard_time_cost_provenance()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='INSERT' then
    if new.time_entry_id is not null and current_user<>'postgres' then
      raise exception 'Time-linked cost must be posted through Director approval' using errcode='42501';
    end if;
    return new;
  end if;
  if old.time_entry_id is not null or (tg_op='UPDATE' and new.time_entry_id is not null) then
    raise exception 'Posted time cost is immutable' using errcode='42501';
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
create trigger labor_cost_time_provenance_insert before insert on public.labor_cost_entries
  for each row execute function private.guard_time_cost_provenance();
create trigger labor_cost_time_provenance_change before update or delete on public.labor_cost_entries
  for each row execute function private.guard_time_cost_provenance();

create function private.prevent_time_audit_mutation()
returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Time and rate audit history is immutable'; end;
$$;
create trigger time_entry_events_immutable before update or delete on public.time_entry_events
  for each row execute function private.prevent_time_audit_mutation();
create trigger worker_cost_rate_events_immutable before update or delete on public.worker_cost_rate_events
  for each row execute function private.prevent_time_audit_mutation();

create function public.set_worker_cost_rate(p_worker_id uuid,p_rate_type text,p_hourly_cost numeric,
  p_currency text,p_effective_from date,p_effective_to date,p_reference text,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_prior public.worker_cost_rates%rowtype; v_id uuid;
begin
  select organization_id into v_org from public.workers where id=p_worker_id;
  if v_org is null or auth.uid() is null or not private.can_administer_org(v_org) then
    raise exception 'Director rate access required' using errcode='42501'; end if;
  if p_rate_type not in ('regular','overtime','contractor') or p_hourly_cost is null
    or p_hourly_cost<0 or p_hourly_cost>10000 or p_hourly_cost<>round(p_hourly_cost,4)
    or p_currency is null or p_currency !~ '^[A-Z]{3}$'
    or p_effective_from is null or (p_effective_to is not null and p_effective_to<=p_effective_from)
    or length(trim(coalesce(p_reason,''))) not between 4 and 500
    or length(coalesce(p_reference,''))>180 then raise exception 'Invalid worker cost rate'; end if;
  perform 1 from public.workers where organization_id=v_org and id=p_worker_id for update;
  select * into v_prior from public.worker_cost_rates
    where organization_id=v_org and worker_id=p_worker_id and rate_type=p_rate_type
      and state='active' and effective_from<=p_effective_from
      and (effective_to is null or effective_to>p_effective_from)
    for update;
  if found then
    if v_prior.effective_from=p_effective_from then
      update public.worker_cost_rates set state='superseded' where id=v_prior.id;
      insert into public.worker_cost_rate_events(organization_id,rate_id,action,before_value,
        after_value,reason,actor_id)
      values(v_org,v_prior.id,'superseded',to_jsonb(v_prior),
        jsonb_build_object('state','superseded'),trim(p_reason),auth.uid());
    else
      update public.worker_cost_rates set effective_to=p_effective_from where id=v_prior.id;
      insert into public.worker_cost_rate_events(organization_id,rate_id,action,before_value,
        after_value,reason,actor_id)
      values(v_org,v_prior.id,'ended',to_jsonb(v_prior),
        jsonb_build_object('effectiveTo',p_effective_from),trim(p_reason),auth.uid());
    end if;
  end if;
  insert into public.worker_cost_rates(organization_id,worker_id,rate_type,hourly_cost,
    currency,effective_from,effective_to,reference,reason,created_by)
  values(v_org,p_worker_id,p_rate_type,p_hourly_cost,p_currency,p_effective_from,
    p_effective_to,nullif(trim(p_reference),''),trim(p_reason),auth.uid()) returning id into v_id;
  insert into public.worker_cost_rate_events(organization_id,rate_id,action,after_value,
    reason,actor_id)
  values(v_org,v_id,'created',jsonb_build_object('hourlyCost',p_hourly_cost,
    'currency',p_currency,'effectiveFrom',p_effective_from,'effectiveTo',p_effective_to,
    'rateType',p_rate_type),trim(p_reason),auth.uid());
  return v_id;
end;
$$;
revoke all on function public.set_worker_cost_rate(uuid,text,numeric,text,date,date,text,text) from public,anon;
grant execute on function public.set_worker_cost_rate(uuid,text,numeric,text,date,date,text,text) to authenticated;

create function public.derive_shift_time_entry(p_assignment_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare a public.shift_assignments%rowtype; s public.shifts%rowtype;
declare v_timezone text; v_in timestamptz; v_out timestamptz;
declare v_state text; v_exception text; v_hours numeric; v_work_date date;
declare v_fingerprint text; v_existing public.time_entries%rowtype; v_id uuid;
begin
  select * into a from public.shift_assignments where id=p_assignment_id for update;
  if not found or auth.uid() is null or not private.can_manage_site(a.organization_id,a.site_id) then
    raise exception 'Time source access denied' using errcode='42501'; end if;
  select * into s from public.shifts where organization_id=a.organization_id and site_id=a.site_id and id=a.shift_id;
  select timezone into v_timezone from public.sites where organization_id=a.organization_id and id=a.site_id;
  select min(occurred_at) filter (where event_type='check_in'),
    min(occurred_at) filter (where event_type='check_out') into v_in,v_out
  from public.attendance_events where organization_id=a.organization_id and assignment_id=a.id;
  if v_in is null and v_out is null then return null; end if;
  v_fingerprint:=md5(concat_ws('|',a.id::text,a.state::text,
    coalesce(v_in::text,'missing'),coalesce(v_out::text,'missing')));
  v_work_date:=(coalesce(v_in,v_out,s.starts_at) at time zone v_timezone)::date;
  v_exception:=case when a.state='cancelled' then 'worker_swap'
    when v_in is null then 'missing_check_in'
    when v_out is null then 'missing_checkout'
    when v_out<=v_in then 'invalid_sequence'
    when extract(epoch from v_out-v_in)>86400 then 'over_24_hours'
    else null end;
  v_state:=case when v_exception is null then 'draft' else 'exception' end;
  v_hours:=case when v_exception is null then round((extract(epoch from v_out-v_in)/3600)::numeric,6)
    else null end;
  select * into v_existing from public.time_entries where organization_id=a.organization_id
    and assignment_id=a.id and source_type='shift_attendance' for update;
  if found then
    if v_existing.source_fingerprint=v_fingerprint then return v_existing.id; end if;
    if v_existing.state in ('posted','rejected') then
      raise exception 'Reviewed time source changed; create an audited correction'; end if;
    update public.time_entries set work_date=v_work_date,started_at=case when v_exception='invalid_sequence' then null else v_in end,
      ended_at=case when v_exception='invalid_sequence' then null else v_out end,
      hours=v_hours,state=v_state,exception_code=v_exception,source_fingerprint=v_fingerprint,
      revision=revision+1,approved_by=null,approved_at=null,review_reason=null,updated_at=now()
    where id=v_existing.id;
    v_id:=v_existing.id;
    insert into public.time_entry_events(organization_id,site_id,time_entry_id,action,before_value,
      after_value,reason,actor_id)
    values(a.organization_id,a.site_id,v_id,'source_refreshed',to_jsonb(v_existing),
      jsonb_build_object('state',v_state,'exception',v_exception,'hours',v_hours),
      'Attendance source changed',auth.uid());
  else
    insert into public.time_entries(organization_id,site_id,worker_id,assignment_id,shift_id,
      contract_version_id,source_type,source_fingerprint,work_date,started_at,ended_at,
      hours,state,exception_code,created_by)
    values(a.organization_id,a.site_id,a.worker_id,a.id,s.id,s.contract_version_id,
      'shift_attendance',v_fingerprint,v_work_date,
      case when v_exception='invalid_sequence' then null else v_in end,
      case when v_exception='invalid_sequence' then null else v_out end,
      v_hours,v_state,v_exception,auth.uid()) returning id into v_id;
    insert into public.time_entry_events(organization_id,site_id,time_entry_id,action,
      after_value,reason,actor_id)
    values(a.organization_id,a.site_id,v_id,'derived',jsonb_build_object('state',v_state,
      'exception',v_exception,'hours',v_hours),'Attendance source',auth.uid());
  end if;
  return v_id;
end;
$$;
revoke all on function public.derive_shift_time_entry(uuid) from public,anon;
grant execute on function public.derive_shift_time_entry(uuid) to authenticated;

create function public.create_manual_time_entry(p_site_id uuid,p_worker_id uuid,p_work_date date,
  p_hours numeric,p_cost_type text,p_project_reference text,p_contract_version_id uuid,
  p_task_run_id uuid,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_id uuid;
begin
  select organization_id into v_org from public.sites where id=p_site_id;
  if v_org is null or auth.uid() is null or not private.can_manage_site(v_org,p_site_id) then
    raise exception 'Manual time access denied' using errcode='42501'; end if;
  if p_work_date is null or p_hours is null or p_hours<=0 or p_hours>24
    or p_hours<>round(p_hours,6)
    or p_cost_type not in ('regular','overtime','contractor')
    or length(trim(coalesce(p_project_reference,''))) not between 2 and 180
    or length(trim(coalesce(p_reason,''))) not between 4 and 500
    or not exists(select 1 from public.worker_site_permissions where organization_id=v_org
      and site_id=p_site_id and worker_id=p_worker_id and state='active'
      and valid_from<(p_work_date+1)::timestamptz
      and (valid_until is null or valid_until>p_work_date::timestamptz)) then
    raise exception 'Invalid manual project time'; end if;
  insert into public.time_entries(organization_id,site_id,worker_id,task_run_id,
    contract_version_id,project_reference,source_type,work_date,hours,cost_type,created_by,
    review_reason)
  values(v_org,p_site_id,p_worker_id,p_task_run_id,p_contract_version_id,
    trim(p_project_reference),'manual_project',p_work_date,p_hours,p_cost_type,auth.uid(),trim(p_reason))
  returning id into v_id;
  insert into public.time_entry_events(organization_id,site_id,time_entry_id,action,
    after_value,reason,actor_id)
  values(v_org,p_site_id,v_id,'manual_created',jsonb_build_object('hours',p_hours,
    'projectReference',p_project_reference,'costType',p_cost_type),trim(p_reason),auth.uid());
  return v_id;
end;
$$;
revoke all on function public.create_manual_time_entry(uuid,uuid,date,numeric,text,text,uuid,uuid,text) from public,anon;
grant execute on function public.create_manual_time_entry(uuid,uuid,date,numeric,text,text,uuid,uuid,text) to authenticated;

create function public.review_time_entry(p_time_entry_id uuid,p_action text,p_hours numeric,
  p_cost_type text,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare t public.time_entries%rowtype; v_next text;
begin
  select * into t from public.time_entries where id=p_time_entry_id for update;
  if not found or auth.uid() is null or not private.can_manage_site(t.organization_id,t.site_id) then
    raise exception 'Time review denied' using errcode='42501'; end if;
  if t.state in ('posted','rejected') then raise exception 'Time entry is final'; end if;
  if length(trim(coalesce(p_reason,''))) not between 4 and 500 then
    raise exception 'Review reason required'; end if;
  if p_action='approve' then
    if p_hours is null or p_hours<=0 or p_hours>24 or p_hours<>round(p_hours,6)
      or p_cost_type not in ('regular','overtime','contractor') then
      raise exception 'Valid approved hours and cost class required'; end if;
    v_next:='approved';
    update public.time_entries set hours=p_hours,cost_type=p_cost_type,state=v_next,
      exception_code=null,approved_by=auth.uid(),approved_at=now(),
      review_reason=trim(p_reason),revision=revision+1,updated_at=now() where id=t.id;
  elsif p_action='reject' then
    v_next:='rejected';
    update public.time_entries set state=v_next,exception_code=null,hours=null,
      approved_by=null,approved_at=null,review_reason=trim(p_reason),
      revision=revision+1,updated_at=now() where id=t.id;
  else raise exception 'Invalid time review action'; end if;
  insert into public.time_entry_events(organization_id,site_id,time_entry_id,action,
    before_value,after_value,reason,actor_id)
  values(t.organization_id,t.site_id,t.id,v_next,to_jsonb(t),
    jsonb_build_object('hours',p_hours,'costType',p_cost_type,'revision',t.revision+1),
    trim(p_reason),auth.uid());
  return t.id;
end;
$$;
revoke all on function public.review_time_entry(uuid,text,numeric,text,text) from public,anon;
grant execute on function public.review_time_entry(uuid,text,numeric,text,text) to authenticated;

create function public.post_approved_time_cost(p_time_entry_id uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare t public.time_entries%rowtype; r public.worker_cost_rates%rowtype;
declare v_rate_count integer; v_ledger_id uuid;
begin
  select * into t from public.time_entries where id=p_time_entry_id for update;
  if not found or auth.uid() is null or not private.can_administer_org(t.organization_id) then
    raise exception 'Director time posting required' using errcode='42501'; end if;
  if t.state='posted' then return t.labor_cost_entry_id; end if;
  if t.state<>'approved' or t.hours is null then
    raise exception 'Approved hours required before cost posting'; end if;
  select count(*) into v_rate_count from public.worker_cost_rates
    where organization_id=t.organization_id and worker_id=t.worker_id and rate_type=t.cost_type
      and state='active' and effective_from<=t.work_date
      and (effective_to is null or effective_to>t.work_date);
  if v_rate_count<>1 then raise exception 'Exactly one effective worker rate required'; end if;
  select * into r from public.worker_cost_rates where organization_id=t.organization_id
    and worker_id=t.worker_id and rate_type=t.cost_type and state='active'
    and effective_from<=t.work_date and (effective_to is null or effective_to>t.work_date)
    for share;
  if r.currency<>'CAD' then raise exception 'Non-CAD cost rate awaits currency conversion support'; end if;
  insert into public.labor_cost_entries(organization_id,site_id,worker_id,task_run_id,
    time_entry_id,contract_version_id,project_reference,work_date,hours,hourly_cost,
    cost_type,notes)
  values(t.organization_id,t.site_id,t.worker_id,t.task_run_id,t.id,t.contract_version_id,
    t.project_reference,t.work_date,t.hours,r.hourly_cost,t.cost_type,
    'Approved time entry '||t.id::text) returning id into v_ledger_id;
  update public.time_entries set state='posted',labor_cost_entry_id=v_ledger_id,
    updated_at=now() where id=t.id;
  insert into public.time_entry_events(organization_id,site_id,time_entry_id,action,
    after_value,reason,actor_id)
  values(t.organization_id,t.site_id,t.id,'posted',
    jsonb_build_object('laborCostEntryId',v_ledger_id,'rateId',r.id),
    'Director cost posting',auth.uid());
  return v_ledger_id;
end;
$$;
revoke all on function public.post_approved_time_cost(uuid) from public,anon;
grant execute on function public.post_approved_time_cost(uuid) to authenticated;
