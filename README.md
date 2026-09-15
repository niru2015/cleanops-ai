# CleanOps AI — Phase-0 context pack

A repo-ready specification for commercial cleaning operations in casinos and other
24/7 facilities. Principle: digitize the existing workflow before replacing it.

**Status:** CLEAN-001 application shell implemented. No database, live WhatsApp
connection, OpenAI calls, deployment or customer onboarding exists yet.

Start with [AGENTS.md](AGENTS.md) and [docs/INDEX.md](docs/INDEX.md).
Build order and gates: [ROADMAP](docs/plans/ROADMAP.md).
Current implementation plan: [CLEAN-001](docs/plans/active/CLEAN-001.md).

## Local development

Requirements: Node.js 24.14.0 (see `.nvmrc`) and npm 11.9.0.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Verification:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

CLEAN-001 creates only the responsive application shell. CLEAN-002 adds the local
Supabase tenant, access and work foundation. Keep each PR limited to one issue.

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
