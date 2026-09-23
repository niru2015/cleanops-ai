# Deterministic demo scenarios (CLEAN-015 Stage A and finance adapters)

Stage A creates base organizations, clients, sites, workers, memberships and site grants in **local Supabase only**. CLEAN-022 adds the first Stage B adapter: `finance-showcase` and `contract-smoke` create a synthetic manual fixed-monthly contract and future amendment, replay Director approval/activation through production RPCs, and reconcile expected revenue. CLEAN-035 adds Finance Inbox app/WhatsApp expense cases, verified synthetic receipts and approved direct-cost postings to `finance-showcase`. CLEAN-036 adds attendance, missing-checkout, overtime, worker-swap, effective-rate-change and manual-project time cases with approved cost. CLEAN-037 adds two canonical one-off projects: a completed Hastings deep clean with source-linked labour, fuel, supplies, invoice and accepted accounting revenue, plus an incomplete follow-up whose final margin stays pending. CLEAN-038 adds accepted accounting cost rows, unique and ambiguous match proposals, an unmatched source, and a closed month made stale by a late accepted import. Equipment events and reports remain ungenerated. `operations-showcase` and `edge-cases` still produce only the base layer. No dashboard total is inserted to make a demo look complete.

## Commands

Start the local Supabase stack, then run:

```bash
npm run demo:generate -- stage-a-smoke
npm run demo:assert -- stage-a-smoke
npm run demo:presenter -- stage-a-smoke
npm run demo:reset -- stage-a-smoke
npm run demo:generate -- stage-a-smoke --seed 20260923
npm run demo:generate -- contract-smoke
npm run demo:assert -- contract-smoke
npm run demo:reset -- contract-smoke
npm run demo:generate -- finance-showcase
npm run demo:assert -- finance-showcase
npm run demo:presenter -- finance-showcase
npm run demo:reset -- finance-showcase
```

The CLI obtains a local service key and database URL from `supabase status` and rejects non-local endpoints. `psql` is required for reset's read-only check across organization-scoped tables. It does not read a hosted project's secret from `.env.local`. The generated Auth personas have no password; a protected provisioning step must set one before sign-in. No browser reset endpoint exists.

## Add a scenario

1. Add `fixtures/scenarios/<name>/scenario.json`; its `scenarioId` must match the folder name. Copy `stage-a-smoke` and choose a seed, clock, site/worker counts, and `referencePack`.
2. `modules.contracts: true` requires `generatorVersion: 2`; `modules.expenses: true` requires version 3; `modules.time: true` requires version 4; `modules.projects: true` requires version 5 with time and expenses; `modules.reconciliation: true` requires version 6 with projects. Other unsupported modules still fail validation before any database write. `cases` describe planned journey coverage and do not themselves create business facts.
3. Run generate, assert, presenter, reset and regenerate locally. Add an assertion for each new module's source-backed totals when its adapter lands.
4. Bump `schemaVersion` or `generatorVersion` when changing the meaning of IDs or generated facts. Do not make application code read `fixtures/generated`.

Zod validates the manifest and reference pack. SHA-256-derived UUIDv5-shaped IDs depend on scenario ID and entity path. The run ID also includes the seed; identity IDs stay stable between seeds while the seeded generator changes variable facts such as site assignments. The same inputs and code produce byte-equivalent expected manifests.

## Registry and reset boundary

`fixtures/generated/<scenario-id>/registry.json` is a local, ignored service-tooling registry. It records the run, seed, generator version, organization ID, status and created Auth IDs. The scenario plan contains every base entity ID; the registry is written before database insertion and marked `partial` on failure. A partial run can be reset and regenerated. Reset checks the organization slug and planned base IDs, refuses deletion when the generated organization has unrelated operational/finance records, deletes only scenario-owned records, and removes only Auth users tagged with the scenario ID. Other tenant and legacy seed IDs are untouched. The contract adapter scopes source and generated rows by deterministic IDs or generated version links, reconciles current expected revenue, and deletes those rows in dependency order. Later adapters must extend the same preflight before writing more entities.

`expected.json` contains the scenario version, seed, clock, source-backed entity counts, role/site matrix and explicit control totals. For `finance-showcase` it includes current expected contract revenue, approved operational expense cost and approved labour cost, excluding deliberate duplicate-receipt and time exceptions. Its reconciliation section records a review-required June, a closed July and the late-import stale signal. It is for assertions and demos only. The app never imports it. `demo:assert` queries the local database and fails if generated records or totals differ. `presenter-tests.md` is generated from the same plan and states which later journeys are not available.

## Reference names and privacy

`fictional-v1` is the default for tests. `tornado-v1` separates owner-approved display identities from generated IDs and transaction values: Grand Villa (already named in this repository), [River Rock Casino Resort](https://riverrock.com/), and [Parq Casino Vancouver](https://www.parqcasino.com/) are venue references. Equipment reference names are drawn from `supabase/seed.sql`. The named personas are demo display identities from issue #28 and `scripts/provision-demo-logins.mjs`. These references imply no customer relationship, employment facts, actual contract or measured performance. All generated business records remain synthetic, per ADR 008.

The fourth finance-showcase site currently uses a fictional fallback until the owner supplies another approved hosted venue name. Site names are display data only; no ID, authorization rule or assertion depends on their literal wording.

## Stage B boundary

Contract manual setup/activation (#35) is the first attached adapter. CLEAN-034 adds synthetic `contract-source.pdf`, `contract-amendment.pdf`, `contract-scan.png` and `contract-documents.json` with exact source expectations. CLEAN-035 adds `expense-receipts.json`, synthetic PNG receipts and presenter copy/paste messages to `finance-showcase`; it replays app/normalized WhatsApp intake, human resolution and Director approval through production RPCs. The deliberate duplicate reuses a receipt hash and must not add cost. CLEAN-036 adds `time-cases.json` and replays attendance derivation, explicit review, effective rate changes and Director cost posting. CLEAN-037 derives project quote, recognized revenue and direct contribution from the seeded plan and verifies them against posted sources. CLEAN-038 creates accounting source rows and period states under deterministic IDs, runs unique matching through the Director RPC, and verifies ambiguity and stale close through read RPCs. Reset removes scenario period, link and accounting rows after a registry preflight. `demo:assert` checks source hashes, posted counts and totals. The local-only reset uses a transaction-scoped replication role to remove immutable time/rate/cost rows without weakening application triggers. These files are synthetic and are not silently attached to an existing active version. Supplies (#30), equipment (#31) and other adapters follow their owning schemas/services. The full 10–15 minute finance showcase remains incomplete.
