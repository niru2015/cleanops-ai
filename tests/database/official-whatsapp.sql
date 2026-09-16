begin;

set local role service_role;

-- Earlier concurrency checks intentionally leave a pending fixture committed.
-- Isolate this worker test so the global SKIP LOCKED claim selects this event.
delete from public.integration_webhook_events;

insert into public.integration_accounts (
  id, organization_id, site_id, provider, external_account_id, display_name
) values
  ('c9000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   '40000000-0000-4000-8000-000000000001', 'whatsapp_cloud_api', 'phone-tenant-a', 'Official tenant A test'),
  ('c9000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002',
   '40000000-0000-4000-8000-000000000003', 'whatsapp_cloud_api', 'phone-tenant-b', 'Official tenant B test');

insert into public.external_worker_identities (
  id, organization_id, integration_account_id, external_sender_id, worker_id, verified_at
) values
  ('c9100000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001',
   'c9000000-0000-4000-8000-000000000001', '15550001111',
   '60000000-0000-4000-8000-000000000001', '2026-09-16T15:00:00Z'),
  ('c9100000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002',
   'c9000000-0000-4000-8000-000000000002', '15550002222',
   '60000000-0000-4000-8000-000000000003', '2026-09-16T15:00:00Z');

do $$
declare
  v_first record;
  v_duplicate record;
  v_claim record;
  v_complete record;
  v_evidence record;
begin
  select * into v_first from public.accept_whatsapp_ingress_event(
    'phone-tenant-a', 'sha256:official-event:0',
    '{"schemaVersion":1,"providerEventId":null,"accountExternalId":"phone-tenant-a","messages":[{"externalMessageId":"wamid.inbound-1","externalThreadId":"15550001111","senderId":"15550001111","occurredAt":"2026-09-16T16:00:00Z","text":"#before official sandbox fixture","mediaRefs":[{"externalId":"media-official-1","contentType":"image/jpeg"}],"schemaVersion":1}]}'::jsonb,
    repeat('a', 64)
  );
  select * into v_duplicate from public.accept_whatsapp_ingress_event(
    'phone-tenant-a', 'sha256:official-event:0',
    '{"schemaVersion":1,"providerEventId":null,"accountExternalId":"phone-tenant-a","messages":[{"externalMessageId":"wamid.inbound-1","externalThreadId":"15550001111","senderId":"15550001111","occurredAt":"2026-09-16T16:00:00Z","text":"#before official sandbox fixture","mediaRefs":[{"externalId":"media-official-1","contentType":"image/jpeg"}],"schemaVersion":1}]}'::jsonb,
    repeat('a', 64)
  );
  if v_first.duplicate or not v_duplicate.duplicate or v_first.event_id <> v_duplicate.event_id
    or v_first.job_id <> v_duplicate.job_id then
    raise exception 'official webhook replay was not idempotent';
  end if;
  if (select organization_id from public.integration_webhook_events where id = v_first.event_id)
      <> '10000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'receiving phone number resolved to the wrong tenant';
  end if;

  select * into v_claim from public.claim_processing_job('official-test-worker', 60);
  select * into v_complete from public.complete_processing_job(
    v_claim.job_id, 'official-test-worker',
    '[{"externalMessageId":"wamid.inbound-1","externalThreadId":"15550001111","senderId":"15550001111","occurredAt":"2026-09-16T16:00:00Z","text":"#before official sandbox fixture","mediaRefs":[{"externalId":"media-official-1","contentType":"image/jpeg"}],"schemaVersion":1}]'::jsonb
  );
  if v_complete.inserted_count <> 1 then raise exception 'official message did not use shared normalization'; end if;

  select * into v_evidence from public.begin_whatsapp_evidence_ingestion(
    'phone-tenant-a', 'wamid.inbound-1', 'media-official-1', null, null, null
  );
  perform public.mark_evidence_ingestion_problem(v_evidence.evidence_id, 'missing', 'download_failed');
  if (select processing_status from public.task_evidence where id = v_evidence.evidence_id) <> 'missing' then
    raise exception 'recoverable media failure was not visible in evidence review';
  end if;
  perform * from public.retry_whatsapp_evidence_ingestion(v_evidence.evidence_id);
  if (select processing_status from public.task_evidence where id = v_evidence.evidence_id) <> 'staged' then
    raise exception 'visible media failure could not be reset for an authenticated retry';
  end if;
  perform public.mark_evidence_ingestion_problem(v_evidence.evidence_id, 'missing', 'download_failed');

  begin
    perform * from public.accept_whatsapp_ingress_event(
      'unknown-phone', 'unknown-event', '{"schemaVersion":1}'::jsonb, repeat('b', 64)
    );
    raise exception 'unknown receiving account was accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'integration_account_not_found' then raise; end if;
  end;
end;
$$;

do $$
declare
  v_first uuid;
  v_duplicate uuid;
  v_dead uuid;
  v_claim record;
  v_state public.whatsapp_outbox_status;
  v_health record;
  v_iteration integer;
begin
  v_first := public.enqueue_whatsapp_reply(
    '10000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001',
    '15550001111', 'reply:wamid.inbound-1', '{"type":"text","text":"Received"}',
    'worker-opt-in-fixture', now() + interval '1 hour'
  );
  v_duplicate := public.enqueue_whatsapp_reply(
    '10000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001',
    '15550001111', 'reply:wamid.inbound-1', '{"type":"text","text":"Received"}',
    'worker-opt-in-fixture', now() + interval '1 hour'
  );
  if v_first <> v_duplicate or (select count(*) from public.whatsapp_outbox where logical_key = 'reply:wamid.inbound-1') <> 1 then
    raise exception 'logical reply idempotency failed';
  end if;
  begin
    perform public.enqueue_whatsapp_reply(
      '10000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001',
      '15550001111', 'reply:wamid.inbound-1', '{"type":"text","text":"Different reply"}',
      'worker-opt-in-fixture', now() + interval '1 hour'
    );
    raise exception 'conflicting logical reply was silently accepted';
  exception when sqlstate 'P0001' then
    if sqlerrm <> 'outbox_identity_conflict' then raise; end if;
  end;

  begin
    perform public.enqueue_whatsapp_reply(
      '10000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001',
      '15550001111', 'expired-window', '{"type":"text","text":"Late"}',
      'worker-opt-in-fixture', now() - interval '1 second'
    );
    raise exception 'free-form message outside the conversation window was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.enqueue_whatsapp_reply(
      '10000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001',
      '15550002222', 'cross-tenant-recipient', '{"type":"template","templateName":"cleaning_update","languageCode":"en_US"}',
      'worker-opt-in-fixture', null
    );
    raise exception 'cross-tenant recipient was accepted';
  exception when insufficient_privilege then null;
  end;

  select * into v_claim from public.claim_whatsapp_reply('official-outbox-worker', 60);
  perform public.mark_whatsapp_reply_sent(v_claim.outbox_id, 'official-outbox-worker', 'wamid.outbound-1');
  perform public.record_whatsapp_delivery_status(
    'phone-tenant-a', 'wamid.outbound-1', 'delivered', '2026-09-16T16:05:00Z', null
  );
  perform public.record_whatsapp_delivery_status(
    'phone-tenant-a', 'wamid.outbound-1', 'delivered', '2026-09-16T16:05:00Z', null
  );
  if (select status from public.whatsapp_outbox where id = v_first) <> 'delivered'
    or (select count(*) from public.whatsapp_delivery_events where provider_message_id = 'wamid.outbound-1') <> 1 then
    raise exception 'delivery status progression or replay dedupe failed';
  end if;
  perform public.record_whatsapp_delivery_status(
    'phone-tenant-a', 'wamid.outbound-1', 'failed', '2026-09-16T16:06:00Z', '131000'
  );
  if (select status from public.whatsapp_outbox where id = v_first) <> 'delivered' then
    raise exception 'late transport event regressed a delivered reply';
  end if;

  v_dead := public.enqueue_whatsapp_reply(
    '10000000-0000-4000-8000-000000000001', 'c9000000-0000-4000-8000-000000000001',
    '15550001111', 'reply:dead-letter',
    '{"type":"template","templateName":"cleaning_update","languageCode":"en_US"}',
    'worker-opt-in-fixture', null
  );
  for v_iteration in 1..5 loop
    select * into v_claim from public.claim_whatsapp_reply('official-outbox-worker', 60);
    v_state := public.fail_whatsapp_reply(v_claim.outbox_id, 'official-outbox-worker', 'provider_unavailable', 0);
  end loop;
  if v_state <> 'failed' or (select status from public.whatsapp_outbox where id = v_dead) <> 'failed' then
    raise exception 'outbox did not enter failed queue after capped retries';
  end if;
  select * into v_health from public.get_whatsapp_queue_health();
  if v_health.failed_count <> 1 then raise exception 'failed queue was not visible to monitoring'; end if;
end;
$$;

reset role;
set local role authenticated;
do $$
begin
  begin
    perform id from public.whatsapp_outbox;
    raise exception 'authenticated outbox read unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.get_whatsapp_queue_health();
    raise exception 'authenticated queue health read unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;

rollback;
