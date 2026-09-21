
alter table public.clients
  add column if not exists is_demo boolean not null default false,
  add column if not exists demo_note text;

alter table public.sites
  add column if not exists is_demo boolean not null default false,
  add column if not exists demo_note text,
  add column if not exists city text,
  add column if not exists province text;

alter table public.workers
  add column if not exists job_title text,
  add column if not exists is_demo boolean not null default false;

create table if not exists public.equipment_models (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  model_code text not null,
  manufacturer text not null,
  model_name text not null,
  category text not null,
  spec_summary text,
  source_url text,
  is_demo_reference boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, model_code),
  unique (organization_id, manufacturer, model_name)
);

create table if not exists public.equipment_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null,
  model_id uuid not null,
  asset_code text not null,
  status text not null default 'available'
    check (status in ('available','in_use','maintenance','out_of_service','proposed')),
  condition text not null default 'good'
    check (condition in ('new','good','fair','poor','not_applicable')),
  serial_number text,
  runtime_hours numeric(10,1) check (runtime_hours is null or runtime_hours >= 0),
  last_service_date date,
  next_service_date date,
  notes text,
  is_demo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, asset_code),
  foreign key (organization_id, site_id)
    references public.sites(organization_id, id) on delete cascade,
  foreign key (organization_id, model_id)
    references public.equipment_models(organization_id, id) on delete restrict
);

create index if not exists equipment_assets_site_idx
  on public.equipment_assets (organization_id, site_id);
create index if not exists equipment_assets_model_idx
  on public.equipment_assets (organization_id, model_id);

alter table public.equipment_models enable row level security;
alter table public.equipment_assets enable row level security;

drop policy if exists equipment_models_select on public.equipment_models;
create policy equipment_models_select
on public.equipment_models
for select
to authenticated
using (
  private.has_org_role(
    organization_id,
    array[
      'cleaner'::public.app_role,
      'site_supervisor'::public.app_role,
      'area_manager'::public.app_role,
      'operations_manager'::public.app_role,
      'organization_administrator'::public.app_role,
      'client_viewer'::public.app_role
    ]
  )
);

drop policy if exists equipment_models_insert on public.equipment_models;
create policy equipment_models_insert
on public.equipment_models
for insert
to authenticated
with check (private.can_administer_org(organization_id));

drop policy if exists equipment_models_update on public.equipment_models;
create policy equipment_models_update
on public.equipment_models
for update
to authenticated
using (private.can_administer_org(organization_id))
with check (private.can_administer_org(organization_id));

drop policy if exists equipment_models_delete on public.equipment_models;
create policy equipment_models_delete
on public.equipment_models
for delete
to authenticated
using (private.can_administer_org(organization_id));

drop policy if exists equipment_assets_select on public.equipment_assets;
create policy equipment_assets_select
on public.equipment_assets
for select
to authenticated
using (private.has_operational_site_access(organization_id, site_id));

drop policy if exists equipment_assets_insert on public.equipment_assets;
create policy equipment_assets_insert
on public.equipment_assets
for insert
to authenticated
with check (private.can_manage_site(organization_id, site_id));

drop policy if exists equipment_assets_update on public.equipment_assets;
create policy equipment_assets_update
on public.equipment_assets
for update
to authenticated
using (private.can_manage_site(organization_id, site_id))
with check (private.can_manage_site(organization_id, site_id));

drop policy if exists equipment_assets_delete on public.equipment_assets;
create policy equipment_assets_delete
on public.equipment_assets
for delete
to authenticated
using (private.can_manage_site(organization_id, site_id));

create or replace function private.can_view_site_finance(
  p_organization_id uuid,
  p_site_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_administer_org(p_organization_id)
    or (
      private.has_org_role(
        p_organization_id,
        array['area_manager'::public.app_role]
      )
      and private.has_site_access(p_organization_id, p_site_id)
    );
$$;

create or replace function private.can_edit_site_finance(
  p_organization_id uuid,
  p_site_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.can_administer_org(p_organization_id);
$$;

drop policy if exists labor_cost_entries_select on public.labor_cost_entries;
create policy labor_cost_entries_select
on public.labor_cost_entries
for select
to authenticated
using (private.can_view_site_finance(organization_id, site_id));

drop policy if exists labor_cost_entries_insert on public.labor_cost_entries;
create policy labor_cost_entries_insert
on public.labor_cost_entries
for insert
to authenticated
with check (private.can_edit_site_finance(organization_id, site_id));

drop policy if exists labor_cost_entries_update on public.labor_cost_entries;
create policy labor_cost_entries_update
on public.labor_cost_entries
for update
to authenticated
using (private.can_edit_site_finance(organization_id, site_id))
with check (private.can_edit_site_finance(organization_id, site_id));

drop policy if exists labor_cost_entries_delete on public.labor_cost_entries;
create policy labor_cost_entries_delete
on public.labor_cost_entries
for delete
to authenticated
using (private.can_edit_site_finance(organization_id, site_id));

drop policy if exists inventory_transactions_select on public.inventory_transactions;
create policy inventory_transactions_select
on public.inventory_transactions
for select
to authenticated
using (private.can_view_site_finance(organization_id, site_id));

drop policy if exists inventory_transactions_insert on public.inventory_transactions;
create policy inventory_transactions_insert
on public.inventory_transactions
for insert
to authenticated
with check (private.can_edit_site_finance(organization_id, site_id));

drop policy if exists inventory_transactions_update on public.inventory_transactions;
create policy inventory_transactions_update
on public.inventory_transactions
for update
to authenticated
using (private.can_edit_site_finance(organization_id, site_id))
with check (private.can_edit_site_finance(organization_id, site_id));

drop policy if exists inventory_transactions_delete on public.inventory_transactions;
create policy inventory_transactions_delete
on public.inventory_transactions
for delete
to authenticated
using (private.can_edit_site_finance(organization_id, site_id));

alter table public.quality_ai_budgets enable row level security;

drop policy if exists quality_ai_budgets_select on public.quality_ai_budgets;
create policy quality_ai_budgets_select
on public.quality_ai_budgets
for select
to authenticated
using (private.can_administer_org(organization_id));

drop policy if exists quality_ai_budgets_insert on public.quality_ai_budgets;
create policy quality_ai_budgets_insert
on public.quality_ai_budgets
for insert
to authenticated
with check (private.can_administer_org(organization_id));

drop policy if exists quality_ai_budgets_update on public.quality_ai_budgets;
create policy quality_ai_budgets_update
on public.quality_ai_budgets
for update
to authenticated
using (private.can_administer_org(organization_id))
with check (private.can_administer_org(organization_id));

drop policy if exists quality_ai_budgets_delete on public.quality_ai_budgets;
create policy quality_ai_budgets_delete
on public.quality_ai_budgets
for delete
to authenticated
using (private.can_administer_org(organization_id));
;
