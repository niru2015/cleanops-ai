# ADR 009 — Versioned contract activation

Status: accepted for CLEAN-022, 2026-09-23.

## Context

Manual and later document-derived contracts must feed existing operations and expected finance without giving a browser a sequence of independent writes. Amendments must preserve historical requirements and distinguish expected billing from accounting recognition.

## Decision

Store contract identity, effective-dated versions, commercial terms, obligations, staffing, SLA rules and expected revenue as normalized tenant/site-scoped rows. Draft sections persist independently; a Director approves a complete version, receives a source-derived impact preview and explicitly activates it through one transactional RPC. Approved source rows are immutable to browser roles. Active version date ranges cannot overlap. Generated operational rows carry explicit version and source-child IDs. Fixed-fee revenue expectations cover 12 months; staffing activation materializes the first 28 effective days. Later scheduling extensions must use the versioned source rules, rather than treating these initial rows as the full contract lifetime. Amendment activation retains prior rows and marks replaced future revenue expectations non-current.

The scenario factory may insert synthetic draft source rows through local service tooling, but it replays approval and activation through the production RPCs as a generated Director.

## Alternatives

A single JSON contract blob would make child authorization, provenance and effective amendments opaque. Browser-orchestrated inserts would permit partial activation. Writing expected revenue into accounting reconciliation would conflate projections with accepted accounting actuals.

## Consequences and revisit trigger

The initial fixed horizon requires a future scheduler/roll-forward job before long-running hosted contracts rely on continuing shift and revenue generation. Hourly/per-shift/custom billing requires approved billable activity and does not generate a guessed fixed amount. Revisit the horizon and recurrence materializer with #64/#66 and the production scheduling service; preserve version provenance and idempotency.
