begin;

do $$
begin
  if (select count(*) from public.integration_webhook_events
      where dedupe_key = 'event:concurrent-provider-event:demo-nightshift-group') <> 1 then
    raise exception 'concurrent delivery created more than one envelope';
  end if;
  if (select count(*) from public.processing_jobs
      where dedupe_key = 'event:concurrent-provider-event:demo-nightshift-group') <> 1 then
    raise exception 'concurrent delivery created more than one job';
  end if;
end;
$$;

set local role anon;
do $$
begin
  begin
    perform id from public.integration_webhook_events;
    raise exception 'anonymous ingress table read unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.accept_mock_ingress_event(
      'demo-nightshift-group', null, 'denied', '{}'::jsonb, repeat('a', 64)
    );
    raise exception 'anonymous ingestion function unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

set local role authenticated;
do $$
begin
  begin
    perform id from public.external_messages;
    raise exception 'authenticated ingress table read unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

set local role service_role;

delete from public.external_messages;
delete from public.processing_jobs;
delete from public.integration_webhook_events;

do $$
declare
  v_a record;
  v_b record;
begin
  select * into v_a from public.accept_mock_ingress_event(
    'demo-nightshift-group',
    'mixed-batch',
    'event:mixed-batch:demo-nightshift-group',
    '{"schemaVersion":1,"providerEventId":"mixed-batch","accountExternalId":"demo-nightshift-group","messages":[{"externalMessageId":"mixed-a","externalThreadId":"thread-a","senderId":"synthetic-a","occurredAt":"2026-09-16T09:00:00Z","text":"Tenant A synthetic message","mediaRefs":[],"schemaVersion":1}]}'::jsonb,
    repeat('b', 64)
  );
  select * into v_b from public.accept_mock_ingress_event(
    'demo-harbour-group',
    'mixed-batch',
    'event:mixed-batch:demo-harbour-group',
    '{"schemaVersion":1,"providerEventId":"mixed-batch","accountExternalId":"demo-harbour-group","messages":[{"externalMessageId":"mixed-b","externalThreadId":"thread-b","senderId":"synthetic-b","occurredAt":"2026-09-16T09:01:00Z","text":"Tenant B synthetic message","mediaRefs":[],"schemaVersion":1}]}'::jsonb,
    repeat('c', 64)
  );

  if (select organization_id from public.integration_webhook_events where id = v_a.event_id)
      <> '10000000-0000-4000-8000-000000000001'::uuid then
    raise exception 'account A was assigned to the wrong tenant';
  end if;
  if (select organization_id from public.integration_webhook_events where id = v_b.event_id)
      <> '10000000-0000-4000-8000-000000000002'::uuid then
    raise exception 'account B was assigned to the wrong tenant';
  end if;
end;
$$;

delete from public.processing_jobs;
delete from public.integration_webhook_events;

do $$
declare
  v_first record;
  v_duplicate record;
  v_claim record;
  v_complete record;
begin
  select * into v_first from public.accept_mock_ingress_event(
    'demo-nightshift-group',
    'duplicate-provider-event',
    'event:duplicate-provider-event:demo-nightshift-group',
    '{"schemaVersion":1,"providerEventId":"duplicate-provider-event","accountExternalId":"demo-nightshift-group","messages":[{"externalMessageId":"duplicate-message","externalThreadId":"duplicate-thread","senderId":"synthetic-sender","occurredAt":"2026-09-16T10:00:00Z","text":"Synthetic duplicate delivery","mediaRefs":[],"schemaVersion":1}]}'::jsonb,
    repeat('d', 64)
  );
  select * into v_duplicate from public.accept_mock_ingress_event(
    'demo-nightshift-group',
    'duplicate-provider-event',
    'event:duplicate-provider-event:demo-nightshift-group',
    '{"schemaVersion":1,"providerEventId":"duplicate-provider-event","accountExternalId":"demo-nightshift-group","messages":[{"externalMessageId":"duplicate-message","externalThreadId":"duplicate-thread","senderId":"synthetic-sender","occurredAt":"2026-09-16T10:00:00Z","text":"Synthetic duplicate delivery","mediaRefs":[],"schemaVersion":1}]}'::jsonb,
    repeat('d', 64)
  );

  if v_first.duplicate or not v_duplicate.duplicate
      or v_first.event_id <> v_duplicate.event_id
      or v_first.job_id <> v_duplicate.job_id then
    raise exception 'sequential duplicate did not resolve to one envelope and job';
  end if;

  select * into v_claim from public.claim_processing_job('duplicate-worker', 60);
  select * into v_complete from public.complete_processing_job(
    v_claim.job_id,
    'duplicate-worker',
    '[{"externalMessageId":"duplicate-message","externalThreadId":"duplicate-thread","senderId":"synthetic-sender","occurredAt":"2026-09-16T10:00:00Z","text":"Synthetic duplicate delivery","mediaRefs":[],"schemaVersion":1},{"externalMessageId":"duplicate-message","externalThreadId":"duplicate-thread","senderId":"synthetic-sender","occurredAt":"2026-09-16T10:00:00Z","text":"Synthetic duplicate delivery","mediaRefs":[],"schemaVersion":1}]'::jsonb
  );
  if v_complete.inserted_count <> 1 or v_complete.message_count <> 2 then
    raise exception 'message idempotency count was unexpected';
  end if;
  if (select count(*) from public.external_messages where external_message_id = 'duplicate-message') <> 1 then
    raise exception 'duplicate normalization created more than one message';
  end if;
end;
$$;

delete from public.external_messages;
delete from public.processing_jobs;
delete from public.integration_webhook_events;

do $$
declare
  v_accept record;
  v_crashed record;
  v_recovered record;
  v_status public.processing_job_status;
begin
  select * into v_accept from public.accept_mock_ingress_event(
    'demo-harbour-group',
    'restart-provider-event',
    'event:restart-provider-event:demo-harbour-group',
    '{"schemaVersion":1,"providerEventId":"restart-provider-event","accountExternalId":"demo-harbour-group","messages":[{"externalMessageId":"restart-message","externalThreadId":"restart-thread","senderId":"synthetic-sender","occurredAt":"2026-09-16T11:00:00Z","text":"Synthetic restart delivery","mediaRefs":[],"schemaVersion":1}]}'::jsonb,
    repeat('e', 64)
  );
  select * into v_crashed from public.claim_processing_job('crashed-worker', 5);
  update public.processing_jobs set lease_expires_at = clock_timestamp() - interval '1 second'
   where id = v_crashed.job_id;
  select * into v_recovered from public.claim_processing_job('recovery-worker', 60);

  if v_recovered.job_id <> v_crashed.job_id or v_recovered.attempt_count <> 2 then
    raise exception 'expired lease was not reclaimed';
  end if;

  perform * from public.complete_processing_job(
    v_recovered.job_id,
    'recovery-worker',
    '[{"externalMessageId":"restart-message","externalThreadId":"restart-thread","senderId":"synthetic-sender","occurredAt":"2026-09-16T11:00:00Z","text":"Synthetic restart delivery","mediaRefs":[],"schemaVersion":1}]'::jsonb
  );
  if (select count(*) from public.external_messages where external_message_id = 'restart-message') <> 1 then
    raise exception 'recovered job did not create exactly one message';
  end if;

  delete from public.external_messages;
  delete from public.processing_jobs;
  delete from public.integration_webhook_events;

  select * into v_accept from public.accept_mock_ingress_event(
    'demo-nightshift-group', null, 'manual-retry',
    '{"schemaVersion":1,"providerEventId":null,"accountExternalId":"demo-nightshift-group","messages":[{"externalMessageId":"retry-message","externalThreadId":"retry-thread","senderId":"synthetic-sender","occurredAt":"2026-09-16T12:00:00Z","text":"Synthetic retry delivery","mediaRefs":[],"schemaVersion":1}]}'::jsonb,
    repeat('f', 64)
  );
  update public.processing_jobs set max_attempts = 1 where id = v_accept.job_id;
  select * into v_crashed from public.claim_processing_job('failing-worker', 60);
  v_status := public.fail_processing_job(v_crashed.job_id, 'failing-worker', 'synthetic_failure', 30);
  if v_status <> 'failed' or not public.retry_failed_processing_job(v_crashed.job_id) then
    raise exception 'manual failed-job retry did not reset the job';
  end if;
  if (select status from public.processing_jobs where id = v_crashed.job_id) <> 'pending'
      or (select attempt_count from public.processing_jobs where id = v_crashed.job_id) <> 0 then
    raise exception 'manual retry left incorrect job state';
  end if;
end;
$$;

rollback;
