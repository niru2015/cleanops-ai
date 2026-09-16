begin;
set local role service_role;

delete from public.external_messages;
delete from public.processing_jobs;
delete from public.integration_webhook_events;

insert into public.integration_webhook_events (
  id, organization_id, integration_account_id, provider_event_id,
  dedupe_key, payload, payload_sha256
) values (
  'd0000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'clean-004-db-test',
  'clean-004-db-test',
  '{}'::jsonb,
  repeat('a', 64)
);

insert into public.task_runs (
  id, organization_id, site_id, task_id, zone_id, task_schedule_id,
  scheduled_at, due_at, requirements_snapshot, state
) values (
  '81000000-0000-4000-8000-000000000020',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000001',
  '2026-09-14T07:00:00Z',
  '2026-09-14T08:00:00Z',
  '{"evidence_required":true}',
  'ready'
);

insert into public.service_tasks (
  id, organization_id, site_id, name, evidence_required
) values (
  '70000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'Restroom B secondary synthetic task',
  true
);
insert into public.task_schedules (
  id, organization_id, site_id, task_id, zone_id, recurrence
) values (
  '80000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000010',
  '50000000-0000-4000-8000-000000000001',
  '{"kind":"once"}'
);
insert into public.task_runs (
  id, organization_id, site_id, task_id, zone_id, task_schedule_id,
  scheduled_at, due_at, requirements_snapshot, state
) values (
  '81000000-0000-4000-8000-000000000010',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000010',
  '50000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000010',
  '2026-09-14T06:00:00Z',
  '2026-09-14T07:00:00Z',
  '{"evidence_required":true}',
  'ready'
);

insert into public.conversation_contexts (
  id, organization_id, integration_account_id, external_thread_id,
  external_sender_id, assignment_id, site_id, zone_id, task_run_id,
  starts_at, expires_at
) values
  (
    'c2000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    'after-first-thread', 'worker-182',
    'a0000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000020',
    '2026-09-14T07:10:00Z', '2026-09-14T07:40:00Z'
  ),
  (
    'c2000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    'stale-thread', 'worker-182',
    'a0000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    '2026-09-14T05:00:00Z', '2026-09-14T05:30:00Z'
  ),
  (
    'c2000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    'conflict-thread', 'worker-182',
    'a0000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    '2026-09-14T06:10:00Z', '2026-09-14T06:40:00Z'
  ),
  (
    'c2000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    'conflict-thread', 'worker-182',
    'a0000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    '2026-09-14T06:11:00Z', '2026-09-14T06:39:00Z'
  ),
  (
    'c2000000-0000-4000-8000-000000000006',
    '10000000-0000-4000-8000-000000000001',
    'c0000000-0000-4000-8000-000000000001',
    'ambiguous-thread', 'worker-182',
    'a0000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    null,
    '2026-09-14T06:10:00Z', '2026-09-14T06:40:00Z'
  );

insert into public.external_messages (
  id, organization_id, integration_account_id, integration_event_id,
  external_message_id, external_thread_id, sender_id, occurred_at,
  received_at, text_content, media_refs
)
values
  ('d1000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'golden-before', 'restroom-b-thread', 'worker-182', '2026-09-14T06:15:00Z', '2026-09-14T06:15:02Z', '#before Restroom B', '[{"externalId":"media-before","contentType":"image/png"}]'),
  ('d1000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'golden-after', 'restroom-b-thread', 'worker-182', '2026-09-14T06:29:00Z', '2026-09-14T06:29:02Z', '#after Restroom B', '[{"externalId":"media-after","contentType":"image/png"}]'),
  ('d1000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'unknown-sender', 'unknown-thread', 'unknown-worker', '2026-09-14T06:20:00Z', '2026-09-14T06:20:02Z', '#before unknown', '[{"externalId":"media-unknown"}]'),
  ('d1000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'after-first', 'after-first-thread', 'worker-182', '2026-09-14T07:15:00Z', '2026-09-14T07:15:02Z', '#after first', '[{"externalId":"media-after-first"}]'),
  ('d1000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'stale-context', 'stale-thread', 'worker-182', '2026-09-14T06:20:00Z', '2026-09-14T06:20:02Z', '#before stale', '[{"externalId":"media-stale"}]'),
  ('d1000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'context-conflict', 'conflict-thread', 'worker-182', '2026-09-14T06:25:00Z', '2026-09-14T06:25:02Z', '#before conflict', '[{"externalId":"media-conflict"}]'),
  ('d1000000-0000-4000-8000-000000000007', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'task-ambiguous', 'ambiguous-thread', 'worker-182', '2026-09-14T06:25:00Z', '2026-09-14T06:25:02Z', '#before ambiguous', '[{"externalId":"media-ambiguous"}]'),
  ('d1000000-0000-4000-8000-000000000008', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001', 'golden-corrected-after', 'restroom-b-thread', 'worker-182', '2026-09-14T06:34:00Z', '2026-09-14T06:34:02Z', '#after corrected Restroom B', '[{"externalId":"media-corrected-after"}]');

do $$
declare
  v_before record;
  v_after record;
  v_result record;
  v_duplicate record;
begin
  select * into v_before from public.begin_evidence_ingestion(
    'demo-nightshift-group', 'golden-before', 'media-before',
    'image/png', 11, repeat('b', 64)
  );
  select * into v_result from public.finalize_evidence_ingestion(
    v_before.evidence_id, repeat('b', 64), 'image/png', 11
  );
  if v_result.linkage_status <> 'linked' or v_result.role <> 'before'
    or v_result.submission_revision <> 1 then
    raise exception 'golden BEFORE did not link to revision one';
  end if;

  select * into v_after from public.begin_evidence_ingestion(
    'demo-nightshift-group', 'golden-after', 'media-after',
    'image/png', 11, repeat('c', 64)
  );
  select * into v_result from public.finalize_evidence_ingestion(
    v_after.evidence_id, repeat('c', 64), 'image/png', 11
  );
  if v_result.linkage_status <> 'linked' or v_result.role <> 'after'
    or v_result.submission_revision <> 1 or v_result.pair_id is null then
    raise exception 'golden AFTER did not complete revision one pair';
  end if;

  select * into v_duplicate from public.begin_evidence_ingestion(
    'demo-nightshift-group', 'golden-after', 'media-after',
    'image/png', 11, repeat('c', 64)
  );
  if not v_duplicate.duplicate or v_duplicate.evidence_id <> v_after.evidence_id then
    raise exception 'media replay was not idempotent';
  end if;
  if (select count(*) from public.evidence_pairs where task_run_id = '81000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'golden evidence did not create exactly one pair';
  end if;
  if (select submission_revision from public.task_runs where id = '81000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'golden task run revision was not advanced';
  end if;
end;
$$;

do $$
declare
  v_stage record;
  v_result record;
begin
  select * into v_stage from public.begin_evidence_ingestion(
    'demo-nightshift-group', 'golden-corrected-after', 'media-corrected-after',
    'image/png', 11, repeat('f', 64)
  );
  select * into v_result from public.finalize_evidence_ingestion(
    v_stage.evidence_id, repeat('f', 64), 'image/png', 11
  );
  if v_result.linkage_status <> 'linked' or v_result.role <> 'after'
    or v_result.submission_revision <> 2 or v_result.pair_id is null then
    raise exception 'corrected AFTER did not create revision two';
  end if;
  if (select submission_revision from public.task_runs
      where id = '81000000-0000-4000-8000-000000000001') <> 2 then
    raise exception 'corrected task run revision was not advanced';
  end if;
end;
$$;

do $$
declare
  v_case record;
  v_result record;
  v_expected text;
  v_message text;
  v_media text;
begin
  for v_message, v_media, v_expected in
    values
      ('unknown-sender', 'media-unknown', 'unknown_sender'),
      ('after-first', 'media-after-first', 'before_missing'),
      ('stale-context', 'media-stale', 'context_stale'),
      ('context-conflict', 'media-conflict', 'context_conflict'),
      ('task-ambiguous', 'media-ambiguous', 'task_ambiguous')
  loop
    select * into v_case from public.begin_evidence_ingestion(
      'demo-nightshift-group', v_message, v_media,
      'image/png', 11, repeat('d', 64)
    );
    select * into v_result from public.finalize_evidence_ingestion(
      v_case.evidence_id, repeat('d', 64), 'image/png', 11
    );
    if v_result.linkage_status <> 'unresolved' or v_result.resolution_code <> v_expected then
      raise exception '% expected %, got %', v_message, v_expected, v_result.resolution_code;
    end if;
  end loop;
end;
$$;

reset role;
insert into storage.objects (bucket_id, name)
select 'operational-evidence', evidence.storage_path
from public.task_evidence as evidence
where evidence.external_message_id = 'd1000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
do $$
begin
  if (select count(*) from public.task_evidence) < 7 then
    raise exception 'site supervisor could not see the unresolved evidence queue';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'operational-evidence') <> 1 then
    raise exception 'site supervisor could not read the authorized Storage row';
  end if;
  if not public.resolve_evidence_manually(
    (select id from public.task_evidence where resolution_code = 'unknown_sender'),
    '60000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000020',
    'before',
    'supervisor_identity_confirmed',
    null
  ) then
    raise exception 'supervisor could not remap unknown evidence';
  end if;
  if not public.ignore_evidence(
    (select id from public.task_evidence where resolution_code = 'before_missing'),
    'supervisor_reviewed'
  ) then
    raise exception 'supervisor could not ignore after-first evidence';
  end if;
  if (select count(*) from public.evidence_audit_events
      where action in ('evidence.manually_resolved', 'evidence.ignored')) <> 2 then
    raise exception 'supervisor decisions were not audited';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000006', true);
do $$
begin
  if (select count(*) from public.task_evidence) <> 0 then
    raise exception 'tenant B could read tenant A evidence';
  end if;
  if (select count(*) from storage.objects where bucket_id = 'operational-evidence') <> 0 then
    raise exception 'tenant B could read tenant A Storage metadata';
  end if;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
do $$
begin
  if (select count(*) from public.task_evidence where linkage_status = 'linked') <> 4 then
    raise exception 'worker could not read own linked evidence';
  end if;
  if (select count(*) from public.task_evidence where worker_id is null) <> 0 then
    raise exception 'worker could read unresolved peer evidence';
  end if;
end;
$$;

rollback;
