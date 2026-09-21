create table public.equipment_assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  site_id uuid not null,
  zone_id uuid,
  asset_tag text not null check (length(trim(asset_tag)) between 2 and 80),
  equipment_type text not null check (length(trim(equipment_type)) between 2 and 120),
  manufacturer text,
  model text,
  state text not null default 'available'
    check (state in ('available', 'in_use', 'maintenance_due', 'out_of_service')),
  last_service_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, asset_tag),
  unique (organization_id, site_id, id),
  foreign key (organization_id, site_id)
    references public.sites(organization_id, id) on delete cascade,
  foreign key (organization_id, site_id, zone_id)
    references public.site_zones(organization_id, site_id, id) on delete restrict
);

create index equipment_assets_site_idx
  on public.equipment_assets (organization_id, site_id, state);

alter table public.equipment_assets enable row level security;
revoke all on table public.equipment_assets from anon, authenticated;
grant select on table public.equipment_assets to authenticated;
grant all on table public.equipment_assets to service_role;

create policy equipment_assets_select on public.equipment_assets
  for select to authenticated
  using (private.has_site_access(organization_id, site_id));

insert into public.equipment_assets (
  organization_id, site_id, asset_tag, equipment_type, manufacturer, model, state, last_service_at, notes
)
select
  site.organization_id,
  site.id,
  'EQ-' || upper(right(replace(site.id::text, '-', ''), 4)) || '-' || equipment.sequence,
  equipment.equipment_type,
  equipment.manufacturer,
  equipment.model,
  equipment.state,
  equipment.last_service_at,
  'Synthetic demo equipment record'
from public.sites as site
cross join (
  values
    ('01', 'Ride-on floor scrubber', 'Northstar Equipment', 'RS-800', 'available', '2026-08-28T16:00:00Z'::timestamptz),
    ('02', 'Walk-behind floor scrubber', 'Northstar Equipment', 'WB-420', 'in_use', '2026-09-07T16:00:00Z'::timestamptz),
    ('03', 'Carpet extractor', 'Pacific Facility Systems', 'CE-220', 'maintenance_due', '2026-07-15T16:00:00Z'::timestamptz)
) as equipment(sequence, equipment_type, manufacturer, model, state, last_service_at)
where site.organization_id = '10000000-0000-4000-8000-000000000001'
on conflict (organization_id, asset_tag) do nothing;
