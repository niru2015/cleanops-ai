begin;
set local search_path = public, extensions;

select plan(32);

select results_eq(
  $$
    select count(*)
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = any (array[
        'external_worker_identities', 'conversation_contexts', 'task_evidence',
        'evidence_pairs', 'evidence_audit_events'
      ])
      and relation.relrowsecurity
  $$,
  array[5::bigint],
  'RLS is enabled on every CLEAN-004 table'
);
select ok(
  not has_table_privilege('anon', 'public.task_evidence', 'select'),
  'anonymous users have no evidence table grant'
);
select ok(
  has_table_privilege('authenticated', 'public.task_evidence', 'select'),
  'authenticated users can query evidence through RLS'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.begin_evidence_ingestion(text,text,text,text,bigint,text)',
    'execute'
  ),
  'anonymous users cannot stage evidence'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.begin_evidence_ingestion(text,text,text,text,bigint,text)',
    'execute'
  ),
  'authenticated users cannot stage provider evidence'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.begin_evidence_ingestion(text,text,text,text,bigint,text)',
    'execute'
  ),
  'service role can stage provider evidence'
);

set local role service_role;

insert into public.integration_webhook_events (
  id, organization_id, integration_account_id, provider_event_id,
  dedupe_key, payload, payload_sha256
) values (
  'e0000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'clean-004-pgtap', 'clean-004-pgtap', '{}'::jsonb, repeat('e', 64)
);
insert into public.external_messages (
  id, organization_id, integration_account_id, integration_event_id,
  external_message_id, external_thread_id, sender_id, occurred_at,
  received_at, text_content, media_refs
)
values
  ('e1000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'pgtap-before', 'restroom-b-thread', 'worker-182', '2026-09-14T06:15:00Z', '2026-09-14T06:15:02Z', '#before Restroom B', '[{"externalId":"pgtap-media-before"}]'),
  ('e1000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'pgtap-after', 'restroom-b-thread', 'worker-182', '2026-09-14T06:29:00Z', '2026-09-14T06:29:02Z', '#after Restroom B', '[{"externalId":"pgtap-media-after"}]'),
  ('e1000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'pgtap-unknown', 'unknown-thread', 'unknown-sender', '2026-09-14T06:20:00Z', '2026-09-14T06:20:02Z', '#before unknown', '[{"externalId":"pgtap-media-unknown"}]'),
  ('e1000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000001', 'pgtap-corrected', 'restroom-b-thread', 'worker-182', '2026-09-14T06:34:00Z', '2026-09-14T06:34:02Z', '#after corrected', '[{"externalId":"pgtap-media-corrected"}]');

create temporary table pgtap_before_stage as
select * from public.begin_evidence_ingestion(
  'demo-nightshift-group', 'pgtap-before', 'pgtap-media-before',
  'image/png', 11, repeat('a', 64)
);
select is((select duplicate from pgtap_before_stage), false, 'first BEFORE media is new');

create temporary table pgtap_before_result as
select * from public.finalize_evidence_ingestion(
  (select evidence_id from pgtap_before_stage), repeat('a', 64), 'image/png', 11
);
select is(
  (select linkage_status::text from pgtap_before_result),
  'linked',
  '23:15 BEFORE resolves automatically'
);
select is((select role::text from pgtap_before_result), 'before', '23:15 media is BEFORE');
select is(
  (select submission_revision from pgtap_before_result),
  1,
  'BEFORE opens revision one'
);

create temporary table pgtap_after_stage as
select * from public.begin_evidence_ingestion(
  'demo-nightshift-group', 'pgtap-after', 'pgtap-media-after',
  'image/png', 11, repeat('b', 64)
);
select is((select duplicate from pgtap_after_stage), false, 'first AFTER media is new');

create temporary table pgtap_after_result as
select * from public.finalize_evidence_ingestion(
  (select evidence_id from pgtap_after_stage), repeat('b', 64), 'image/png', 11
);
select is(
  (select linkage_status::text from pgtap_after_result),
  'linked',
  '23:29 AFTER resolves automatically'
);
select ok((select pair_id is not null from pgtap_after_result), 'AFTER creates a pair');
select is(
  (select submission_revision from public.task_runs where id = '81000000-0000-4000-8000-000000000001'),
  1,
  'completed pair advances the task submission revision'
);
select results_eq(
  $$ select count(*) from public.evidence_pairs where task_run_id = '81000000-0000-4000-8000-000000000001' $$,
  array[1::bigint],
  'golden replay creates one pair'
);

create temporary table pgtap_after_replay as
select * from public.begin_evidence_ingestion(
  'demo-nightshift-group', 'pgtap-after', 'pgtap-media-after',
  'image/png', 11, repeat('b', 64)
);
select is((select duplicate from pgtap_after_replay), true, 'AFTER replay is a duplicate');
select is(
  (select evidence_id from pgtap_after_replay),
  (select evidence_id from pgtap_after_stage),
  'AFTER replay resolves to the same evidence row'
);
select results_eq(
  $$ select count(*) from public.task_evidence $$,
  array[2::bigint],
  'golden duplicate replay stores two total evidence records'
);

create temporary table pgtap_corrected_stage as
select * from public.begin_evidence_ingestion(
  'demo-nightshift-group', 'pgtap-corrected', 'pgtap-media-corrected',
  'image/png', 11, repeat('d', 64)
);
create temporary table pgtap_corrected_result as
select * from public.finalize_evidence_ingestion(
  (select evidence_id from pgtap_corrected_stage), repeat('d', 64), 'image/png', 11
);
select is(
  (select linkage_status::text from pgtap_corrected_result),
  'linked',
  'corrected AFTER links successfully'
);
select is(
  (select submission_revision from pgtap_corrected_result),
  2,
  'corrected AFTER creates revision two'
);
select ok((select pair_id is not null from pgtap_corrected_result), 'revision two has a pair');
select is(
  (select submission_revision from public.task_runs where id = '81000000-0000-4000-8000-000000000001'),
  2,
  'corrected pair advances the stored task revision'
);

create temporary table pgtap_unknown_stage as
select * from public.begin_evidence_ingestion(
  'demo-nightshift-group', 'pgtap-unknown', 'pgtap-media-unknown',
  'image/png', 11, repeat('c', 64)
);
create temporary table pgtap_unknown_result as
select * from public.finalize_evidence_ingestion(
  (select evidence_id from pgtap_unknown_stage), repeat('c', 64), 'image/png', 11
);
grant select on pgtap_unknown_result to authenticated;
select is(
  (select linkage_status::text from pgtap_unknown_result),
  'unresolved',
  'unknown sender remains unresolved'
);
select is(
  (select resolution_code from pgtap_unknown_result),
  'unknown_sender',
  'unknown sender has an actionable reason'
);

reset role;
insert into storage.objects (bucket_id, name)
select 'operational-evidence', evidence.storage_path
from public.task_evidence as evidence
where evidence.id = (select evidence_id from pgtap_before_stage);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
select ok(
  (select count(*) from public.task_evidence) = 4,
  'site supervisor sees linked and unresolved site evidence'
);
select results_eq(
  $$ select count(*) from storage.objects where bucket_id = 'operational-evidence' $$,
  array[1::bigint],
  'site supervisor can read authorized private Storage metadata'
);
select ok(
  public.resolve_evidence_manually(
    (select evidence_id from pgtap_unknown_result),
    '60000000-0000-4000-8000-000000000001',
    '81000000-0000-4000-8000-000000000001',
    'before',
    'supervisor_identity_confirmed',
    null
  ),
  'site supervisor can remap unresolved evidence'
);
select results_eq(
  $$ select count(*) from public.evidence_audit_events where action = 'evidence.manually_resolved' $$,
  array[1::bigint],
  'supervisor remapping creates one audit event'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000006', true);
select results_eq(
  $$ select count(*) from public.task_evidence $$,
  array[0::bigint],
  'tenant B cannot read tenant A evidence'
);
select results_eq(
  $$ select count(*) from storage.objects where bucket_id = 'operational-evidence' $$,
  array[0::bigint],
  'tenant B cannot read tenant A private Storage metadata'
);

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000004', true);
select results_eq(
  $$ select count(*) from public.task_evidence where linkage_status = 'linked' $$,
  array[4::bigint],
  'worker sees own linked evidence'
);
select results_eq(
  $$ select count(*) from public.task_evidence where worker_id is null $$,
  array[0::bigint],
  'worker cannot read unresolved evidence without ownership'
);

select * from finish();
rollback;
