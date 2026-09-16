begin;
set local search_path = public, extensions;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select public.record_incident(
  '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000004',
  '60000000-0000-4000-8000-000000000001', '2026-09-14T07:17:00Z', '2026-09-14T07:19:00Z',
  'A scratch was reported near Slot Bank 14. Cause not determined.',
  'Worker 182 reported: I noticed a scratch beside Slot Bank 14.',
  'Supervisor recorded the location and preserved the report for follow-up.',
  'test-golden-0017', '00000000-0000-4000-8000-000000000002'
);
select public.correct_incident_summary(
  (select id from public.incidents where idempotency_key = 'test-golden-0017'),
  'A scratch was reported beside Slot Bank 14 at 00:17. Cause remains undetermined.',
  'Clarified location without assigning cause.', '00000000-0000-4000-8000-000000000002'
);
select public.record_equipment_report(
  '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000004',
  '60000000-0000-4000-8000-000000000001', '2026-09-14T09:05:00Z',
  'Walk-behind scrubber 04', 'Operator reported that the scrubber was pulling to the right.',
  'test-golden-0205', '00000000-0000-4000-8000-000000000002'
);
select public.prepare_client_service_report(
  'd2000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002'
);
select set_config('cleanops.report_id', (select id::text from public.client_service_reports), true);

do $$
declare report public.client_service_reports%rowtype;
begin
  select * into strict report from public.client_service_reports;
  if report.approved_on_time_runs <> 149 or report.due_required_runs <> 150
    or report.completion_rate <> 99.3 or report.excluded_runs <> 0 then
    raise exception 'SLA metric was not computed as 149/150 = 99.3 with zero exclusions';
  end if;
  if report.incident_count <> 1 or report.equipment_report_count <> 1 then
    raise exception 'report counts did not come from the golden records';
  end if;
  if report.safety_status <> 'not_applicable' then raise exception 'safety status must be N/A'; end if;
  if (select state from public.equipment_reports where idempotency_key = 'test-golden-0205') <> 'reported'
    or (select maintenance_reference from public.equipment_reports where idempotency_key = 'test-golden-0205') is not null then
    raise exception 'equipment report fabricated maintenance progress';
  end if;
  if (select cause_status from public.incidents where idempotency_key = 'test-golden-0017') <> 'undetermined' then
    raise exception 'incident assigned cause';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000005', true);
do $$
begin
  if (select count(*) from public.client_service_reports) <> 0 then raise exception 'client saw draft report'; end if;
  if (select count(*) from public.incidents) <> 0 or (select count(*) from public.incident_statements) <> 0
    or (select count(*) from public.equipment_reports) <> 0 or (select count(*) from public.reporting_audit_events) <> 0 then
    raise exception 'client saw private operational records';
  end if;
  begin
    perform * from public.get_released_client_service_report(
      current_setting('cleanops.report_id')::uuid, null
    );
    raise exception 'draft export unexpectedly succeeded';
  exception when sqlstate 'P0002' then null;
  end;
end;
$$;

set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.sub', '', true);
select public.release_client_service_report(
  (select id from public.client_service_reports),
  'Supervisor reviewed the redacted fixture.', '00000000-0000-4000-8000-000000000002'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000005', true);
do $$
begin
  if (select count(*) from public.client_service_reports) <> 1 then raise exception 'authorized client cannot see released report'; end if;
  if (select count(*) from public.get_released_client_service_report(
    (select id from public.client_service_reports), null
  ) where completion_rate = 99.3 and due_required_runs = 150 and approved_on_time_runs = 149) <> 1 then
    raise exception 'released safe export was incomplete';
  end if;
  if (select count(*) from public.incidents) <> 0 or (select count(*) from public.incident_statements) <> 0
    or (select count(*) from public.equipment_reports) <> 0 or (select count(*) from public.reporting_audit_events) <> 0 then
    raise exception 'released report exposed private originals';
  end if;
end;
$$;

set local role service_role;
update public.memberships set role = 'client_viewer'
where id = '20000000-0000-4000-8000-000000000003';

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);
do $$
begin
  if (select count(*) from public.client_service_reports) <> 0 then raise exception 'wrong-site client saw report'; end if;
  begin
    perform * from public.get_released_client_service_report(
      current_setting('cleanops.report_id')::uuid, null
    );
    raise exception 'wrong-site export unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000006', true);
do $$
begin
  if (select count(*) from public.client_service_reports) <> 0
    or (select count(*) from public.sla_definitions) <> 0
    or (select count(*) from public.incidents) <> 0 then
    raise exception 'tenant B read tenant A reporting records';
  end if;
end;
$$;

set local role service_role;
do $$
begin
  if (select count(*) from public.reporting_audit_events where action = 'incident.corrected') <> 1 then
    raise exception 'incident correction was not audited';
  end if;
  if (select count(*) from public.reporting_audit_events where action = 'report.released') <> 1 then
    raise exception 'report release was not audited';
  end if;
end;
$$;
rollback;
