# Sage readiness after CLEAN-020

CLEAN-020 deliberately implements an accounting-neutral CSV boundary, not a guessed Sage API connector.

Before a Sage integration is designed, confirm with the customer and their Sage product/version:

- supported export/API method, authentication and tenant/company identifiers;
- stable account, document and line identifiers and correction/reversal semantics;
- site, contract, job and asset dimensions available in the source;
- tax representation, base/transaction currency and exchange-rate ownership;
- service-period and accounting-period rules, including late invoices;
- approval, estimate and commitment status fields;
- payroll-detail privacy and whether only allocated totals may leave Sage;
- pagination, rate limits, webhook availability and replay behavior;
- sample exports covering duplicates, reversals, partial periods and unmapped values;
- reconciliation owner, acceptance cadence and rollback/escalation process.

Any future adapter must map into the existing batch/source/allocation contract and retain source identifiers. It must not bypass preview, idempotency, Director acceptance, supersession history or site-scoped reconciliation access.
