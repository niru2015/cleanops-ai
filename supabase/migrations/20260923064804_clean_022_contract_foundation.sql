-- CLEAN-022: contract source terms and the immutable activation boundary.
create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null,
  client_id uuid not null,
  code text not null check (length(trim(code)) between 2 and 80),
  name text not null check (length(trim(name)) between 2 and 160),
  state text not null default 'draft' check (state in ('draft','active','archived')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, site_id, id),
  foreign key (organization_id, client_id, site_id)
    references public.sites(organization_id, client_id, id) on delete restrict
);

create table public.contract_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  contract_id uuid not null,
  version_number integer not null check (version_number > 0),
  state text not null default 'draft' check (state in ('draft','in_review','approved','active','superseded','rejected')),
  source_type text not null check (source_type in ('manual','document','amendment')),
  effective_from date,
  effective_to date,
  renewal_notes text,
  reference_notes text,
  supply_responsibility text not null default 'unknown' check (supply_responsibility in ('included','reimbursable','client_provided','mixed','unknown')),
  equipment_responsibility text not null default 'unknown' check (equipment_responsibility in ('included','reimbursable','client_provided','mixed','unknown')),
  repair_responsibility text not null default 'unknown' check (repair_responsibility in ('included','reimbursable','client_provided','mixed','unknown')),
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  activated_by uuid references auth.users(id),
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, version_number),
  unique (organization_id, site_id, id),
  check (effective_to is null or effective_from is null or effective_to > effective_from),
  check ((approved_by is null) = (approved_at is null)),
  foreign key (organization_id, site_id, contract_id)
    references public.contracts(organization_id, site_id, id) on delete cascade
);
create extension if not exists btree_gist with schema extensions;
alter table public.contract_versions add constraint contract_active_periods_do_not_overlap
  exclude using gist (contract_id with =, daterange(effective_from, effective_to, '[)') with &&)
  where (state = 'active');

create table public.contract_financial_terms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  contract_version_id uuid not null,
  basis text not null check (basis in ('fixed_monthly','fixed_annual','hourly','per_shift','project_fixed','custom')),
  amount numeric(14,2) check (amount >= 0),
  currency text check (currency ~ '^[A-Z]{3}$'),
  description text,
  effective_from date,
  effective_to date,
  source_reference text,
  created_at timestamptz not null default now(),
  unique (organization_id, site_id, id),
  check ((amount is null) = (currency is null)),
  check (effective_to is null or effective_from is null or effective_to > effective_from),
  foreign key (organization_id, site_id, contract_version_id)
    references public.contract_versions(organization_id, site_id, id) on delete cascade
);

create table public.contract_obligations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  contract_version_id uuid not null,
  zone_id uuid,
  name text not null check (length(trim(name)) between 2 and 160),
  recurrence text not null check (recurrence in ('daily','weekly','monthly','quarterly','annual')),
  work_type text not null default 'routine' check (work_type in ('routine','specialist')),
  due_window_minutes integer not null default 1440 check (due_window_minutes between 1 and 525600),
  evidence_required boolean not null default true,
  inspection_required boolean not null default false,
  source_reference text,
  created_at timestamptz not null default now(),
  unique (organization_id, site_id, id),
  foreign key (organization_id, site_id, contract_version_id)
    references public.contract_versions(organization_id, site_id, id) on delete cascade,
  foreign key (organization_id, site_id, zone_id)
    references public.site_zones(organization_id, site_id, id) on delete restrict
);

create table public.contract_staffing_requirements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  contract_version_id uuid not null,
  weekday integer not null check (weekday between 0 and 6),
  local_start time not null,
  local_end time not null,
  required_positions integer not null check (required_positions between 1 and 10000),
  source_reference text,
  created_at timestamptz not null default now(),
  unique (organization_id, site_id, id),
  check (local_end > local_start),
  foreign key (organization_id, site_id, contract_version_id)
    references public.contract_versions(organization_id, site_id, id) on delete cascade
);

create table public.contract_sla_terms (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  contract_version_id uuid not null,
  name text not null check (length(trim(name)) between 2 and 160),
  numerator_rule text not null check (length(trim(numerator_rule)) between 2 and 500),
  denominator_rule text not null check (length(trim(denominator_rule)) between 2 and 500),
  exclusion_rule text not null check (length(trim(exclusion_rule)) between 2 and 500),
  source_reference text,
  created_at timestamptz not null default now(),
  unique (organization_id, site_id, id),
  foreign key (organization_id, site_id, contract_version_id)
    references public.contract_versions(organization_id, site_id, id) on delete cascade
);

create table public.contract_revenue_expectations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  contract_version_id uuid not null,
  financial_term_id uuid not null,
  service_period date not null,
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  unique (financial_term_id, service_period),
  unique (organization_id, site_id, id),
  check (extract(day from service_period) = 1),
  foreign key (organization_id, site_id, contract_version_id)
    references public.contract_versions(organization_id, site_id, id) on delete restrict,
  foreign key (organization_id, site_id, financial_term_id)
    references public.contract_financial_terms(organization_id, site_id, id) on delete restrict
);

create table public.contract_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  contract_version_id uuid not null,
  actor_id uuid not null references auth.users(id),
  event_type text not null check (event_type in ('submitted','approved','activated','superseded')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now(),
  foreign key (organization_id, site_id, contract_version_id)
    references public.contract_versions(organization_id, site_id, id) on delete restrict
);

alter table public.service_tasks add column contract_version_id uuid,
  add constraint service_tasks_contract_version_fk foreign key (organization_id, site_id, contract_version_id)
    references public.contract_versions(organization_id, site_id, id) on delete restrict;
alter table public.service_tasks add column contract_obligation_id uuid,
  add constraint service_tasks_contract_obligation_fk foreign key (organization_id, site_id, contract_obligation_id)
    references public.contract_obligations(organization_id, site_id, id) on delete restrict;
create unique index service_tasks_contract_obligation_unique on public.service_tasks(contract_obligation_id)
  where contract_obligation_id is not null;
alter table public.task_schedules add column contract_version_id uuid,
  add constraint task_schedules_contract_version_fk foreign key (organization_id, site_id, contract_version_id)
    references public.contract_versions(organization_id, site_id, id) on delete restrict;
alter table public.shifts add column contract_version_id uuid,
  add constraint shifts_contract_version_fk foreign key (organization_id, site_id, contract_version_id)
    references public.contract_versions(organization_id, site_id, id) on delete restrict;
alter table public.shifts add column contract_staffing_requirement_id uuid,
  add constraint shifts_contract_staffing_fk foreign key (organization_id, site_id, contract_staffing_requirement_id)
    references public.contract_staffing_requirements(organization_id, site_id, id) on delete restrict;
create unique index shifts_contract_staffing_start_unique on public.shifts(contract_staffing_requirement_id, starts_at)
  where contract_staffing_requirement_id is not null;
alter table public.shift_coverage_requirements add column contract_version_id uuid,
  add constraint shift_coverage_contract_version_fk foreign key (organization_id, site_id, contract_version_id)
    references public.contract_versions(organization_id, site_id, id) on delete restrict;
alter table public.sla_definitions add column contract_version_id uuid,
  add constraint sla_definitions_contract_version_fk foreign key (organization_id, site_id, contract_version_id)
    references public.contract_versions(organization_id, site_id, id) on delete restrict;
alter table public.sla_definitions add column contract_sla_term_id uuid,
  add constraint sla_definitions_contract_term_fk foreign key (organization_id, site_id, contract_sla_term_id)
    references public.contract_sla_terms(organization_id, site_id, id) on delete restrict;
create unique index sla_definitions_contract_term_unique on public.sla_definitions(contract_sla_term_id)
  where contract_sla_term_id is not null;
alter table public.task_runs add column contract_version_id uuid,
  add constraint task_runs_contract_version_fk foreign key (organization_id, site_id, contract_version_id)
    references public.contract_versions(organization_id, site_id, id) on delete restrict;

create function private.bind_task_run_contract_version()
returns trigger language plpgsql security definer set search_path = '' as $$
declare expected_version_id uuid;
begin
  if tg_op = 'UPDATE' and old.contract_version_id is distinct from new.contract_version_id then
    raise exception 'Task run contract provenance is immutable' using errcode = '42501';
  end if;
  select schedule.contract_version_id into expected_version_id
    from public.task_schedules schedule
    where schedule.id = new.task_schedule_id and schedule.organization_id = new.organization_id
      and schedule.site_id = new.site_id;
  if expected_version_id is distinct from new.contract_version_id then
    if new.contract_version_id is not null then
      raise exception 'Task run contract provenance must match its schedule' using errcode = '23514';
    end if;
    new.contract_version_id := expected_version_id;
  end if;
  return new;
end;
$$;
create trigger task_runs_version_bind before insert or update on public.task_runs
  for each row execute function private.bind_task_run_contract_version();

create function private.guard_contract_generated_record()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user <> 'authenticated' then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  if tg_op = 'INSERT' and new.contract_version_id is not null then
    raise exception 'Contract generated records require activation' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' and old.contract_version_id is not null then
    raise exception 'Contract generated records cannot be deleted directly' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (old.contract_version_id is not null or new.contract_version_id is not null) then
    if tg_table_name = 'task_runs' and old.contract_version_id is not distinct from new.contract_version_id then
      return new;
    end if;
    raise exception 'Contract generated records cannot be changed directly' using errcode = '42501';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger service_tasks_contract_guard before insert or update or delete on public.service_tasks
  for each row execute function private.guard_contract_generated_record();
create trigger task_schedules_contract_guard before insert or update or delete on public.task_schedules
  for each row execute function private.guard_contract_generated_record();
create trigger shifts_contract_guard before insert or update or delete on public.shifts
  for each row execute function private.guard_contract_generated_record();
create trigger coverage_contract_guard before insert or update or delete on public.shift_coverage_requirements
  for each row execute function private.guard_contract_generated_record();
create trigger sla_contract_guard before insert or update or delete on public.sla_definitions
  for each row execute function private.guard_contract_generated_record();
create trigger task_runs_contract_guard before insert or update on public.task_runs
  for each row execute function private.guard_contract_generated_record();

create index contract_versions_site_state on public.contract_versions(organization_id, site_id, state, effective_from);
create index contract_revenue_site_period on public.contract_revenue_expectations(organization_id, site_id, service_period);

create function private.guard_contract_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' then
    if tg_table_name = 'contracts' then
      if (old.id,old.organization_id,old.site_id,old.client_id,old.created_by,old.state)
        is distinct from
        (new.id,new.organization_id,new.site_id,new.client_id,new.created_by,new.state) then
        raise exception 'Contract identity cannot be reassigned' using errcode = '42501';
      end if;
    end if;
    if tg_table_name = 'contract_versions' then
      if (old.id,old.organization_id,old.site_id,old.contract_id,old.version_number,
        old.source_type,old.created_by,old.state,old.approved_by,old.approved_at,
        old.activated_by,old.activated_at) is distinct from
        (new.id,new.organization_id,new.site_id,new.contract_id,new.version_number,
        new.source_type,new.created_by,new.state,new.approved_by,new.approved_at,
        new.activated_by,new.activated_at) then
        raise exception 'Contract version identity and approval cannot be reassigned' using errcode = '42501';
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger contracts_identity_guard before update on public.contracts
  for each row execute function private.guard_contract_identity();
create trigger versions_identity_guard before update on public.contract_versions
  for each row execute function private.guard_contract_identity();

alter table public.contracts enable row level security;
alter table public.contract_versions enable row level security;
alter table public.contract_financial_terms enable row level security;
alter table public.contract_obligations enable row level security;
alter table public.contract_staffing_requirements enable row level security;
alter table public.contract_sla_terms enable row level security;
alter table public.contract_revenue_expectations enable row level security;
alter table public.contract_events enable row level security;

revoke all on public.contracts, public.contract_versions, public.contract_financial_terms,
  public.contract_obligations, public.contract_staffing_requirements, public.contract_sla_terms,
  public.contract_revenue_expectations,
  public.contract_events
  from anon, authenticated;
grant select, insert, update on public.contracts, public.contract_versions, public.contract_financial_terms,
  public.contract_obligations, public.contract_staffing_requirements, public.contract_sla_terms to authenticated;
grant delete on public.contract_financial_terms, public.contract_obligations,
  public.contract_staffing_requirements, public.contract_sla_terms to authenticated;
grant select on public.contract_revenue_expectations to authenticated;
grant select on public.contract_events to authenticated;
grant all on public.contracts, public.contract_versions, public.contract_financial_terms,
  public.contract_obligations, public.contract_staffing_requirements, public.contract_sla_terms,
  public.contract_revenue_expectations,
  public.contract_events to service_role;

create function private.can_read_contract(p_organization_id uuid, p_site_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_administer_org(p_organization_id)
    or private.can_operate_org(p_organization_id)
    or (private.has_site_access(p_organization_id, p_site_id)
        and private.has_org_role(p_organization_id, array['area_manager'::public.app_role]));
$$;
create function private.can_edit_contract(p_organization_id uuid, p_site_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_administer_org(p_organization_id)
    or (private.has_site_access(p_organization_id, p_site_id)
        and private.has_org_role(p_organization_id, array['area_manager'::public.app_role]));
$$;
create function private.can_edit_contract_child(p_organization_id uuid, p_site_id uuid, p_version_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_edit_contract(p_organization_id, p_site_id) and exists (
    select 1 from public.contract_versions v
    where v.organization_id = p_organization_id and v.site_id = p_site_id
      and v.id = p_version_id and v.state = 'draft');
$$;

create policy contracts_read on public.contracts for select to authenticated
  using (private.can_read_contract(organization_id, site_id));
create policy contracts_create on public.contracts for insert to authenticated
  with check (private.can_edit_contract(organization_id, site_id) and created_by = (select auth.uid()) and state = 'draft');
create policy contracts_edit on public.contracts for update to authenticated
  using (private.can_edit_contract(organization_id, site_id) and state = 'draft')
  with check (private.can_edit_contract(organization_id, site_id) and state = 'draft');
create policy contract_versions_read on public.contract_versions for select to authenticated
  using (private.can_read_contract(organization_id, site_id));
create policy contract_versions_create on public.contract_versions for insert to authenticated
  with check (private.can_edit_contract(organization_id, site_id) and state = 'draft'
    and created_by = (select auth.uid()) and approved_by is null and activated_by is null);
create policy contract_versions_edit on public.contract_versions for update to authenticated
  using (private.can_edit_contract(organization_id, site_id) and state = 'draft')
  with check (private.can_edit_contract(organization_id, site_id) and state = 'draft'
    and approved_by is null and activated_by is null);

create policy contract_financial_terms_read on public.contract_financial_terms for select to authenticated
  using (private.can_edit_contract(organization_id, site_id));
create policy contract_obligations_read on public.contract_obligations for select to authenticated
  using (private.can_read_contract(organization_id, site_id));
create policy contract_staffing_read on public.contract_staffing_requirements for select to authenticated
  using (private.can_read_contract(organization_id, site_id));
create policy contract_sla_read on public.contract_sla_terms for select to authenticated
  using (private.can_read_contract(organization_id, site_id));
create policy contract_revenue_read on public.contract_revenue_expectations for select to authenticated
  using (private.can_edit_contract(organization_id, site_id));
create policy contract_events_read on public.contract_events for select to authenticated
  using (private.can_edit_contract(organization_id, site_id));

create policy contract_terms_create on public.contract_financial_terms for insert to authenticated
  with check (private.can_edit_contract_child(organization_id, site_id, contract_version_id));
create policy contract_terms_edit on public.contract_financial_terms for update to authenticated
  using (private.can_edit_contract_child(organization_id, site_id, contract_version_id))
  with check (private.can_edit_contract_child(organization_id, site_id, contract_version_id));
create policy contract_terms_delete on public.contract_financial_terms for delete to authenticated
  using (private.can_edit_contract_child(organization_id, site_id, contract_version_id));
create policy contract_obligations_create on public.contract_obligations for insert to authenticated
  with check (private.can_edit_contract_child(organization_id, site_id, contract_version_id));
create policy contract_obligations_edit on public.contract_obligations for update to authenticated
  using (private.can_edit_contract_child(organization_id, site_id, contract_version_id))
  with check (private.can_edit_contract_child(organization_id, site_id, contract_version_id));
create policy contract_obligations_delete on public.contract_obligations for delete to authenticated
  using (private.can_edit_contract_child(organization_id, site_id, contract_version_id));
create policy contract_staffing_create on public.contract_staffing_requirements for insert to authenticated
  with check (private.can_edit_contract_child(organization_id, site_id, contract_version_id));
create policy contract_staffing_edit on public.contract_staffing_requirements for update to authenticated
  using (private.can_edit_contract_child(organization_id, site_id, contract_version_id))
  with check (private.can_edit_contract_child(organization_id, site_id, contract_version_id));
create policy contract_staffing_delete on public.contract_staffing_requirements for delete to authenticated
  using (private.can_edit_contract_child(organization_id, site_id, contract_version_id));
create policy contract_sla_create on public.contract_sla_terms for insert to authenticated
  with check (private.can_edit_contract_child(organization_id, site_id, contract_version_id));
create policy contract_sla_edit on public.contract_sla_terms for update to authenticated
  using (private.can_edit_contract_child(organization_id, site_id, contract_version_id))
  with check (private.can_edit_contract_child(organization_id, site_id, contract_version_id));
create policy contract_sla_delete on public.contract_sla_terms for delete to authenticated
  using (private.can_edit_contract_child(organization_id, site_id, contract_version_id));

create function public.create_manual_contract(p_site_id uuid, p_code text, p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare site_row public.sites%rowtype;
declare contract_id uuid;
begin
  select * into site_row from public.sites where id = p_site_id;
  if not found or not private.can_edit_contract(site_row.organization_id, site_row.id) then
    raise exception 'Contract site is unavailable' using errcode = '42501';
  end if;
  insert into public.contracts(organization_id,site_id,client_id,code,name,created_by)
    values (site_row.organization_id,site_row.id,site_row.client_id,
      trim(p_code),trim(p_name),auth.uid()) returning id into contract_id;
  insert into public.contract_versions(organization_id,site_id,contract_id,version_number,
    source_type,created_by)
    values (site_row.organization_id,site_row.id,contract_id,1,'manual',auth.uid());
  return contract_id;
end;
$$;

-- Plans are derived from frozen approved source rows. Variable-rate/custom terms remain
-- visible on the contract but produce no invented revenue without approved activity.
create function private.contract_revenue_plan(p_version_id uuid)
returns table(financial_term_id uuid, service_period date, amount numeric, currency text)
language sql stable security definer set search_path = '' as $$
  select term.id, period.month_start::date,
    term.amount, term.currency
  from public.contract_versions version
  join public.contract_financial_terms term on term.contract_version_id = version.id
  cross join lateral (
    select (date_trunc('month', version.effective_from::timestamp)
      + month_index.n * interval '1 month')::date as month_start,
      month_index.n
    from generate_series(0, 11) as month_index(n)
  ) period
  where version.id = p_version_id
    and term.basis in ('fixed_monthly','fixed_annual')
    and term.amount is not null and term.currency is not null
    and period.month_start >= version.effective_from
    and (version.effective_to is null or period.month_start < version.effective_to)
    and period.month_start >= term.effective_from
    and (term.effective_to is null or period.month_start < term.effective_to)
    and (term.basis = 'fixed_monthly'
      or mod((extract(year from age(period.month_start, term.effective_from))::integer * 12
        + extract(month from age(period.month_start, term.effective_from))::integer), 12) = 0);
$$;

create function private.contract_staffing_plan(p_version_id uuid)
returns table(requirement_id uuid, work_date date, starts_at timestamptz,
  ends_at timestamptz, required_positions integer)
language sql stable security definer set search_path = '' as $$
  select requirement.id, day.work_date,
    (day.work_date + requirement.local_start) at time zone site.timezone,
    (day.work_date + requirement.local_end) at time zone site.timezone,
    requirement.required_positions
  from public.contract_versions version
  join public.sites site on site.organization_id = version.organization_id and site.id = version.site_id
  join public.contract_staffing_requirements requirement on requirement.contract_version_id = version.id
  cross join lateral (
    select (version.effective_from + n)::date as work_date
    from generate_series(0, 27) as n
  ) day
  where version.id = p_version_id
    and extract(dow from day.work_date)::integer = requirement.weekday
    and (version.effective_to is null or day.work_date < version.effective_to);
$$;

create function public.submit_contract_version(p_contract_version_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.contract_versions%rowtype;
begin
  select * into v from public.contract_versions where id = p_contract_version_id for update;
  if not found or not private.can_edit_contract(v.organization_id, v.site_id) or v.state <> 'draft' then
    raise exception 'Contract draft is unavailable for submission' using errcode = '42501';
  end if;
  update public.contract_versions set state = 'in_review', updated_at = now() where id = v.id;
  insert into public.contract_events(id, organization_id, site_id, contract_version_id, actor_id, event_type)
    values (md5('contract-event:' || v.id::text || ':submitted')::uuid,
      v.organization_id, v.site_id, v.id, auth.uid(), 'submitted');
end;
$$;

create function public.approve_contract_version(p_contract_version_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.contract_versions%rowtype;
begin
  select * into v from public.contract_versions where id = p_contract_version_id for update;
  if not found or not private.can_administer_org(v.organization_id)
    or v.state not in ('draft','in_review') then
    raise exception 'Director approval is required for an editable contract version' using errcode = '42501';
  end if;
  if v.effective_from is null or exists (
    select 1 from public.contract_obligations o where o.contract_version_id = v.id and o.zone_id is null
  ) or not exists (
    select 1 from public.contract_financial_terms t where t.contract_version_id = v.id
  ) or (select count(distinct t.currency) from public.contract_financial_terms t
      where t.contract_version_id = v.id and t.amount is not null) > 1
    or exists (
    select 1 from public.contract_financial_terms t where t.contract_version_id = v.id
      and (t.effective_from is null or
        (t.basis in ('fixed_monthly','fixed_annual','hourly','per_shift','project_fixed')
          and (t.amount is null or t.currency is null)) or
        (t.basis in ('fixed_monthly','fixed_annual')
          and (extract(day from v.effective_from) <> 1 or extract(day from t.effective_from) <> 1)))
  ) then
    raise exception 'Resolve effective dates, priced terms and obligation zones before approval';
  end if;
  update public.contract_versions set state = 'approved', approved_by = auth.uid(),
    approved_at = clock_timestamp(), updated_at = now() where id = v.id;
  insert into public.contract_events(id, organization_id, site_id, contract_version_id, actor_id, event_type)
    values (md5('contract-event:' || v.id::text || ':approved')::uuid,
      v.organization_id, v.site_id, v.id, auth.uid(), 'approved');
end;
$$;

create function public.preview_contract_activation(p_contract_version_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v public.contract_versions%rowtype;
declare result jsonb;
begin
  select * into v from public.contract_versions where id = p_contract_version_id;
  if not found or not private.can_administer_org(v.organization_id) or v.state <> 'approved' then
    raise exception 'Approved contract version and Director access required' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'token', md5(v.id::text || v.approved_at::text ||
      (select c.updated_at::text from public.contracts c where c.id = v.contract_id)),
    'effectiveFrom', v.effective_from,
    'tasks', (select count(*) from public.contract_obligations where contract_version_id = v.id),
    'schedules', (select count(*) from public.contract_obligations where contract_version_id = v.id),
    'coverageRequirements', (select count(*) from private.contract_staffing_plan(v.id)),
    'slaDefinitions', (select count(*) from public.contract_sla_terms where contract_version_id = v.id),
    'revenueEntries', (select count(*) from private.contract_revenue_plan(v.id)),
    'firstRevenuePeriod', (select min(service_period) from private.contract_revenue_plan(v.id)),
    'firstRevenueAmount', (select coalesce(sum(amount), 0) from private.contract_revenue_plan(v.id)
      where service_period = (select min(service_period) from private.contract_revenue_plan(v.id))),
    'currency', (select min(currency) from private.contract_revenue_plan(v.id)),
    'supersedes', (select count(*) from public.contract_versions prior where prior.contract_id = v.contract_id
      and prior.state = 'active' and prior.effective_from < v.effective_from
      and (prior.effective_to is null or prior.effective_to > v.effective_from))
  ) into result;
  return result;
end;
$$;

create function public.activate_contract_version(p_contract_version_id uuid, p_preview_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.contract_versions%rowtype;
declare contract_row public.contracts%rowtype;
declare prior public.contract_versions%rowtype;
declare impact jsonb;
declare obligation public.contract_obligations%rowtype;
declare staffing record;
declare revenue record;
declare sla public.contract_sla_terms%rowtype;
declare task_id uuid;
declare shift_id uuid;
begin
  select * into v from public.contract_versions where id = p_contract_version_id for update;
  if not found or not private.can_administer_org(v.organization_id) or v.state <> 'approved' then
    raise exception 'Approved contract version and Director access required' using errcode = '42501';
  end if;
  select * into contract_row from public.contracts where id = v.contract_id for update;
  impact := public.preview_contract_activation(v.id);
  if p_preview_token is distinct from impact->>'token' then
    raise exception 'Contract impact preview is stale';
  end if;
  if exists (select 1 from public.contract_versions competing where competing.contract_id = v.contract_id
    and competing.state = 'active' and competing.effective_from >= v.effective_from) then
    raise exception 'A later active version already exists';
  end if;
  select * into prior from public.contract_versions previous
    where previous.contract_id = v.contract_id and previous.state = 'active'
      and previous.effective_from < v.effective_from
      and (previous.effective_to is null or previous.effective_to > v.effective_from)
    for update;
  if found then
    update public.contract_versions set effective_to = v.effective_from,
      updated_at = now() where id = prior.id;
    update public.contract_revenue_expectations set is_current = false
      where contract_version_id = prior.id and service_period >= v.effective_from;
    update public.task_schedules set recurrence = recurrence || jsonb_build_object('effective_to', v.effective_from)
      where contract_version_id = prior.id;
    update public.shifts set state = 'cancelled'
      where contract_version_id = prior.id and starts_at >= v.effective_from::timestamptz and state = 'planned';
    insert into public.contract_events(id, organization_id, site_id, contract_version_id, actor_id, event_type,
      details) values (md5('contract-event:' || prior.id::text || ':superseded-by:' || v.id::text)::uuid,
      v.organization_id, v.site_id, prior.id, auth.uid(), 'superseded',
      jsonb_build_object('byVersionId', v.id, 'effectiveFrom', v.effective_from));
  end if;
  for obligation in select * from public.contract_obligations where contract_version_id = v.id loop
    insert into public.service_tasks(id, organization_id, site_id, name, evidence_required,
      contract_version_id, contract_obligation_id)
      values (md5('contract-task:' || obligation.id::text)::uuid, v.organization_id, v.site_id,
        left(obligation.name || ' [' || contract_row.code || ' v' || v.version_number || ' ' || left(obligation.id::text,8) || ']', 160),
        obligation.evidence_required, v.id, obligation.id)
      returning id into task_id;
    insert into public.task_schedules(id, organization_id, site_id, task_id, zone_id, recurrence,
      contract_version_id)
      values (md5('contract-schedule:' || obligation.id::text)::uuid,
        v.organization_id, v.site_id, task_id, obligation.zone_id,
        jsonb_build_object('kind', obligation.recurrence, 'effective_from', v.effective_from,
          'effective_to', v.effective_to, 'due_window_minutes', obligation.due_window_minutes,
          'inspection_required', obligation.inspection_required), v.id);
  end loop;
  for staffing in select * from private.contract_staffing_plan(v.id) loop
    insert into public.shifts(id, organization_id, site_id, starts_at, ends_at, contract_version_id,
      contract_staffing_requirement_id)
      values (md5('contract-shift:' || staffing.requirement_id::text || ':' || staffing.work_date::text)::uuid,
        v.organization_id, v.site_id, staffing.starts_at, staffing.ends_at, v.id,
        staffing.requirement_id) returning id into shift_id;
    insert into public.shift_coverage_requirements(id, organization_id, site_id, shift_id,
      required_positions, contract_version_id)
      values (md5('contract-coverage:' || staffing.requirement_id::text || ':' || staffing.work_date::text)::uuid,
        v.organization_id, v.site_id, shift_id, staffing.required_positions, v.id);
  end loop;
  for revenue in select * from private.contract_revenue_plan(v.id) loop
    insert into public.contract_revenue_expectations(id, organization_id, site_id, contract_version_id,
      financial_term_id, service_period, amount, currency)
      values (md5('contract-revenue:' || revenue.financial_term_id::text || ':' || revenue.service_period::text)::uuid,
        v.organization_id, v.site_id, v.id, revenue.financial_term_id,
        revenue.service_period, revenue.amount, revenue.currency);
  end loop;
  for sla in select * from public.contract_sla_terms where contract_version_id = v.id loop
    insert into public.sla_definitions(id, organization_id, site_id, name, version, window_start,
      window_end, numerator_rule, denominator_rule, exclusion_rule, contract_version_id,
      contract_sla_term_id)
      values (md5('contract-sla:' || sla.id::text)::uuid,
        v.organization_id, v.site_id, left(sla.name || ' [' || contract_row.code || ']',160),
        v.version_number, v.effective_from::timestamptz,
        coalesce(v.effective_to::timestamptz, (v.effective_from + interval '12 months')::timestamptz),
        sla.numerator_rule, sla.denominator_rule, sla.exclusion_rule, v.id, sla.id);
  end loop;
  update public.contract_versions set state = 'active', activated_by = auth.uid(),
    activated_at = clock_timestamp(), updated_at = now() where id = v.id;
  update public.contracts set state = 'active', updated_at = now() where id = contract_row.id;
  insert into public.contract_events(id, organization_id, site_id, contract_version_id, actor_id, event_type,
    details) values (md5('contract-event:' || v.id::text || ':activated')::uuid,
    v.organization_id, v.site_id, v.id, auth.uid(), 'activated', impact);
  return impact;
end;
$$;

revoke all on function public.create_manual_contract(uuid,text,text),
  public.submit_contract_version(uuid), public.approve_contract_version(uuid),
  public.preview_contract_activation(uuid), public.activate_contract_version(uuid,text) from public, anon;
grant execute on function public.create_manual_contract(uuid,text,text),
  public.submit_contract_version(uuid), public.approve_contract_version(uuid),
  public.preview_contract_activation(uuid), public.activate_contract_version(uuid,text) to authenticated;
