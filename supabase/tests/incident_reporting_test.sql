begin;
set local search_path = public, extensions;
select plan(25);

select results_eq(
  $$ select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = any(array[
       'incidents','incident_statements','incident_evidence','incident_actions','incident_timeline_events',
       'equipment_reports','sla_definitions','sla_task_results','client_service_reports',
       'client_report_releases','reporting_audit_events'
     ]) and c.relrowsecurity $$,
  array[11::bigint], 'RLS is enabled on all CLEAN-007 tables'
);
select ok(not has_table_privilege('anon', 'public.client_service_reports', 'select'), 'anonymous cannot read reports');
select ok(not has_table_privilege('authenticated', 'public.incidents', 'insert'), 'authenticated users cannot bypass incident RPC');
select ok(not has_table_privilege('authenticated', 'public.client_service_reports', 'update'), 'authenticated users cannot release reports directly');
select is((select count(*) from public.sla_task_results), 150::bigint, 'fixture contains 150 SLA task results');

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select lives_ok($$ select public.record_incident(
  '40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000004',
  '60000000-0000-4000-8000-000000000001','2026-09-14T07:17:00Z','2026-09-14T07:19:00Z',
  'A scratch was reported near Slot Bank 14. Cause not determined.','Worker 182 reported a scratch.',
  'Supervisor recorded the location.','pgtap-incident','00000000-0000-4000-8000-000000000002') $$,
  'supervisor can record structured incident'
);
select lives_ok($$ select public.record_equipment_report(
  '40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000004',
  '60000000-0000-4000-8000-000000000001','2026-09-14T09:05:00Z','Walk-behind scrubber 04',
  'Operator reported scrubber pulling right.','pgtap-equipment','00000000-0000-4000-8000-000000000002') $$,
  'supervisor can record equipment intake'
);
select is((select cause_status from public.incidents where idempotency_key = 'pgtap-incident'), 'undetermined', 'incident stores no cause');
select is((select state::text from public.equipment_reports where idempotency_key = 'pgtap-equipment'), 'reported', 'equipment remains reported');
select is((select maintenance_reference from public.equipment_reports where idempotency_key = 'pgtap-equipment'), null, 'equipment has no fabricated maintenance reference');
select lives_ok($$ select public.correct_incident_summary(
  (select id from public.incidents where idempotency_key = 'pgtap-incident'),
  'A scratch was reported beside Slot Bank 14. Cause remains undetermined.',
  'Clarified location.','00000000-0000-4000-8000-000000000002') $$,
  'supervisor correction is accepted'
);
select is((select count(*) from public.reporting_audit_events where action = 'incident.corrected'), 1::bigint, 'correction is audited');
select lives_ok($$ select public.prepare_client_service_report(
  'd2000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002') $$,
  'supervisor can prepare report'
);
select results_eq(
  $$ select approved_on_time_runs, due_required_runs, completion_rate from public.client_service_reports $$,
  $$ values (149, 150, 99.3::numeric) $$,
  'report computes 149 of 150 as 99.3 percent once'
);
select results_eq(
  $$ select excluded_runs, safety_status from public.client_service_reports $$,
  $$ values (0, 'not_applicable'::text) $$,
  'report exposes exclusions and safety N/A'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000005', true);
select is((select count(*) from public.client_service_reports), 0::bigint, 'client cannot read draft report');

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.sub', '', true);
select lives_ok($$ select public.release_client_service_report(
  (select id from public.client_service_reports),'Reviewed for release.',
  '00000000-0000-4000-8000-000000000002') $$,
  'supervisor can explicitly release report'
);
select is((select count(*) from public.reporting_audit_events where action = 'report.released'), 1::bigint, 'release is audited');
select set_config('cleanops.report_id', (select id::text from public.client_service_reports), true);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000005', true);
select is((select count(*) from public.client_service_reports), 1::bigint, 'site-authorized client sees released report');
select is((select count(*) from public.incident_statements), 0::bigint, 'client cannot read attributed statements');
select results_eq(
  $$ select (select count(*) from public.incidents), (select count(*) from public.equipment_reports),
            (select count(*) from public.reporting_audit_events) $$,
  $$ values (0::bigint, 0::bigint, 0::bigint) $$,
  'client cannot read private incident, equipment or audit originals'
);
select results_eq(
  $$ select approved_on_time_runs, due_required_runs, completion_rate
     from public.get_released_client_service_report((select id from public.client_service_reports), null) $$,
  $$ values (149, 150, 99.3::numeric) $$,
  'client export returns released redacted metric only'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
select is((select count(*) from public.client_service_reports), 0::bigint, 'same-tenant wrong-site member cannot read report');
select throws_ok(
  $$ select * from public.get_released_client_service_report(current_setting('cleanops.report_id')::uuid, null) $$,
  '42501', 'client_report_not_authorized', 'wrong-site member cannot export guessed released report'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000006', true);
select results_eq(
  $$ select (select count(*) from public.client_service_reports), (select count(*) from public.incidents) $$,
  $$ values (0::bigint, 0::bigint) $$,
  'tenant B cannot read tenant A reporting records'
);

select * from finish();
rollback;
