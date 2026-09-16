# Architecture baseline

Next.js App Router, strict TypeScript, React, Tailwind and shadcn/ui; Supabase Postgres,
Auth and private Storage; OpenAI behind a provider adapter; Vercel deployment target.
Select compatible stable package versions during CLEAN-001 and commit the lockfile.
PWA is mobile-first; offline mutation queues are deferred. Realtime is optional UI refresh,
never a correctness dependency. Defer pgvector, PostGIS and Make until a scoped need exists.

## Boundaries

UI / PWA / message adapters → validated server entry points → domain services →
Supabase repositories. AI services return suggestions into the review workflow.
Use server actions for first-party mutations and route handlers for external webhooks.
Read operations use authenticated access. Avoid duplicating logic in route handlers.

Planned layout (create with implementation, not empty scaffolding now):

```text
src/app/                  pages, actions, API handlers
src/components/           shared UI
src/domain/               rules and state transitions
src/services/             use cases and transaction boundaries
src/integrations/         whatsapp, mock, openai adapters
src/lib/supabase/          browser / session-server / privileged-worker clients
src/schemas/              validated input and output contracts
supabase/migrations/      exact SQL, grants and RLS
supabase/tests/            isolation and database invariants
tests/                    domain, integration and browser tests
```

## Durable processing

Verify provider request → atomically persist raw envelope and pending job → acknowledge →
worker normalizes messages → resolves identity/context → stores media → links evidence →
requests AI suggestion → supervisor review. Use a Postgres-backed job table initially.
Do not start fire-and-forget work inside a serverless request. Worker runner uses a
persisted lease, bounded attempts and reclaimable expired leases; local runner first,
production scheduler selected at P4. No in-memory-only queue.

CLEAN-003 implements the first slice at `/api/demo/messages` and
`/api/demo/messages/worker`. The route delegates to `src/services`; the Supabase adapter owns
RPC calls; `processing_jobs` owns durable state. `npm run worker:messages` invokes one leased
job locally. A production scheduler remains a P4 decision.

Idempotency exists at envelope, message, evidence and AI-job boundaries. Updates to a
business record, audit event and next job are transactional; media uses staged upload
plus reconciliation since Storage and Postgres are not one transaction.

CLEAN-004 stages the database row before uploading to private Storage. Finalization verifies
the stored SHA-256, detected content type and byte size, then resolves identity/context/task in
one database transaction. `/api/demo/evidence/reconcile` repairs upload-before-finalize crashes.
Authenticated reads pass RLS before the server issues a 60-second signed URL.

CLEAN-005 adds `/review`, server actions and a `VisualQualityService` boundary. The deterministic
mock writes the same `quality.v1` shape expected from a future live adapter. Database RPCs compare
the current submission revision inside the transaction before confirming a finding or approving;
the browser cannot convert a score into approval.

## Configuration

Default demo mode uses synthetic fixtures and mock AI; database persistence is real local
Supabase. Demo mode never silently enables live providers. Missing production credentials
fail clearly. Simulator routes require authorization and are disabled in production.
Integration configuration stores secret references, never raw keys.

## Verification contracts

Unit: transitions, resolution, deadline/SLA arithmetic. Database: two tenants and restricted
sites. Integration: duplicate/concurrent events, crash recovery, media/AI failure.
Browser: submit → review → correct → approve → client release; mobile viewport and keyboard.
No deployment implied by committing or pushing documentation or application code.
