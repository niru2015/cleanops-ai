begin;
set local role service_role;

insert into public.integration_webhook_events (
  id, organization_id, integration_account_id, provider_event_id,
  dedupe_key, payload, payload_sha256
) values (
  'e0000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'clean-005-db-test', 'clean-005-db-test', '{}'::jsonb, repeat('e', 64)
);

insert into public.external_messages (
  id, organization_id, integration_account_id, integration_event_id,
  external_message_id, external_thread_id, sender_id, occurred_at,
  received_at, text_content, media_refs
) values
  ('e1000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'review-r1-before', 'restroom-b-thread', 'worker-182', '2026-09-14T06:15:00Z', '2026-09-14T06:15:02Z', '#before Restroom B', '[]'),
  ('e1000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'review-r1-after', 'restroom-b-thread', 'worker-182', '2026-09-14T06:29:00Z', '2026-09-14T06:29:02Z', '#after Restroom B', '[]'),
  ('e1000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'review-r2-before', 'restroom-b-thread', 'worker-182', '2026-09-14T06:33:00Z', '2026-09-14T06:33:02Z', '#before Restroom B', '[]'),
  ('e1000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'review-r2-after', 'restroom-b-thread', 'worker-182', '2026-09-14T06:34:00Z', '2026-09-14T06:34:02Z', '#after Restroom B', '[]');

insert into public.task_evidence (
  id, organization_id, integration_account_id, external_message_id, media_external_id,
  worker_id, site_id, zone_id, task_run_id, role, processing_status, linkage_status,
  storage_path, content_type, byte_size, sha256, captured_at, received_at, submission_revision
) values
  ('e2000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001', 'review-media-r1-before', '60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'before', 'ready', 'linked', 'review/r1-before.png', 'image/png', 68, repeat('1', 64), '2026-09-14T06:15:00Z', '2026-09-14T06:15:02Z', 1),
  ('e2000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000002', 'review-media-r1-after', '60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'after', 'ready', 'linked', 'review/r1-after.png', 'image/png', 68, repeat('2', 64), '2026-09-14T06:29:00Z', '2026-09-14T06:29:02Z', 1),
  ('e2000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000003', 'review-media-r2-before', '60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'before', 'ready', 'linked', 'review/r2-before.png', 'image/png', 68, repeat('3', 64), '2026-09-14T06:33:00Z', '2026-09-14T06:33:02Z', 2),
  ('e2000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000004', 'review-media-r2-after', '60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'after', 'ready', 'linked', 'review/r2-after.png', 'image/png', 68, repeat('4', 64), '2026-09-14T06:34:00Z', '2026-09-14T06:34:02Z', 2);

insert into public.evidence_pairs (
  id, organization_id, site_id, task_run_id, submission_revision,
  before_evidence_id, after_evidence_id
) values (
  'e3000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001', 1,
  'e2000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000002'
);
update public.task_runs set state = 'submitted', submission_revision = 1
where id = '81000000-0000-4000-8000-000000000001';

select public.record_quality_decision(
  '81000000-0000-4000-8000-000000000001', 1, 'db-r1-score-86',
  'visual_quality', 'mock-v1', 'Mock AI', 'assessed', 86, 0.82,
  '[{"criterion_id":"mirror.streak_free","observation":"Possible mirror streak.","severity":"medium","evidence_ids":["e2000000-0000-4000-8000-000000000002"]}]',
  '["Synthetic result"]', null
) as decision_id \gset

do $$
begin
  if (select count(*) from public.quality_findings) <> 0 then
    raise exception 'mock suggestion created a finding before supervisor confirmation';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
select public.confirm_quality_suggestion(
  :'decision_id', 1, 'mirror.streak_free',
  'Re-clean the mirror and submit corrected evidence.', null
);

do $$
begin
  if (select state from public.task_runs where id = '81000000-0000-4000-8000-000000000001') <> 'correction_required' then
    raise exception 'confirmed finding did not require correction';
  end if;
  if (select count(*) from public.quality_findings) <> 1
    or (select count(*) from public.corrective_actions where state = 'open') <> 1 then
    raise exception 'confirmed finding/action records missing';
  end if;
  begin
    perform public.approve_submission(
      '81000000-0000-4000-8000-000000000001', 1,
      (select id from public.quality_decisions where request_key = 'db-r1-score-86'),
      null, null
    );
    raise exception 'correction-required revision was approved';
  exception when serialization_failure then null;
  end;
end;
$$;

set local role service_role;
insert into public.evidence_pairs (
  id, organization_id, site_id, task_run_id, submission_revision,
  before_evidence_id, after_evidence_id
) values (
  'e3000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001', 2,
  'e2000000-0000-4000-8000-000000000003',
  'e2000000-0000-4000-8000-000000000004'
);
update public.task_runs set state = 'submitted', submission_revision = 2
where id = '81000000-0000-4000-8000-000000000001';

savepoint manual_failure_path;
select public.record_quality_decision(
  '81000000-0000-4000-8000-000000000001', 2, 'db-r2-failure',
  'visual_quality', 'mock-v1', 'Mock AI', 'failed', null, null,
  '[]', '["Manual review required"]', 'mock_provider_unavailable'
) as failure_decision_id \gset
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
select public.approve_submission(
  '81000000-0000-4000-8000-000000000001', 2, :'failure_decision_id',
  'Supervisor completed manual review.', null
);
do $$
begin
  if (select state from public.task_runs where id = '81000000-0000-4000-8000-000000000001') <> 'approved' then
    raise exception 'manual fallback did not remain usable';
  end if;
end;
$$;
rollback to savepoint manual_failure_path;

set local role service_role;
select public.record_quality_decision(
  '81000000-0000-4000-8000-000000000001', 2, 'db-r2-score-96',
  'visual_quality', 'mock-v1', 'Mock AI', 'assessed', 96, 0.94,
  '[]', '["Synthetic result"]', null
) as corrected_decision_id \gset

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
do $$
begin
  begin
    perform public.approve_submission(
      '81000000-0000-4000-8000-000000000001', 2,
      (select id from public.quality_decisions where request_key = 'db-r2-score-96'),
      null, null
    );
    raise exception 'cleaner self-approved';
  exception when insufficient_privilege then null;
  end;
end;
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
do $$
begin
  begin
    perform public.approve_submission(
      '81000000-0000-4000-8000-000000000001', 2,
      (select id from public.quality_decisions where request_key = 'db-r1-score-86'),
      null, null
    );
    raise exception 'stale quality result approved latest revision';
  exception when serialization_failure then null;
  end;
end;
$$;
set local role service_role;
update public.task_evidence set submitted_by_user_id = '00000000-0000-4000-8000-000000000002'
where id = 'e2000000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
do $$
begin
  begin
    perform public.approve_submission(
      '81000000-0000-4000-8000-000000000001', 2,
      (select id from public.quality_decisions where request_key = 'db-r2-score-96'),
      null, null
    );
    raise exception 'evidence submitter approved own correction';
  exception when insufficient_privilege then null;
  end;
end;
$$;
set local role service_role;
update public.task_evidence set submitted_by_user_id = null
where id = 'e2000000-0000-4000-8000-000000000004';
set local role authenticated;
select public.approve_submission(
  '81000000-0000-4000-8000-000000000001', 2, :'corrected_decision_id', null, null
);

do $$
begin
  if (select state from public.task_runs where id = '81000000-0000-4000-8000-000000000001') <> 'approved' then
    raise exception 'latest corrected revision was not approved';
  end if;
  if (select state from public.corrective_actions limit 1) <> 'closed' then
    raise exception 'corrective action was not closed by latest approval';
  end if;
  if (select count(*) from public.inspections) <> 2 then
    raise exception 'revision inspection history was not preserved';
  end if;
  if (select count(*) from public.review_audit_events) < 5 then
    raise exception 'review audit history is incomplete';
  end if;
end;
$$;

set local role service_role;
do $$
begin
  begin
    update public.task_runs set state = 'submitted', submission_revision = 3
    where id = '81000000-0000-4000-8000-000000000001';
    raise exception 'approved submission accepted a newer revision';
  exception when serialization_failure then null;
  end;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000006', true);
do $$
begin
  if (select count(*) from public.quality_decisions) <> 0
    or (select count(*) from public.review_audit_events) <> 0 then
    raise exception 'tenant B could read tenant A quality review records';
  end if;
end;
$$;

rollback;
