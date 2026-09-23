# ADR 011: Finance intake and approved direct cost

Status: Accepted, 2026-09-23.

## Context

Issue #63 needs app and WhatsApp expense information to become auditable site/project costs without treating untrusted messages, OCR or a submitted claim as an approved expense. Receipts can contain personal and commercial data. The #66 accounting close and #65 project register do not exist yet.

## Decision

Keep an immutable source candidate and private verified receipt separate from a human-reviewed claim. Deterministic extraction proposes fields only. Directors and granted Area Managers resolve the site, category, amount and allocation; only a Director can post. One transaction checks a ready receipt, balanced allocations and the organization-scoped receipt hash, then writes immutable direct-cost postings and audit. Employee reimbursement and equipment asset review are flags, not payment or asset creation. Project references remain text until #65; CLEAN-020 accounting import totals remain separate until #66.

## Alternatives

- Posting directly from OCR or WhatsApp would make source ambiguity a financial fact.
- Treating the source text as a receipt would weaken verification and duplicate protection.
- Reusing the accounting import tables would obscure provenance and double count before reconciliation.

## Consequences and revisit trigger

An expense needs human review and a verified receipt before cost appears. The local demo uses synthetic receipts and simulated WhatsApp ingress. Revisit when #65 adds canonical projects, #66 reconciles against accounting, or a reviewed provider extraction is introduced; keep source and human decisions traceable.
