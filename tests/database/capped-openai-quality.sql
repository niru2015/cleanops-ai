begin;

insert into public.integration_webhook_events (
  id, organization_id, integration_account_id, provider_event_id, dedupe_key, payload, payload_sha256
) values ('a8000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'clean-008', 'clean-008', '{}'::jsonb, repeat('8', 64));
insert into public.external_messages (
  id, organization_id, integration_account_id, integration_event_id, external_message_id, external_thread_id, sender_id, occurred_at, received_at, text_content
) values
  ('a8100000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000001', 'clean-008-before', 'restroom-b-thread', 'worker-182', '2026-09-14T06:15:00Z', '2026-09-14T06:15:01Z', '#before'),
  ('a8100000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'a8000000-0000-4000-8000-000000000001', 'clean-008-after', 'restroom-b-thread', 'worker-182', '2026-09-14T06:20:00Z', '2026-09-14T06:20:01Z', '#after');
insert into public.task_evidence (
  id, organization_id, integration_account_id, external_message_id, media_external_id, worker_id, site_id, zone_id, task_run_id, role, processing_status, linkage_status, storage_path, content_type, byte_size, sha256, captured_at, received_at, submission_revision
) values
  ('a8200000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'a8100000-0000-4000-8000-000000000001', 'clean-008-before', '60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'before', 'ready', 'linked', 'clean-008/before.png', 'image/png', 1, repeat('1', 64), '2026-09-14T06:15:00Z', '2026-09-14T06:15:01Z', 1),
  ('a8200000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'a8100000-0000-4000-8000-000000000002', 'clean-008-after', '60000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 'after', 'ready', 'linked', 'clean-008/after.png', 'image/png', 1, repeat('2', 64), '2026-09-14T06:20:00Z', '2026-09-14T06:20:01Z', 1);
insert into public.evidence_pairs (id, organization_id, site_id, task_run_id, submission_revision, before_evidence_id, after_evidence_id)
values ('a8300000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '81000000-0000-4000-8000-000000000001', 1, 'a8200000-0000-4000-8000-000000000001', 'a8200000-0000-4000-8000-000000000002');
update public.task_runs set state = 'submitted', submission_revision = 1 where id = '81000000-0000-4000-8000-000000000001';
insert into public.quality_ai_budgets (organization_id, live_enabled, maximum_cents)
values ('10000000-0000-4000-8000-000000000001', true, 4);

set local role service_role;

do $$
declare v_result record;
begin
  select * into v_result from public.reserve_openai_quality_run(
    '81000000-0000-4000-8000-000000000001', 1, repeat('a', 64), 2, 'gpt-5-mini', 'quality.prompt.v1'
  );
  if v_result.outcome <> 'reserved' or v_result.attempt_number <> 1 then
    raise exception 'first attempt was not reserved';
  end if;
  perform public.finish_openai_quality_run(
    v_result.run_id, 'completed',
    '{"status":"insufficient_evidence","score":null,"confidence":null,"findings":[],"limitations":["Synthetic fixture."]}',
    null, 'resp-fixture', 'request-fixture', 12, '{"input_tokens":1,"output_tokens":1}', null
  );
  select * into v_result from public.reserve_openai_quality_run(
    '81000000-0000-4000-8000-000000000001', 1, repeat('a', 64), 2, 'gpt-5-mini', 'quality.prompt.v1'
  );
  if v_result.outcome <> 'cached' then
    raise exception 'same-tenant completed result did not cache';
  end if;
  select * into v_result from public.reserve_openai_quality_run(
    '81000000-0000-4000-8000-000000000001', 1, repeat('b', 64), 2, 'gpt-5-mini', 'quality.prompt.v1'
  );
  if v_result.outcome <> 'reserved' then
    raise exception 'second capped attempt was not reserved';
  end if;
  perform public.finish_openai_quality_run(v_result.run_id, 'failed', null, null, null, null, 12, null, 'provider_error');
  select * into v_result from public.reserve_openai_quality_run(
    '81000000-0000-4000-8000-000000000001', 1, repeat('b', 64), 2, 'gpt-5-mini', 'quality.prompt.v1'
  );
  if v_result.outcome <> 'manual_review' or v_result.reason <> 'budget_exhausted' then
    raise exception 'budget exhaustion did not route to manual review';
  end if;
end;
$$;
do $$ begin
  if (select spent_cents from public.quality_ai_budgets where organization_id = '10000000-0000-4000-8000-000000000001') <> 4 then raise exception 'configured caps were not conservatively charged'; end if;
end $$;
select public.record_quality_ai_evaluation(
  '10000000-0000-4000-8000-000000000001', 'synthetic.clean', 'clean', 'insufficient_evidence',
  true, true, true, (select id from public.quality_ai_runs where cache_key = repeat('a', 64)),
  'gpt-5-mini', 'quality.prompt.v1', 2, 'configured_attempt_cap'
);
do $$ begin
  if (select count(*) from public.quality_ai_evaluations where mismatch and abstained and reviewer_override) <> 1 then
    raise exception 'evaluation provenance was not recorded';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000006', true);
do $$ begin
  if (select count(*) from public.quality_ai_runs) <> 0 then raise exception 'tenant B can read tenant A AI runs'; end if;
end $$;
rollback;
