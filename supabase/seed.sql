-- Deterministic synthetic fixtures for local development and policy tests.
-- The reserved .example domain and names containing "Demo" prevent accidental real-person use.

insert into auth.users (id, email, raw_user_meta_data)
values
  ('00000000-0000-4000-8000-000000000001', 'admin-a@cleanops.example', '{}'),
  ('00000000-0000-4000-8000-000000000002', 'supervisor-a@cleanops.example', '{}'),
  ('00000000-0000-4000-8000-000000000003', 'area-a@cleanops.example', '{}'),
  ('00000000-0000-4000-8000-000000000004', 'cleaner-a@cleanops.example', '{}'),
  ('00000000-0000-4000-8000-000000000005', 'viewer-a@cleanops.example', '{}'),
  ('00000000-0000-4000-8000-000000000006', 'admin-b@cleanops.example', '{}');

insert into public.organizations (id, name, slug)
values
  ('10000000-0000-4000-8000-000000000001', 'Demo Nightshift Services', 'demo-nightshift-services'),
  ('10000000-0000-4000-8000-000000000002', 'Demo Harbour Facilities', 'demo-harbour-facilities');

insert into public.memberships (id, organization_id, user_id, role)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'organization_administrator'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', 'site_supervisor'),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000003', 'area_manager'),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000004', 'cleaner'),
  ('20000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000005', 'client_viewer'),
  ('20000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000006', 'organization_administrator');

insert into public.clients (id, organization_id, name)
values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Aurora Casino Demo'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'Copper Peak Resort Demo'),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'Northstar Hall Demo');

insert into public.sites (id, organization_id, client_id, name, city, timezone)
values
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'Aurora Downtown Demo', 'Vancouver', 'America/Vancouver'),
  ('40000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'Copper Peak East Demo', 'Burnaby', 'America/Vancouver'),
  ('40000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'Northstar Harbour Demo', 'Richmond', 'America/Vancouver');

insert into public.equipment_models (
  organization_id, model_code, manufacturer, model_name, category, spec_summary
)
values
  ('10000000-0000-4000-8000-000000000001', 'RS-800', 'Northstar Equipment', 'RS-800', 'Ride-on floor scrubber', 'Synthetic demo reference'),
  ('10000000-0000-4000-8000-000000000001', 'WB-420', 'Northstar Equipment', 'WB-420', 'Walk-behind floor scrubber', 'Synthetic demo reference'),
  ('10000000-0000-4000-8000-000000000001', 'CE-220', 'Pacific Facility Systems', 'CE-220', 'Carpet extractor', 'Synthetic demo reference');

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
where site.organization_id = '10000000-0000-4000-8000-000000000001';

insert into public.member_site_access (id, organization_id, membership_id, site_id, starts_at)
values
  ('41000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001', '2026-01-01T00:00:00Z'),
  ('41000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000002', '2026-01-01T00:00:00Z'),
  ('41000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000001', '2026-01-01T00:00:00Z'),
  ('41000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000001', '2026-01-01T00:00:00Z');

insert into public.site_zones (id, organization_id, site_id, name)
values
  ('50000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'Restroom B Demo'),
  ('50000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'Slot Bank 14 Demo'),
  ('50000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'North Entrance Demo'),
  ('50000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 'East Lobby Demo'),
  ('50000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000003', 'Harbour Entrance Demo');

insert into public.workers (id, organization_id, auth_user_id, display_name)
values
  ('60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000004', 'Worker 182 Demo'),
  ('60000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', null, 'Cleaner Two Demo'),
  ('60000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', null, 'Cleaner Three Demo');

insert into public.worker_site_permissions (
  id, organization_id, worker_id, site_id, state, valid_from
)
values
  ('61000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'active', '2026-01-01T00:00:00Z'),
  ('61000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', 'active', '2026-01-01T00:00:00Z'),
  ('61000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000003', 'active', '2026-01-01T00:00:00Z');

insert into public.service_tasks (id, organization_id, site_id, name, evidence_required)
values
  ('70000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'Restroom B service', true),
  ('70000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'Slot Bank 14 detail clean', true),
  ('70000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'North entrance floor care', false),
  ('70000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 'Clean entrance glass', true),
  ('70000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000003', 'Reset welcome area', false);

insert into public.task_schedules (
  id, organization_id, site_id, task_id, zone_id, recurrence
)
values
  ('80000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '{"kind":"daily","local_time":"02:00"}'),
  ('80000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000004', '{"kind":"night_shift","local_time":"23:15"}'),
  ('80000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000005', '{"kind":"night_shift","local_time":"23:00"}'),
  ('80000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', '{"kind":"daily","local_time":"03:00"}'),
  ('80000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000003', '{"kind":"daily","local_time":"04:00"}');

insert into public.task_runs (
  id, organization_id, site_id, task_id, zone_id, task_schedule_id,
  scheduled_at, due_at, requirements_snapshot, state
)
values
  ('81000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', '2026-09-14T06:00:00Z', '2026-09-14T07:00:00Z', '{"evidence_required":true}', 'ready'),
  ('81000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000004', '80000000-0000-4000-8000-000000000004', '2026-09-14T06:15:00Z', '2026-09-14T06:45:00Z', '{"evidence_required":true,"roles":["before","after"]}', 'ready'),
  ('81000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000005', '80000000-0000-4000-8000-000000000005', '2026-09-14T06:00:00Z', '2026-09-14T06:30:00Z', '{"evidence_required":false}', 'in_progress'),
  ('81000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', '70000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', '80000000-0000-4000-8000-000000000002', '2026-09-16T10:00:00Z', '2026-09-16T11:00:00Z', '{"evidence_required":true}', 'planned'),
  ('81000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000003', '70000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000003', '80000000-0000-4000-8000-000000000003', '2026-09-16T11:00:00Z', '2026-09-16T12:00:00Z', '{"evidence_required":false}', 'planned');

insert into public.shifts (id, organization_id, site_id, starts_at, ends_at)
values
  ('90000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '2026-09-14T05:00:00Z', '2026-09-14T13:00:00Z'),
  ('90000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', '2026-09-16T09:00:00Z', '2026-09-16T17:00:00Z'),
  ('90000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000003', '2026-09-16T10:00:00Z', '2026-09-16T18:00:00Z');

insert into public.shift_assignments (id, organization_id, site_id, shift_id, worker_id)
values
  ('a0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001'),
  ('a0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', '90000000-0000-4000-8000-000000000002', '60000000-0000-4000-8000-000000000002'),
  ('a0000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000003', '90000000-0000-4000-8000-000000000003', '60000000-0000-4000-8000-000000000003');

-- CLEAN-006 staffing fixtures: 40 teammates are present; two eligible
-- candidates remain unassigned until a supervisor explicitly selects them.
insert into public.workers (id, organization_id, display_name)
select ('62000000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001',
  case when sequence > 40 then 'Replacement candidate ' || (sequence - 40) || ' Demo'
       else 'Night team ' || lpad(sequence::text, 2, '0') || ' Demo' end
from generate_series(1, 42) as sequence;

insert into public.worker_site_permissions (
  id, organization_id, worker_id, site_id, state, valid_from
)
select ('63000000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001',
  ('62000000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
  '40000000-0000-4000-8000-000000000001',
  'active', '2026-01-01T00:00:00Z'
from generate_series(1, 42) as sequence;

insert into public.shift_assignments (id, organization_id, site_id, shift_id, worker_id)
select ('a2000000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000001',
  ('62000000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid
from generate_series(1, 40) as sequence;

insert into public.attendance_events (
  id, organization_id, site_id, assignment_id, event_type, occurred_at, recorded_by
)
select ('a3000000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  ('a2000000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
  'check_in', '2026-09-14T05:45:00Z', '00000000-0000-4000-8000-000000000002'
from generate_series(1, 40) as sequence;

insert into public.shift_coverage_requirements (
  id, organization_id, site_id, shift_id, required_positions
)
values (
  'b0000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000001', 42
);

insert into public.task_run_assignments (
  id, organization_id, site_id, task_run_id, worker_id, assigned_by, assigned_at
)
values (
  'b1000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000004',
  '60000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '2026-09-14T05:50:00Z'
);

insert into public.integration_accounts (
  id, organization_id, site_id, provider, external_account_id, display_name
)
values
  ('c0000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 'mock_legacy_whatsapp_group', 'demo-nightshift-group', 'Nightshift Simulated Group'),
  ('c0000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000003', 'mock_legacy_whatsapp_group', 'demo-harbour-group', 'Harbour Simulated Group');

insert into public.external_worker_identities (
  id, organization_id, integration_account_id, external_sender_id,
  worker_id, verified_at, verified_by
)
values (
  'c1000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'worker-182',
  '60000000-0000-4000-8000-000000000001',
  '2026-09-14T05:00:00Z',
  '00000000-0000-4000-8000-000000000001'
);

insert into public.conversation_contexts (
  id, organization_id, integration_account_id, external_thread_id,
  external_sender_id, assignment_id, site_id, zone_id, task_run_id,
  starts_at, expires_at
)
values (
  'c2000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'restroom-b-thread',
  'worker-182',
  'a0000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  '2026-09-14T06:10:00Z',
  '2026-09-14T06:40:00Z'
);

-- CLEAN-007 reporting fixture: an inactive schedule keeps the 150 historical
-- SLA task occurrences out of the live operations board while preserving the
-- exact denominator used by the client report.
insert into public.service_tasks (id, organization_id, site_id, name, evidence_required, active)
values (
  '70000000-0000-4000-8000-000000000007',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'Night shift SLA reporting fixture', false, false
);

insert into public.task_schedules (
  id, organization_id, site_id, task_id, zone_id, recurrence, active
)
values (
  '80000000-0000-4000-8000-000000000007',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000007',
  '50000000-0000-4000-8000-000000000005',
  '{"kind":"synthetic_report_fixture","window":"2026-09-13-night"}', false
);

insert into public.task_runs (
  id, organization_id, site_id, task_id, zone_id, task_schedule_id,
  scheduled_at, due_at, requirements_snapshot, state
)
select
  ('d1000000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000007',
  '50000000-0000-4000-8000-000000000005',
  '80000000-0000-4000-8000-000000000007',
  '2026-09-14T05:00:00Z'::timestamptz + ((sequence - 1) * interval '3 minutes'),
  '2026-09-14T05:02:00Z'::timestamptz + ((sequence - 1) * interval '3 minutes'),
  jsonb_build_object('evidence_required', false, 'sla_fixture', true),
  case when sequence <= 149 then 'approved'::public.task_run_state else 'planned'::public.task_run_state end
from generate_series(1, 150) as sequence;

insert into public.sla_definitions (
  id, organization_id, site_id, name, version, window_start, window_end,
  numerator_rule, denominator_rule, exclusion_rule
)
values (
  'd2000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'Approved-on-time required task completion', 1,
  '2026-09-14T05:00:00Z', '2026-09-14T13:00:00Z',
  'Required task runs approved at or before their frozen due time',
  'Required task runs due inside the reporting window without a contractual exclusion',
  'Only a recorded contractual exclusion removes a required run from the denominator'
);

insert into public.sla_task_results (
  id, organization_id, site_id, sla_definition_id, task_run_id, required, approved_at
)
select
  ('d3000000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'd2000000-0000-4000-8000-000000000001',
  ('d1000000-0000-4000-8000-' || lpad(sequence::text, 12, '0'))::uuid,
  true,
  case when sequence <= 149
    then '2026-09-14T05:01:00Z'::timestamptz + ((sequence - 1) * interval '3 minutes')
    else null
  end
from generate_series(1, 150) as sequence;
-- CLEAN-027 synthetic finance catalogue. Keep this after the organizations seed.
insert into public.vendors (organization_id, vendor_code, name, contact_reference)
values
  ('10000000-0000-4000-8000-000000000001', 'NORTHSTAR', 'Northstar Janitorial Supply', 'demo-order-desk'),
  ('10000000-0000-4000-8000-000000000001', 'NIGHTOWL', 'Night Owl Facility Goods', 'demo-account-204')
on conflict (organization_id, vendor_code) do update
  set name = excluded.name, contact_reference = excluded.contact_reference, active = true;

insert into public.inventory_items (organization_id, sku, name, category, unit_of_measure, reorder_level)
values
  ('10000000-0000-4000-8000-000000000001', 'CHEM-NEUTRAL-5L', 'Neutral floor cleaner', 'Chemicals', 'bottle', 12),
  ('10000000-0000-4000-8000-000000000001', 'PPE-NITRILE-M', 'Nitrile gloves, medium', 'PPE', 'box', 8),
  ('10000000-0000-4000-8000-000000000001', 'LINER-45G', '45-gallon waste liners', 'Consumables', 'case', 6)
on conflict (organization_id, sku) do update
  set name = excluded.name,
      category = excluded.category,
      unit_of_measure = excluded.unit_of_measure,
      reorder_level = excluded.reorder_level,
      active = true;
