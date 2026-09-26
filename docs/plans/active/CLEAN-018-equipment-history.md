# CLEAN-018 equipment history review plan

Issue: [#31](https://github.com/niru2015/cleanops-ai/issues/31). Branch: `codex/equipment-maintenance-history`.

## Acceptance implemented in this branch

- Reuse the existing asset register and neutral equipment report; check site at asset link time.
- Keep source-backed checklist versions, attributed post-use inspections, neutral fault and maintenance events, independent return-to-service approval, private evidence association and site movement history.
- Link one approved repair expense posting to one asset/action and optional accepted accounting source without adding both amounts.
- Show asset history and management source costs in site-scoped pages; retain unknown values as unknown.
- Verify wrong-site links, missing/overdue inspection, role separation, immutable browser access, duplicate cost/event handling, movement attribution and private evidence across sites.

## Evidence

- `npm run typecheck`, `npm run lint`, `npm test` (89), `npm run build`.
- `npm run test:db:postgres` and `npm run test:db` (457 pgTAP assertions).
- `npm run test:e2e -- tests/e2e/equipment.spec.ts` (authenticated Director and Operations Manager lifecycle).

## Remaining integration boundaries

- #28 does not yet parse or generate `modules.equipment`. A healthy and repeat-repair asset with dated invoices must be added there before a deterministic finance showcase or #34 exception is claimed.
- The hosted walkthrough reset predates these new equipment records. Review an exact synthetic reset contract before replaying this workflow in that hosted organization; the local tests use rollback and a disposable database.
- No hosted migration or production journey has been executed by this branch.
