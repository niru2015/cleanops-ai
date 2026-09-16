begin;
set local search_path = public, extensions;
select plan(34);

select results_eq(
  $$
    select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = any (array[
      'quality_decisions', 'quality_findings', 'corrective_actions', 'inspections', 'review_audit_events'
    ]) and c.relrowsecurity
  $$,
  array[5::bigint],
  'RLS is enabled on every CLEAN-005 table'
);
select ok(not has_table_privilege('anon', 'public.quality_decisions', 'select'), 'anonymous users cannot read quality decisions');
select ok(has_table_privilege('authenticated', 'public.quality_decisions', 'select'), 'authenticated access is filtered through RLS');
select ok(not has_table_privilege('authenticated', 'public.quality_decisions', 'insert'), 'authenticated users cannot insert AI output directly');
select ok(has_function_privilege('authenticated', 'public.confirm_quality_suggestion(uuid,integer,text,text,uuid)', 'execute'), 'authenticated reviewers may call the guarded confirmation RPC');
select ok(not has_function_privilege('authenticated', 'public.record_quality_decision(uuid,integer,text,text,text,text,quality_result_status,numeric,numeric,jsonb,jsonb,text)', 'execute'), 'only the service role records quality output');

set local role service_role;
insert into public.integration_webhook_events (
  id, organization_id, integration_account_id, provider_event_id,
  dedupe_key, payload, payload_sha256
) values (
  'f0000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'clean-005-pgtap', 'clean-005-pgtap', '{}'::jsonb, repeat('f', 64)
);
insert into public.external_messages (
  id, organization_id, integration_account_id, integration_event_id,
  external_message_id, external_thread_id, sender_id, occurred_at, received_at, text_content
) values
  ('f1000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'pgtap-r1-before', 'restroom-b-thread', 'worker-182', '2026-09-14T06:15:00Z', '2026-09-14T06:15:02Z', '#before'),
  ('f1000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'pgtap-r1-after', 'restroom-b-thread', 'worker-182', '2026-09-14T06:29:00Z', '2026-09-14T06:29:02Z', '#after'),
  ('f1000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'pgtap-r2-before', 'restroom-b-thread', 'worker-182', '2026-09-14T06:33:00Z', '2026-09-14T06:33:02Z', '#before'),
  ('f1000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'pgtap-r2-after', 'restroom-b-thread', 'worker-182', '2026-09-14T06:34:00Z', '2026-09-14T06:34:02Z', '#after');
insert into public.task_evidence (
  id, organization_id, integration_account_id, external_message_id, media_external_id,
  worker_id, site_id, zone_id, task_run_id, role, processing_status, linkage_status,
  storage_path, content_type, byte_size, sha256, captured_at, received_at, submission_revision
) values
  ('f2000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000001', 'pgtap-r1-before', '60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'before', 'ready', 'linked', 'pgtap/r1-before.png', 'image/png', 68, repeat('1',64), '2026-09-14T06:15:00Z', '2026-09-14T06:15:02Z', 1),
  ('f2000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000002', 'pgtap-r1-after', '60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'after', 'ready', 'linked', 'pgtap/r1-after.png', 'image/png', 68, repeat('2',64), '2026-09-14T06:29:00Z', '2026-09-14T06:29:02Z', 1),
  ('f2000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000003', 'pgtap-r2-before', '60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'before', 'ready', 'linked', 'pgtap/r2-before.png', 'image/png', 68, repeat('3',64), '2026-09-14T06:33:00Z', '2026-09-14T06:33:02Z', 2),
  ('f2000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'f1000000-0000-4000-8000-000000000004', 'pgtap-r2-after', '60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'after', 'ready', 'linked', 'pgtap/r2-after.png', 'image/png', 68, repeat('4',64), '2026-09-14T06:34:00Z', '2026-09-14T06:34:02Z', 2);
insert into public.evidence_pairs (
  id, organization_id, site_id, task_run_id, submission_revision, before_evidence_id, after_evidence_id
) values (
  'f3000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 1,
  'f2000000-0000-4000-8000-000000000001', 'f2000000-0000-4000-8000-000000000002'
);
update public.task_runs set state = 'submitted', submission_revision = 1 where id = '81000000-0000-4000-8000-000000000001';

select lives_ok(
  $$ select public.record_quality_decision(
    '81000000-0000-4000-8000-000000000001', 1, 'pgtap-r1-86', 'visual_quality', 'mock-v1',
    'Mock AI', 'assessed', 86, 0.82,
    '[{"criterion_id":"mirror.streak_free","observation":"Possible mirror streak.","severity":"medium","evidence_ids":["f2000000-0000-4000-8000-000000000002"]}]',
    '["Synthetic result"]', null
  ) $$,
  'mock score 86 is recorded'
);
select results_eq($$ select score::integer from public.quality_decisions where request_key = 'pgtap-r1-86' $$, array[86], 'revision one score is 86');
select is((select count(*) from public.quality_findings), 0::bigint, 'mock output creates no finding before confirmation');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
select lives_ok(
  $$ select public.confirm_quality_suggestion(
    (select id from public.quality_decisions where request_key = 'pgtap-r1-86'), 1,
    'mirror.streak_free', 'Re-clean mirror and submit corrected evidence.', null
  ) $$,
  'supervisor confirms the suggested finding'
);
select is((select count(*) from public.quality_findings), 1::bigint, 'confirmation creates one finding');
select results_eq($$ select state::text from public.task_runs where id = '81000000-0000-4000-8000-000000000001' $$, array['correction_required'::text], 'task requires correction');
select results_eq($$ select state::text from public.corrective_actions $$, array['open'::text], 'corrective action is open');
select throws_ok(
  $$ select public.approve_submission(
    '81000000-0000-4000-8000-000000000001', 1,
    (select id from public.quality_decisions where request_key = 'pgtap-r1-86'), null, null
  ) $$,
  '40001', 'stale_review', 'correction-required submission cannot be approved'
);

set local role service_role;
insert into public.evidence_pairs (
  id, organization_id, site_id, task_run_id, submission_revision, before_evidence_id, after_evidence_id
) values (
  'f3000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 2,
  'f2000000-0000-4000-8000-000000000003', 'f2000000-0000-4000-8000-000000000004'
);
update public.task_runs set state = 'submitted', submission_revision = 2 where id = '81000000-0000-4000-8000-000000000001';
select results_eq($$ select state::text from public.corrective_actions $$, array['submitted'::text], 'new revision submits the corrective action');

select lives_ok(
  $$ select public.record_quality_decision(
    '81000000-0000-4000-8000-000000000001', 2, 'pgtap-r2-failure', 'visual_quality', 'mock-v1',
    'Mock AI', 'failed', null, null, '[]', '["Manual review required"]', 'mock_provider_unavailable'
  ) $$,
  'mock failure remains a stored review state'
);
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$ select public.approve_submission(
    '81000000-0000-4000-8000-000000000001', 2,
    (select id from public.quality_decisions where request_key = 'pgtap-r2-failure'), null, null
  ) $$,
  '22023', 'manual_review_reason_required', 'failed mock requires an explicit manual review reason'
);
do $$
begin
  perform public.approve_submission(
    '81000000-0000-4000-8000-000000000001', 2,
    (select id from public.quality_decisions where request_key = 'pgtap-r2-failure'),
    'Supervisor completed manual review.', null
  );
  if (select state from public.task_runs where id = '81000000-0000-4000-8000-000000000001') <> 'approved' then
    raise exception 'manual fallback did not approve';
  end if;
  raise exception using errcode = 'Z0001', message = 'rollback_manual_fallback_probe';
exception when sqlstate 'Z0001' then null;
end;
$$;
select pass('manual review remains usable after mock failure');

set local role service_role;
select lives_ok(
  $$ select public.record_quality_decision(
    '81000000-0000-4000-8000-000000000001', 2, 'pgtap-r2-96', 'visual_quality', 'mock-v1',
    'Mock AI', 'assessed', 96, 0.94, '[]', '["Synthetic result"]', null
  ) $$,
  'corrected mock score is stored'
);
select results_eq($$ select score::integer from public.quality_decisions where request_key = 'pgtap-r2-96' $$, array[96], 'corrected revision score is 96');
select results_eq($$ select state::text from public.task_runs where id = '81000000-0000-4000-8000-000000000001' $$, array['submitted'::text], 'score 96 does not auto-approve');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
select throws_ok(
  $$ select public.approve_submission(
    '81000000-0000-4000-8000-000000000001', 2,
    (select id from public.quality_decisions where request_key = 'pgtap-r2-96'), null, null
  ) $$,
  '42501', 'review_not_authorized', 'cleaner cannot self-approve'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$ select public.approve_submission(
    '81000000-0000-4000-8000-000000000001', 2,
    (select id from public.quality_decisions where request_key = 'pgtap-r1-86'), null, null
  ) $$,
  '40001', 'stale_quality_decision', 'stale AI result cannot approve the newest revision'
);
select lives_ok(
  $$ select public.approve_submission(
    '81000000-0000-4000-8000-000000000001', 2,
    (select id from public.quality_decisions where request_key = 'pgtap-r2-96'), null, null
  ) $$,
  'supervisor approves the current revision'
);
select results_eq($$ select state::text from public.task_runs where id = '81000000-0000-4000-8000-000000000001' $$, array['approved'::text], 'current revision is approved');
select results_eq($$ select state::text from public.corrective_actions $$, array['closed'::text], 'approval closes corrective action');
select ok((select resolved_at is not null from public.quality_findings limit 1), 'approved correction resolves the confirmed finding');
select is((select count(*) from public.inspections), 2::bigint, 'both revision inspections are preserved');
select cmp_ok((select count(*) from public.review_audit_events), '>=', 5::bigint, 'review history is append-only and complete');
select ok(not has_table_privilege('authenticated', 'public.review_audit_events', 'update'), 'review audit events cannot be updated directly');

set local role service_role;
select throws_ok(
  $$ update public.task_runs set state = 'submitted', submission_revision = 3
     where id = '81000000-0000-4000-8000-000000000001' $$,
  '40001', 'approved_submission_is_final', 'approved revision cannot be superseded'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000005', true);
select is((select count(*) from public.quality_decisions), 0::bigint, 'client viewer cannot read internal quality decisions');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000006', true);
select is((select count(*) from public.quality_decisions), 0::bigint, 'tenant B cannot read tenant A quality decisions');
select is((select count(*) from public.review_audit_events), 0::bigint, 'tenant B cannot read tenant A review history');

select * from finish();
rollback;
