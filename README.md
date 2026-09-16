# CleanOps AI — Phase-0 context pack

A repo-ready specification for commercial cleaning operations in casinos and other
24/7 facilities. Principle: digitize the existing workflow before replacing it.

**Status:** CLEAN-001 through CLEAN-003 merged. CLEAN-004 private operational evidence,
deterministic resolution and recovery are implemented locally. No live WhatsApp connection,
OpenAI calls, deployment or customer onboarding exists yet.

Start with [AGENTS.md](AGENTS.md) and [docs/INDEX.md](docs/INDEX.md).
Build order and gates: [ROADMAP](docs/plans/ROADMAP.md).
Completed plans: [CLEAN-001](docs/plans/completed/CLEAN-001.md),
[CLEAN-002](docs/plans/completed/CLEAN-002.md) and
[CLEAN-003](docs/plans/completed/CLEAN-003.md).

## Local development

Requirements: Node.js 24.14.0 (see `.nvmrc`) and npm 11.9.0.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

## Local database

The canonical database workflow requires a Docker-compatible runtime. The pinned Supabase
CLI, migrations and deterministic synthetic seed are included in this repository.

```bash
npm run db:start
npm run db:reset
npm run test:db
npm run db:stop
```

After `db:start`, copy the local publishable key from `npm run db:status` into `.env.local`.
For CLEAN-003, also copy the local secret key and set a private demo token of at least 24
characters. Keep `CLEANOPS_DEMO_INGRESS_ENABLED=false` except while exercising the simulator.
The compatibility check below executes the same migration and RLS boundary cases against a
temporary PostgreSQL 17+ cluster when Docker is unavailable:

```bash
npm run test:db:postgres
```

## Simulated message ingress

With local Supabase and the app running, enable the simulator in `.env.local`. POST a strict
synthetic batch to `/api/demo/messages` with `Authorization: Bearer <demo token>`. A `202`
means each account-scoped envelope and pending job is durable. Process one pending job with:

```bash
npm run worker:messages
```

Retry a terminal failed job with `npm run worker:messages -- --retry <job-id>`. These routes
return `404` in production and do not connect to WhatsApp. See
[the ingress contract](docs/integrations/WHATSAPP.md) for the payload and reliability rules.

## Simulated operational evidence

After a local database reset and with the app running, replay the synthetic 23:15 BEFORE and
23:29 AFTER records into the private `operational-evidence` bucket:

```bash
npm run demo:replay-evidence
```

The replay uses a tiny synthetic image, verified Worker 182 mapping and 30-minute Restroom B
context. It produces one linked revision/pair and is safe to replay. Reconcile a staged object
left by a simulated crash with `npm run worker:messages -- --reconcile-evidence`.

Authenticated evidence reads request a 60-second URL from
`/api/evidence/:evidenceId/signed-url`; the server checks row-level access before signing.
Supervisors resolve or ignore queue records through `/api/evidence/:evidenceId/resolution`.

Verification:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

CLEAN-001 creates the responsive application shell. CLEAN-002 adds the local Supabase tenant,
access and work foundation. CLEAN-003 adds server-only, demo-gated durable ingress and a leased
local worker. CLEAN-004 adds private synthetic media, deterministic resolution and audited
supervisor decisions. Database reset and test commands are local-only; no command in this
repository links or pushes to a remote Supabase project. Keep each PR limited to one issue.

Repository: https://github.com/niru2015/cleanops-ai (private).
The local parent Vancouver project is a synced mirror, so this CleanOps folder remains
separate from it.

## Provenance and decision status

Source: user-provided “Research casino cleaning systems” conversation,
ID `6aa8e316-0e4c-83e8-ad13-1f4169e500fe`, retrieved 2026-09-14.
The full available recent planning answer and bounded prototype specification informed
this pack; older long answers were truncated by the conversation reader.
This is a compressed implementation baseline, not a verbatim research archive.
Business claims about Tornado, regulations, API availability and vendor prices are not
validated customer requirements. Demo organizations, people and performance are synthetic.
Accepted ADRs mean this pack's initial design baseline; no customer/legal approval implied.

Phase ordering, role boundaries, retry limits and demo arithmetic are explicit design
choices to make the first build executable. Pilot-dependent decisions remain open in the roadmap.
