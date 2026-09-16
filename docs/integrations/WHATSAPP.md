# WhatsApp vertical slice

## Supported boundary

Official integration target: dedicated WhatsApp Business number using the supported Cloud API.
Workers message that number. Do not assume access to arbitrary existing WhatsApp groups.
Adapters: WhatsAppBusinessAdapter (P4), MockLegacyWhatsAppGroupAdapter (P2), PWAAdapter (P3).
Legacy UI label: “Simulated legacy group ingestion — customer availability unverified”.
Live group support requires a separate capability review and ADR; no scraping dependency.

## Ingress and normalized contract

Planned live route `/api/webhooks/whatsapp`: GET subscription verification, POST signed events.
Separate `/api/demo/messages` route: authorized demo access, unavailable in production.
Both reach the same normalization/services after their respective trust checks.
Normalized fields: source, integration_account_id, external_message_id, external_thread_id,
sender_id, occurred_at, received_at, text?, media_refs[], schema_version. Server derives
tenant from the registered receiving account. Provider delivery status events are not messages.

Implemented simulator payload, schema version 1:

```json
{"schemaVersion":1,"eventId":"synthetic-event-1","entries":[{"accountExternalId":"demo-nightshift-group","messages":[{"externalMessageId":"synthetic-message-1","externalThreadId":"synthetic-thread-1","senderId":"synthetic-sender-1","occurredAt":"2026-09-16T09:00:00Z","text":"Synthetic cleaning update","mediaRefs":[],"schemaVersion":1}]}]}
```

One request may contain at most 20 unique accounts and 100 messages per account. The service
splits it into account-scoped envelopes before persistence. The database resolves each external
account to its tenant and atomically creates its envelope plus pending job. A partial database
failure returns `503`; retrying the same event is safe.

1. Verify signature on exact raw bytes using current Meta requirements; validate body limits.
2. Resolve receiving account; split batched entries/messages without cross-account mixing.
3. Transactionally persist accepted envelope and pending processing job, then acknowledge.
   Persistence failure returns retryable failure, never false success. Duplicate accepted
   envelope is acknowledged without repeating effects.
4. Worker normalizes each message; dedupe by account + provider message ID. Envelope key uses
   provider event identity if available, otherwise stable digest; message dedupe is mandatory
   even if batch boundaries change. Preserve arrival/source times and ordering uncertainty.
5. Map verified sender within account/tenant. Unknown or unverified sender enters review.
6. Resolve authorized shift/site/zone/task per DOMAIN; stale or conflicting context is unresolved.
7. Fetch provider media through authenticated allowlisted endpoints, validate and stage it in
   private Storage, compute hash, finalize evidence record. Reconcile orphan uploads.
8. Link role/pair only to compatible task context; create mock/live suggestion once, then review.

## Pairing and review

Explicit #before/#after or QR context precedes inference. No cross-worker/site pairs by
recency alone. After-first delivery waits for its before image or reviewer; never invent one.
Supervisor can confirm worker/task/zone/role or ignore with a reason. Remapping identity and
replaying unresolved events is audited and idempotent. Original content stays unchanged.
Media missing, expired, oversized or unsafe is visible as an actionable failure.

## Reliability defaults

Non-AI processing: maximum 5 attempts, persisted backoff, then failed queue with manual retry.
AI attempts obey AI.md separately. Worker leases recover from crashes. Stage-level dedupe
prevents manual retry from repeating finalized effects. Database approval uses revision checks.
Mock replay includes duplicate, concurrent, out-of-order, unknown sender, mixed batch, stale
context, bad signature, unavailable media and crash-after-upload cases.

CLEAN-003 implements the envelope, message and job boundaries plus local one-job processing.
It does not fetch media, resolve senders/tasks or expose a live webhook.

## Outbound and go-live

P2 replies are simulated in-app. Live sends require an outbox with recipient/tenant validation,
dedupe and delivery status; verify current Meta consent/template/session rules at P4. A send
receipt is not worker acknowledgement. No safety-critical dependency on WhatsApp delivery.
Before enabling: verify account eligibility, API version, permissions, phone ownership,
webhook subscription/signature/media behavior and real sandbox delivery. Record evidence.

Reference checked 2026-09-14: [Meta-maintained Cloud API collection](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api).
It documents webhook-driven integration; customer account and group capabilities were not verified.
