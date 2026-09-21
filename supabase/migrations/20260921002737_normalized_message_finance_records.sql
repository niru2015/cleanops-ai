-- CLEAN-027: normalized message context, media metadata and finance records.
-- These tables are service-role-only until authenticated read/write workflows are added.

create table public.external_message_contexts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  external_message_id uuid not null,
  site_id uuid,
  zone_id uuid,
  task_run_id uuid,
  sender_worker_id uuid,
  sender_role text not null default 'unknown'
    check (sender_role in ('supervisor', 'manager', 'cleaner', 'system', 'unknown')),
  resolution_status text not null default 'unresolved'
    check (resolution_status in ('unresolved', 'suggested', 'confirmed', 'rejected')),
  resolution_source text
    check (resolution_source is null or resolution_source in ('manual', 'deterministic', 'ai')),
  confidence numeric(5,4)
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, external_message_id),
  unique (organization_id, id),
  foreign key (organization_id, external_message_id)
    references public.external_messages (organization_id, id) on delete cascade,
  foreign key (organization_id, site_id)
    references public.sites (organization_id, id) on delete restrict,
  foreign key (organization_id, site_id, zone_id)
    references public.site_zones (organization_id, site_id, id) on delete restrict,
  foreign key (organization_id, site_id, task_run_id)
    references public.task_runs (organization_id, site_id, id) on delete restrict,
  foreign key (organization_id, sender_worker_id)
    references public.workers (organization_id, id) on delete restrict
);

create table public.external_message_media (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  external_message_id uuid not null,
  media_kind text not null check (media_kind in ('image', 'document', 'video', 'audio', 'sticker')),
  external_media_id text not null check (char_length(external_media_id) between 1 and 255),
  mime_type text,
  caption text,
  storage_path text,
  ingestion_status text not null default 'pending'
    check (ingestion_status in ('pending', 'downloaded', 'quarantined', 'failed')),
  created_at timestamptz not null default now(),
  unique (organization_id, external_message_id, external_media_id),
  foreign key (organization_id, external_message_id)
    references public.external_messages (organization_id, id) on delete cascade
);

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  vendor_code text,
  name text not null check (char_length(name) between 1 and 200),
  contact_reference text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, vendor_code)
);

create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  sku text,
  name text not null check (char_length(name) between 1 and 200),
  category text,
  unit_of_measure text not null check (char_length(unit_of_measure) between 1 and 40),
  reorder_level numeric(12,3) not null default 0 check (reorder_level >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, sku)
);

create table public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  vendor_id uuid,
  inventory_item_id uuid not null,
  source_message_id uuid,
  transaction_type text not null check (transaction_type in ('receipt', 'issue', 'adjustment', 'count')),
  quantity numeric(12,3) not null check (quantity > 0),
  unit_cost numeric(12,2) not null default 0 check (unit_cost >= 0),
  total_cost numeric(14,2) generated always as (round(quantity * unit_cost, 2)) stored,
  occurred_at timestamptz not null,
  notes text,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, site_id)
    references public.sites (organization_id, id) on delete restrict,
  foreign key (organization_id, vendor_id)
    references public.vendors (organization_id, id) on delete restrict,
  foreign key (organization_id, inventory_item_id)
    references public.inventory_items (organization_id, id) on delete restrict,
  foreign key (organization_id, source_message_id)
    references public.external_messages (organization_id, id) on delete set null
);

create table public.labor_cost_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  worker_id uuid,
  task_run_id uuid,
  source_message_id uuid,
  work_date date not null,
  hours numeric(8,2) not null check (hours > 0 and hours <= 24),
  hourly_cost numeric(12,2) not null check (hourly_cost >= 0),
  total_cost numeric(14,2) generated always as (round(hours * hourly_cost, 2)) stored,
  cost_type text not null default 'regular'
    check (cost_type in ('regular', 'overtime', 'contractor')),
  notes text,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, site_id)
    references public.sites (organization_id, id) on delete restrict,
  foreign key (organization_id, worker_id)
    references public.workers (organization_id, id) on delete restrict,
  foreign key (organization_id, site_id, task_run_id)
    references public.task_runs (organization_id, site_id, id) on delete restrict,
  foreign key (organization_id, source_message_id)
    references public.external_messages (organization_id, id) on delete set null
);

create index external_message_contexts_site_idx
  on public.external_message_contexts (organization_id, site_id, resolution_status);
create index external_message_media_message_idx
  on public.external_message_media (organization_id, external_message_id);
create index vendors_name_idx on public.vendors (organization_id, name);
create index inventory_items_name_idx on public.inventory_items (organization_id, name);
create index inventory_transactions_site_time_idx
  on public.inventory_transactions (organization_id, site_id, occurred_at desc);
create index labor_cost_entries_site_date_idx
  on public.labor_cost_entries (organization_id, site_id, work_date desc);

alter table public.external_message_contexts enable row level security;
alter table public.external_message_media enable row level security;
alter table public.vendors enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_transactions enable row level security;
alter table public.labor_cost_entries enable row level security;

revoke all on table public.external_message_contexts, public.external_message_media,
  public.vendors, public.inventory_items, public.inventory_transactions,
  public.labor_cost_entries from anon, authenticated;
grant all on table public.external_message_contexts, public.external_message_media,
  public.vendors, public.inventory_items, public.inventory_transactions,
  public.labor_cost_entries to service_role;
