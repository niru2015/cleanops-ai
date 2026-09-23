# CLEAN-034 contract document extraction

Issue #62. Branch `codex/clean-034-contract-documents` from merged main `fab8888`.

## Acceptance plan

1. Private PDF/DOCX/image upload with server verified MIME, hash, size, page bounds and safe duplicate handling.
2. Deterministic text/OCR extraction, validated structured proposals, exact source citations and failed-run fallback.
3. Role-limited human review that persists a separate decision and applies supported values to CLEAN-022 drafts without activation.
4. Scenario source/amendment/scan files with expected values and presenter instructions.
5. Clean database, unit, browser, scenario, typecheck, lint and build checks; keep the change in one PR.

## Current state

Implementation and local acceptance checks complete. Changed paths include the document
migration and pgTAP tests, extraction schema/service, upload and review actions/UI,
download route, scenario fixtures, browser and unit tests, and data/security docs.

- `npm run db:reset` and `npm run test:db`: 286 assertions passed on a clean database.
- `npm run test`: 69 tests passed; `npm run test:e2e`: 9 browser tests passed.
- `npm run test:scenario`, `npm run typecheck`, `npm run lint`, and `npm run build`: passed.
- Generated PDF was rendered and inspected for legible text.

Next: open the issue #62 PR and complete repository review. No hosted migration or
production deployment has been performed.
