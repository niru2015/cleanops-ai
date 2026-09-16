# CLEAN-009 — Official WhatsApp Business messaging

Status: implemented and verified locally. Implementation revision: pending review.

## Delivered

- Official Cloud API subscription verification and exact raw-body signature validation with a
  disabled-by-default live route.
- Receiving-phone tenant mapping, batched normalization and replay-safe durable ingress through the
  same processing and evidence services as the simulator.
- Authenticated, allowlisted media retrieval with visible missing/quarantined evidence failures.
- Tenant/recipient validated outbox, logical reply idempotency, leased retries, failed-queue health
  and separate sent/delivered/read/failed transport history.
- Consent references, live conversation-window checks, template validation, pinned Graph version and
  a read-only account/permission/template readiness command.

## Verification evidence

- Passed locally: strict TypeScript, lint, 35 Vitest tests and stock PostgreSQL migrations plus
  tenant, replay, evidence, outbox, delivery-state, retry-cap and access-isolation checks.
- Production build passed and includes the webhook and internal worker routes.
- No Meta sandbox message, remote Supabase migration or deployment was performed. Live acceptance
  remains gated on a dedicated customer account, approved templates, consent policy and recorded
  sandbox delivery evidence.
