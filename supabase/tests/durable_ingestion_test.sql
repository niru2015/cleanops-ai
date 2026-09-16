begin;
set local search_path = public, extensions;

select plan(23);

select results_eq(
  $$
    select count(*)
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = any (array[
        'integration_accounts', 'integration_webhook_events',
        'processing_jobs', 'external_messages'
      ])
      and relation.relrowsecurity
  $$,
  array[4::bigint],
  'RLS is enabled on every CLEAN-003 table'
);
select ok(
  not has_table_privilege('anon', 'public.integration_accounts', 'select'),
  'anonymous users have no integration table grant'
);
select ok(
  not has_table_privilege('authenticated', 'public.external_messages', 'select'),
  'authenticated users have no normalized message table grant'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.accept_mock_ingress_event(text,text,text,jsonb,text)',
    'execute'
  ),
  'anonymous users cannot invoke ingestion'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_processing_job(text,integer)',
    'execute'
  ),
  'authenticated users cannot claim jobs'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.accept_mock_ingress_event(text,text,text,jsonb,text)',
    'execute'
  ),
  'service role can invoke ingestion'
);

set local role service_role;

create temporary table accepted_first as
select * from public.accept_mock_ingress_event(
  'demo-nightshift-group', 'pgtap-event', 'event:pgtap-event:demo-nightshift-group',
  '{"schemaVersion":1,"providerEventId":"pgtap-event","accountExternalId":"demo-nightshift-group","messages":[{"externalMessageId":"pgtap-message","externalThreadId":"pgtap-thread","senderId":"synthetic-sender","occurredAt":"2026-09-16T09:00:00Z","text":"Synthetic pgTAP message","mediaRefs":[],"schemaVersion":1}]}'::jsonb,
  repeat('a', 64)
);
create temporary table accepted_duplicate as
select * from public.accept_mock_ingress_event(
  'demo-nightshift-group', 'pgtap-event', 'event:pgtap-event:demo-nightshift-group',
  '{"schemaVersion":1,"providerEventId":"pgtap-event","accountExternalId":"demo-nightshift-group","messages":[{"externalMessageId":"pgtap-message","externalThreadId":"pgtap-thread","senderId":"synthetic-sender","occurredAt":"2026-09-16T09:00:00Z","text":"Synthetic pgTAP message","mediaRefs":[],"schemaVersion":1}]}'::jsonb,
  repeat('a', 64)
);

select is((select duplicate from accepted_first), false, 'first delivery is new');
select is((select duplicate from accepted_duplicate), true, 'second delivery is a duplicate');
select is(
  (select event_id from accepted_first),
  (select event_id from accepted_duplicate),
  'duplicate delivery resolves to the same envelope'
);
select results_eq(
  $$ select count(*) from public.integration_webhook_events where provider_event_id = 'pgtap-event' $$,
  array[1::bigint],
  'duplicate delivery stores one envelope'
);
select results_eq(
  $$ select count(*) from public.processing_jobs where dedupe_key = 'event:pgtap-event:demo-nightshift-group' $$,
  array[1::bigint],
  'duplicate delivery stores one job'
);
select is(
  (select organization_id from public.integration_webhook_events where id = (select event_id from accepted_first)),
  '10000000-0000-4000-8000-000000000001'::uuid,
  'registered account derives tenant A'
);

create temporary table accepted_tenant_b as
select * from public.accept_mock_ingress_event(
  'demo-harbour-group', 'pgtap-mixed', 'event:pgtap-mixed:demo-harbour-group',
  '{"schemaVersion":1,"providerEventId":"pgtap-mixed","accountExternalId":"demo-harbour-group","messages":[{"externalMessageId":"pgtap-b","externalThreadId":"pgtap-thread-b","senderId":"synthetic-b","occurredAt":"2026-09-16T09:01:00Z","text":"Synthetic tenant B message","mediaRefs":[],"schemaVersion":1}]}'::jsonb,
  repeat('b', 64)
);
select is(
  (select organization_id from public.integration_webhook_events where id = (select event_id from accepted_tenant_b)),
  '10000000-0000-4000-8000-000000000002'::uuid,
  'registered account derives tenant B'
);

delete from public.processing_jobs where id = (select job_id from accepted_tenant_b);
delete from public.integration_webhook_events where id = (select event_id from accepted_tenant_b);
create temporary table first_claim as
select * from public.claim_processing_job('pgtap-worker', 60);

select is(
  (select job_id from first_claim),
  (select job_id from accepted_first),
  'worker claims the accepted job'
);
select is((select attempt_count from first_claim), 1::smallint, 'first claim records attempt one');
select results_eq(
  $$
    select inserted_count, message_count
    from public.complete_processing_job(
      (select job_id from first_claim),
      'pgtap-worker',
      '[{"externalMessageId":"pgtap-message","externalThreadId":"pgtap-thread","senderId":"synthetic-sender","occurredAt":"2026-09-16T09:00:00Z","text":"Synthetic pgTAP message","mediaRefs":[],"schemaVersion":1},{"externalMessageId":"pgtap-message","externalThreadId":"pgtap-thread","senderId":"synthetic-sender","occurredAt":"2026-09-16T09:00:00Z","text":"Synthetic pgTAP message","mediaRefs":[],"schemaVersion":1}]'::jsonb
    )
  $$,
  $$ values (1, 2) $$,
  'message effect is idempotent inside a job'
);
select results_eq(
  $$ select count(*) from public.external_messages where external_message_id = 'pgtap-message' $$,
  array[1::bigint],
  'one normalized message is stored'
);
select results_eq(
  $$
    select event.status::text, job.status::text
    from public.integration_webhook_events as event
    join public.processing_jobs as job on job.integration_event_id = event.id
    where event.id = (select event_id from accepted_first)
  $$,
  $$ values ('processed'::text, 'succeeded'::text) $$,
  'completion finalizes the envelope and job'
);

delete from public.external_messages;
delete from public.processing_jobs;
delete from public.integration_webhook_events;

create temporary table restart_accept as
select * from public.accept_mock_ingress_event(
  'demo-harbour-group', 'pgtap-restart', 'event:pgtap-restart:demo-harbour-group',
  '{"schemaVersion":1,"providerEventId":"pgtap-restart","accountExternalId":"demo-harbour-group","messages":[{"externalMessageId":"pgtap-restart-message","externalThreadId":"pgtap-restart-thread","senderId":"synthetic-sender","occurredAt":"2026-09-16T10:00:00Z","text":"Synthetic restart message","mediaRefs":[],"schemaVersion":1}]}'::jsonb,
  repeat('c', 64)
);
create temporary table crashed_claim as
select * from public.claim_processing_job('crashed-worker', 5);
select is((select attempt_count from crashed_claim), 1::smallint, 'crashed worker records attempt one');

update public.processing_jobs
set lease_expires_at = clock_timestamp() - interval '1 second'
where id = (select job_id from crashed_claim);
create temporary table recovered_claim as
select * from public.claim_processing_job('recovery-worker', 60);

select is(
  (select job_id from recovered_claim),
  (select job_id from crashed_claim),
  'expired lease is reclaimed by another worker'
);
select is((select attempt_count from recovered_claim), 2::smallint, 'recovery records attempt two');
select results_eq(
  $$
    select inserted_count
    from public.complete_processing_job(
      (select job_id from recovered_claim),
      'recovery-worker',
      '[{"externalMessageId":"pgtap-restart-message","externalThreadId":"pgtap-restart-thread","senderId":"synthetic-sender","occurredAt":"2026-09-16T10:00:00Z","text":"Synthetic restart message","mediaRefs":[],"schemaVersion":1}]'::jsonb
    )
  $$,
  array[1],
  'recovered job creates one effect'
);
select results_eq(
  $$ select count(*) from public.external_messages where external_message_id = 'pgtap-restart-message' $$,
  array[1::bigint],
  'recovered job stores one normalized message'
);

select * from finish();
rollback;
