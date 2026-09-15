# CLEAN-001 — Scaffold the CleanOps application

Status: ready; not implemented. Dependency: Phase-0 pack.

## Objective

Create a reproducible Next.js App Router foundation for the subsequent local Supabase slice.

## Read

- [Agent rules](../../../AGENTS.md)
- [Architecture](../../ARCHITECTURE.md)
- [Product scope](../../PRODUCT.md)

## Implement

- Compatible pinned packages, lockfile, strict TypeScript, Tailwind and minimal shared UI.
- Mobile-friendly app shell with persistent synthetic-prototype banner and placeholder
  navigation labeled “Not implemented”; accessible empty state, no fabricated metrics.
- Scripts `typecheck`, `lint`, `test`, `build`; document exact setup commands in README.
- Example configuration with placeholders only; ignore local secrets and build artifacts.
- One meaningful shell smoke check; do not build business modules or fake backend success.

## Acceptance

- Clean install is reproducible with chosen documented runtime and package-manager versions.
- All four scripts pass; test command exercises a real smoke check, not an empty success.
- Shell renders at mobile and desktop widths with keyboard-accessible navigation.
- No credentials, live provider calls, remote database changes or automatic deployment.
- README distinguishes working shell from planned capabilities and names CLEAN-002 next.

## Out of scope

Auth/schema/RLS implementation, WhatsApp, AI, seed workflows and production deployment.

## Handoff

Report changed paths, exact verification outcomes, blockers and next issue. Replace this
status only when acceptance passes; move to completed with revision/commit if available.
