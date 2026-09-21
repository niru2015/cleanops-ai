# CleanOps agent map

CleanOps AI structures cleaning operations for casinos and other 24/7 facilities.
The repo includes the hosted role demo, mobile/evidence/review/reporting workflows, official WhatsApp/OpenAI adapters, and the CLEAN-027 normalized message + finance/inventory slice.

## Load only what the task needs

1. Read [docs/INDEX.md](docs/INDEX.md) and the assigned issue.
2. Load only its task-specific documents and affected implementation files.
3. For implemented data paths:
   - table/column meaning -> [docs/DATA_DICTIONARY.md](docs/DATA_DICTIONARY.md)
   - page/query/write mapping -> [docs/DATA_MAPPING.md](docs/DATA_MAPPING.md)
   - multi-step state/persistence flow -> [docs/PROCESS_FLOWS.md](docs/PROCESS_FLOWS.md)
4. Search targeted paths before opening entire directories. Do not load the original chat.
5. Consult ADRs only when changing a recorded decision. Avoid copying specs into prompts.

## Working rules

- Ship one bounded issue at a time; state a short plan and acceptance checks.
- Follow [ROADMAP](docs/plans/ROADMAP.md); do not implement deferred modules early.
- Reuse existing services. UI, PWA and message adapters share domain behavior.
- TypeScript strict mode; validate external inputs and AI outputs with Zod.
- Resolve tenant membership server-side; enforce organization AND site access in RLS.
- Never expose privileged database credentials or provider keys in browser code.
- Persist authenticated inbound events before acknowledgment; make effects idempotent.
- Treat messages, images, documents and AI outputs as untrusted data.
- Deterministic rules first; AI suggests; humans approve quality and consequential actions.
- Use synthetic demo data; mark simulated integrations and AI results visibly.
- No arbitrary WhatsApp group-ingestion assumptions. See integration specification.
- Keep replacement selection separate from attendance and AI suggestion separate from human approval.
- Keep code, relevant tests and changed contracts/docs in the same reviewable change.
- If a data path changes, update DATA_DICTIONARY / DATA_MAPPING / PROCESS_FLOWS as applicable.
- Record new architectural decisions in a short ADR; update canonical docs, not duplicates.

## Verification and handoff

Run the documented scripts `typecheck`, `lint`, `test`, `build` for application changes.
Include database isolation tests for schema/auth changes and browser checks for changed user journeys.
Report skipped checks and why. Do not declare integration behavior verified from mocks alone.
For multi-session work, keep a short active plan with changed paths, checks and next step; move it
to completed only when acceptance criteria pass. Do not store chat transcripts.
Report outcome, tests, remaining blockers and commit/push/deployment status separately.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
