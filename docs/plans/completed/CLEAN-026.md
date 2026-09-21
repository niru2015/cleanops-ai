# CLEAN-026 — Persist Make WhatsApp Cloud events

Status: complete for the Make-to-CleanOps persistence proof. GitHub issue #39; merged as PR #40 (`91fb7f9`, 2026-09-21).

## Outcome

Supported WhatsApp Business Cloud events forwarded by the Make scenario "Integration WhatsApp Business
Cloud" are stored durably through a scoped CleanOps endpoint, reusing the existing WhatsApp ingestion path.

## What exists

- `POST /api/integrations/make/whatsapp/v1`: returns 404 unless `CLEANOPS_MAKE_WHATSAPP_ENABLED=true`, requires a
  dedicated bearer token (`CLEANOPS_MAKE_WHATSAPP_TOKEN`, at least 32 characters), caps the body at 1 MB and
  validates JSON or Make-safe URL-encoded scalar fields with Zod.
- Tenant is derived from the receiving phone-number ID in `integration_accounts`; callers cannot send an
  organization ID.
- Messages reuse `accept_whatsapp_ingress_event` (idempotent envelope + processing job); delivery statuses are
  handled separately from operational messages.
- Meta's raw-signature webhook (`/api/webhooks/whatsapp`) is unchanged.

## Not claimed

- Existing-group capture: the official Watch Events trigger exposes generic Cloud API events and no group trigger.
  ADR 002 (no legacy group scraping) stands; see issue #37.
- Group-image download, end-to-end phone-to-private-evidence hash proof, latency and cost measurements (issue #37).
- A generic multi-source authenticated intake API (issue #27).

## Verification

Recorded in PR #40: typecheck, lint, 44 unit tests, build, a production URL-encoded synthetic message returning
HTTP 202 with a durable event and job, and a queued real delivery-status callback replayed through both Make modules.
Source: `src/services/make-whatsapp-ingress.ts`, `docs/integrations/WHATSAPP.md`.
