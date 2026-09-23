# ADR 013 — One-off project contribution

Status: accepted for CLEAN-037 (#65), 2026-09-23.

`projects` is the canonical one-off commercial work record. It has one site, an optional parent contract, an operational draft, and Director-approved fixed or hourly terms. It is not a second accounting ledger.

Expected revenue comes from a fixed quote or Director-approved billable hours times the approved billing rate. Invoice records are explicit and separate. Recognized revenue comes only from approved actual revenue allocations in accepted accounting batches. Operational direct cost sums posted labour, posted non-capital expense, and inventory issues linked to the project. Imported accounting direct-cost rows serve reconciliation and are not added to those operational costs again.

The recognized contribution and margin stay unavailable until a Director marks project costs complete and the recognized accounting batch is complete. A project with no accepted revenue or an incomplete import remains pending. Area Managers may see site-scoped project aggregates without individual worker rates. Director-only source linking uses immutable link records where original postings cannot be modified.

This does not implement CRM, invoicing delivery, payment collection, or a Sage connector.
