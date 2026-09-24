# CLEAN-013 — connected task evidence and correction

Issue: #26. Branch: `codex/clean-013-connected-evidence`; stacked on CLEAN-012 PR #88.

Scope: assigned task links, actual private signed image review, source/receipt metadata, after-only correction, authenticated submitter attribution distinct from worker attribution, and self-approval guard. The demo intake remains synthetic and the image format allowlist remains JPEG/PNG/WebP.

Changed paths: mobile/review pages and components, operations/review integration, mobile actions/schema, provenance migration and seed, database/browser tests, relevant docs.

Acceptance checks: typecheck, lint, unit, clean PostgreSQL database suite, production-mode two-session browser journey, forbidden media and unknown task checks. Hosted deployment and a real iPhone camera/library rehearsal are separate evidence and remain open.

Next: submit PR against #88, then run #38 Gate A hosted Finance UAT after both branches are merged and deployed.
