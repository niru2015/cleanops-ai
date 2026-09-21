grant select on table public.equipment_models, public.equipment_assets to authenticated;
grant all on table public.equipment_models, public.equipment_assets to service_role;

insert into public.equipment_models (
  id, organization_id, model_code, manufacturer, model_name, category, spec_summary
)
select model.id, organization.id, model.model_code, model.manufacturer,
       model.model_name, model.category, 'Synthetic demo reference'
from public.organizations as organization
cross join (
  values
    ('e1000000-0000-4000-8000-000000000001'::uuid, 'RS-800', 'Northstar Equipment', 'RS-800', 'Ride-on floor scrubber'),
    ('e1000000-0000-4000-8000-000000000002'::uuid, 'WB-420', 'Northstar Equipment', 'WB-420', 'Walk-behind floor scrubber'),
    ('e1000000-0000-4000-8000-000000000003'::uuid, 'CE-220', 'Pacific Facility Systems', 'CE-220', 'Carpet extractor')
) as model(id, model_code, manufacturer, model_name, category)
where organization.id = '10000000-0000-4000-8000-000000000001'
on conflict (organization_id, model_code) do update
set manufacturer = excluded.manufacturer,
    model_name = excluded.model_name,
    category = excluded.category,
    spec_summary = excluded.spec_summary,
    updated_at = now();

insert into public.equipment_assets (
  organization_id, site_id, model_id, asset_code, status, condition,
  last_service_date, next_service_date, notes, is_demo
)
select
  site.organization_id,
  site.id,
  equipment.model_id,
  'EQ-' || upper(right(replace(site.id::text, '-', ''), 4)) || '-' || equipment.sequence,
  equipment.status,
  equipment.condition,
  equipment.last_service_date,
  equipment.next_service_date,
  'Synthetic demo equipment record',
  true
from public.sites as site
cross join (
  values
    ('01', 'e1000000-0000-4000-8000-000000000001'::uuid, 'available', 'good', '2026-08-28'::date, '2026-11-28'::date),
    ('02', 'e1000000-0000-4000-8000-000000000002'::uuid, 'in_use', 'good', '2026-09-07'::date, '2026-12-07'::date),
    ('03', 'e1000000-0000-4000-8000-000000000003'::uuid, 'maintenance', 'fair', '2026-07-15'::date, '2026-09-30'::date)
) as equipment(sequence, model_id, status, condition, last_service_date, next_service_date)
where site.organization_id = '10000000-0000-4000-8000-000000000001'
on conflict (organization_id, asset_code) do nothing;
