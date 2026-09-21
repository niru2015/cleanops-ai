grant select on table public.equipment_models, public.equipment_assets to authenticated;
grant all on table public.equipment_models, public.equipment_assets to service_role;

insert into public.equipment_models (
  organization_id, model_code, manufacturer, model_name, category, spec_summary
)
select organization.id, model.model_code, model.manufacturer,
       model.model_name, model.category, 'Synthetic demo reference'
from public.organizations as organization
cross join (
  values
    ('RS-800', 'Northstar Equipment', 'RS-800', 'Ride-on floor scrubber'),
    ('WB-420', 'Northstar Equipment', 'WB-420', 'Walk-behind floor scrubber'),
    ('CE-220', 'Pacific Facility Systems', 'CE-220', 'Carpet extractor')
) as model(model_code, manufacturer, model_name, category)
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
  equipment.id,
  'EQ-' || upper(right(replace(site.id::text, '-', ''), 4)) || '-' || fixture.sequence,
  fixture.status,
  fixture.condition,
  fixture.last_service_date,
  fixture.next_service_date,
  'Synthetic demo equipment record',
  true
from public.sites as site
cross join (
  values
    ('01', 'RS-800', 'available', 'good', '2026-08-28'::date, '2026-11-28'::date),
    ('02', 'WB-420', 'in_use', 'good', '2026-09-07'::date, '2026-12-07'::date),
    ('03', 'CE-220', 'maintenance', 'fair', '2026-07-15'::date, '2026-09-30'::date)
) as fixture(sequence, model_code, status, condition, last_service_date, next_service_date)
join public.equipment_models as equipment
  on equipment.organization_id = site.organization_id
 and equipment.model_code = fixture.model_code
where site.organization_id = '10000000-0000-4000-8000-000000000001'
on conflict (organization_id, asset_code) do nothing;
