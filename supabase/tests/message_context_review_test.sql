begin;
set local search_path = public, extensions;
select plan(9);

set local role service_role;

insert into public.integration_webhook_events (
  id, organization_id, integration_account_id, dedupe_key, payload, payload_sha256
) values (
  'f1000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'clean-030-message-review-test',
  '{}'::jsonb,
  repeat('a', 64)
);

insert into public.external_messages (
  id, organization_id, integration_account_id, integration_event_id,
  external_message_id, external_thread_id, sender_id, occurred_at, received_at,
  text_content
) values (
  'f2000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000001',
  'wamid.clean-030-test', 'thread-clean-030', '15559876543', now(), now(),
  'Restroom B is stocked and clean.'
);

-- The sync trigger suggests the receiving account's site (Aurora Downtown, site ...0001).
select isnt(
  (select id from public.external_message_contexts where external_message_id = 'f2000000-0000-4000-8000-000000000001'),
  null,
  'a normalized message gets an automatic context row'
);

-- A second context, reassigned to Copper Peak East (site ...0002), to test an Area Manager who is
-- granted there but not at Aurora Downtown.
insert into public.integration_webhook_events (
  id, organization_id, integration_account_id, dedupe_key, payload, payload_sha256
) values (
  'f1000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'clean-030-message-review-test-2',
  '{}'::jsonb,
  repeat('b', 64)
);
insert into public.external_messages (
  id, organization_id, integration_account_id, integration_event_id,
  external_message_id, external_thread_id, sender_id, occurred_at, received_at,
  text_content
) values (
  'f2000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'f1000000-0000-4000-8000-000000000002',
  'wamid.clean-030-test-2', 'thread-clean-030-2', '15559876543', now(), now(),
  'Copper Peak East glass done.'
);
update public.external_message_contexts
   set site_id = '40000000-0000-4000-8000-000000000002'
 where external_message_id = 'f2000000-0000-4000-8000-000000000002';

-- Director (organization_administrator): sees and can confirm the Aurora Downtown message.
set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000001', true);

select is(
  (select count(*) from public.list_site_external_messages('40000000-0000-4000-8000-000000000001', 25)
    where message_id = 'f2000000-0000-4000-8000-000000000001' and text_content = 'Restroom B is stocked and clean.'),
  1::bigint,
  'Director reads the normalized message text via the RPC'
);

update public.external_message_contexts
   set sender_role = 'supervisor', resolution_status = 'confirmed', resolution_source = 'manual', confidence = 1, resolved_at = now(), updated_at = now()
 where external_message_id = 'f2000000-0000-4000-8000-000000000001';
select is(
  (select resolution_status from public.external_message_contexts where external_message_id = 'f2000000-0000-4000-8000-000000000001'),
  'confirmed',
  'Director confirms message context at any site'
);

-- Area Manager granted only to Copper Peak East (site ...0002): denied at Aurora Downtown, allowed
-- at her own site.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000003', true);

select is(
  (select count(*) from public.external_message_contexts where external_message_id = 'f2000000-0000-4000-8000-000000000002'),
  1::bigint,
  'Area Manager reads the context she manages'
);
select is(
  (select count(*) from public.list_site_external_messages('40000000-0000-4000-8000-000000000002', 25)
    where message_id = 'f2000000-0000-4000-8000-000000000002'),
  1::bigint,
  'Area Manager reads message text for a site she manages'
);
select is(
  (select count(*) from public.external_message_contexts where external_message_id = 'f2000000-0000-4000-8000-000000000001'),
  0::bigint,
  'Area Manager cannot read the Aurora Downtown context (unmanaged site)'
);
select throws_ok(
  $$ select * from public.list_site_external_messages('40000000-0000-4000-8000-000000000001', 25) $$,
  '42501',
  null,
  'Area Manager cannot list messages for a site she does not manage'
);

update public.external_message_contexts
   set sender_role = 'manager', resolution_status = 'confirmed', resolution_source = 'manual', confidence = 1, resolved_at = now(), updated_at = now()
 where external_message_id = 'f2000000-0000-4000-8000-000000000002';
select is(
  (select resolution_status from public.external_message_contexts where external_message_id = 'f2000000-0000-4000-8000-000000000002'),
  'confirmed',
  'Area Manager confirms message context at her own managed site'
);

-- Site Supervisor: no route to /finance, but this only asserts the RLS surface this issue relies
-- on is unchanged — private.can_manage_site also admits a granted supervisor at the app-data layer.
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000002', true);
select is(
  (select count(*) from public.external_message_contexts where external_message_id = 'f2000000-0000-4000-8000-000000000001'),
  1::bigint,
  'Site Supervisor granted to Aurora Downtown can still read that context at the RLS layer (route access is separate)'
);

select * from finish();
rollback;
