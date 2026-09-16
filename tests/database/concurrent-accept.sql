set role service_role;

select *
from public.accept_mock_ingress_event(
  'demo-nightshift-group',
  'concurrent-provider-event',
  'event:concurrent-provider-event:demo-nightshift-group',
  '{"schemaVersion":1,"providerEventId":"concurrent-provider-event","accountExternalId":"demo-nightshift-group","messages":[{"externalMessageId":"concurrent-message","externalThreadId":"concurrent-thread","senderId":"synthetic-sender","occurredAt":"2026-09-16T09:00:00Z","text":"Synthetic concurrent delivery","mediaRefs":[],"schemaVersion":1}]}'::jsonb,
  repeat('a', 64)
);
