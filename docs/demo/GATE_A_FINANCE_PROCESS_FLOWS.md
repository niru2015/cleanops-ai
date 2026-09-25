# Gate A finance process flows — implemented behaviour

This is the training map for the finance functions released and tested for the synthetic Gate A demonstration. It explains what a user does, where a human decision occurs, what persists, and what can stop a result from appearing. The source of truth for exact table/RPC semantics remains [PROCESS_FLOWS](../PROCESS_FLOWS.md), [DATA_MAPPING](../DATA_MAPPING.md), current migrations and application code. The companion [presenter guide](GATE_A_FINANCE_TRAINING.md) supplies screenshots and spoken steps.

**Evidence boundary:** current hosted scenario is generator v8, seed 20260927. A separate state-changing hosted UAT ran against seed 20260926 before the exact-scope reset. The [Gate A execution record](GATE_A_EXECUTION.md) identifies the tested transitions and remaining device/rehearsal work. No flow below implies customer data, live Sage transport, an official Tornado WhatsApp group, automatic AI approval or net profit.

## Flow key and finance state model

| Marker | Meaning |
| --- | --- |
| Source | Immutable or retained input: contract file, original message, receipt, attendance, invoice/CSV or accepted accounting row. |
| Proposal/draft | Parsed or entered information awaiting validation or human decision; no consequential amount is posted. |
| Reviewed/approved | Named actor chose canonical values or approved operational facts/commercial terms. |
| Posted/activated/accepted | Database transaction produced a consequential operational or accounting state. |
| Linked/closed | Source and operational records were reconciled, or a versioned period snapshot was closed. |
| Pending/stale | A required input or current close is missing; the result must not be represented as complete. |

The application resolves organization and permitted sites from the authenticated membership. A form's site ID is checked again in the server action and database RPC. Roles are not enforced by menu visibility alone.

~~~mermaid
flowchart LR
  A[Source document, message, attendance or CSV] --> B[Validated draft or proposal]
  B --> C{Human review}
  C -->|Incomplete or rejected| X[Pending, rejected or unknown; no posting]
  C -->|Approved| D[Operational posting or accepted accounting allocation]
  D --> E[Reconciliation link]
  E --> F{Coverage and balances complete?}
  F -->|No| Y[Open, unresolved or stale]
  F -->|Yes| G[Director closes versioned period]
  G --> H[Site and project recognized contribution]
~~~

## 1. Access, scope and roles

| Step | Implemented behaviour | Check in a demo |
| --- | --- | --- |
| Sign-in | A generated persona authenticates and receives current organization/role/site context. | The synthetic banner and finance-showcase persona appear. |
| Select site | Finance pages filter to granted site IDs; a guessed site in a URL does not create access. | Shayana Area Manager is limited to Grand Villa. |
| Read/write split | Director can administer finance; Area Manager reads assigned-site aggregates and resolves permitted operational context; other roles are denied internal finance. | Rates page denies Area Manager. |
| Private source | Contract and receipt download routes independently authorize the actor and return no private bytes to unauthorized roles. | Client/private-document denial is recorded in Gate A execution. |

The read-only hosted role checks included Director, assigned Area Manager, Worker and Client, with a private contract denial. Earlier Gate A UAT also revoked a synthetic membership and verified denial from an existing session, then restored it. See [Screen 13](assets/gate-a-finance/13-rates-denied.png), [access-context service](../../src/services/access-context.ts), [finance page](../../src/app/finance/page.tsx) and [finance context](../../src/services/finance-context.ts).

## 2. Deterministic scenario and protected reset

~~~mermaid
flowchart TD
  A[Versioned finance-showcase definition + seed] --> B[Deterministic plan and IDs]
  B --> C[Read-only hosted collision preflight]
  C --> D{Approved exact hosted release?}
  D -->|No| E[No hosted mutation]
  D -->|Yes| F[Register run and generate source records]
  F --> G[Replay consequential actions through authenticated services]
  G --> H[Query expected-result manifest and assert controls]
  H --> I[Ready hosted synthetic run]
  I --> J[Exact registry and unknown-row preflight before reset]
~~~

The protected tooling generates normal contract, expense, time, project and accounting source records and records a service-only registry. It does not inject a target dashboard total. A reset checks the dedicated organization, registry IDs and unknown additions before deletion. In the completed alternate-seed replay, the approved cleanup removed exactly 213 UAT rows and six backed-up private objects; reset-preflight passed; seed 20260927 generated and asserted. Other-tenant table, Auth and private-object fingerprints were unchanged. This is an operator workflow, never a presenter click path. See [DATA_FACTORY](DATA_FACTORY.md), [scenario plan](../../src/demo/scenario-plan.mjs), [Gate A execution](GATE_A_EXECUTION.md) and current local generated manifest.

## 3. Manual contract draft and canonical version

**Route:** Finance → Contract register → Add contract → review. **Actors:** Director or assigned Area Manager drafts; Director approves priced terms and activates. Operations Manager can review operational terms only.

~~~mermaid
flowchart TD
  A[Authorized site selected] --> B[create_manual_contract derives org and client]
  B --> C[Draft version]
  C --> D[Save dates, billing, staffing, obligations, SLA and responsibilities]
  D --> E{Required facts and zones resolved?}
  E -->|No| D
  E -->|Yes| F[Submit for review]
  F --> G[Director approves frozen version]
  G --> H[Preview downstream impact]
  H --> I[Director activates with current preview token]
~~~

Each wizard step writes a normalized draft row. Reloading the draft shows persisted state. An assigned editor can resolve a same-site obligation zone and records an actor-stamped event. An in-review version can return to draft with a required reason; direct edits to a frozen approved version are blocked. Director approval checks dates, priced terms and obligation zones. A preview token is tied to that approved version and is checked again at activation. See [contract actions](../../src/app/finance/contracts/actions.ts), [contract repository](../../src/integrations/finance/supabase-contracts.ts) and [Screens 03/10](assets/gate-a-finance/10-contract-review.png).

**Gate A result:** hosted UAT created a Grand Villa version, submitted and activated it, then approved a future amendment. It verified generated task/schedule/staffing/expected-revenue effects and historical preservation. The active 20260927 screenshot shows version 2 with an October future effect; its monthly amount is seed-specific.

## 4. Contract PDF, extraction and human clause review

~~~mermaid
flowchart TD
  A[Draft contract] --> B[Stage PDF/DOCX/image metadata]
  B --> C[Scoped private upload ticket]
  C --> D[Browser uploads bytes to private Storage]
  D --> E[Server verifies bytes, type, size, hash and page bound]
  E --> F[Native text or bounded OCR extraction]
  F --> G[Validated source-span proposals]
  G --> H{Human decision per material proposal}
  H -->|Accept or supported edit| I[Canonical draft row + audit]
  H -->|Reject or unknown| J[Explicit unresolved decision]
  I --> K[Submit and Director approval]
  J --> K
~~~

The app checks every cited span against extracted page text. “Not found” and “review recommended” are explicit; provider failure leaves a failed run and does not change the contract. The review screen distinguishes source text, machine proposal and human decision. Matched material proposals cannot be left undecided at submission. Extraction itself neither approves nor activates the contract. A changed amendment source attaches to a new future-dated draft version; the original file remains private. See [document actions](../../src/app/finance/contracts/document-actions.ts), [extraction service](../../src/services/contract-extraction.ts), [review page](../../src/app/finance/contracts/[id]/review/page.tsx) and the [historical activation preview](assets/gate-a-finance/uat-contract-activation-preview-seed-20260926.png).

**Gate A result:** a synthetic PDF was uploaded and extracted, source-backed terms were reviewed, and unresolved “TBD” payment terms were kept unknown. An earlier PDF worker failure led to a released fix and successful hosted replay. The current register surfaces the latest amendment source; it does not provide a complete side-by-side version history in that single view.

## 5. Activation, expected revenue and future amendment

~~~mermaid
flowchart LR
  A[Director-approved version] --> B[preview_contract_activation]
  B --> C[Task and schedule counts]
  B --> D[First 28 days of staffing coverage]
  B --> E[Up to 12 fixed-fee expected periods]
  B --> F[SLA definitions]
  B --> G[Version token]
  G --> H[activate_contract_version transaction]
  H --> I[Version-linked requirements and expected revenue]
  H --> J[Prior active future window shortened]
  J --> K[Prior-period facts and task runs preserved]
~~~

Expected revenue is a billing projection. It is not the accepted accounting revenue used in recognized contribution. An overlapping amendment replaces only future expectation rows and maintains old source provenance. Retry of an already-active version cannot duplicate generated rows. The UAT version created one task, one schedule, four coverage requirements and 12 expectation rows, as shown in the historical screenshot; counts and amounts must be read from each new preview. Source: [contract process](../PROCESS_FLOWS.md#16-contract-draft-and-activation-clean-022) and [contract review](../../src/app/finance/contracts/[id]/review/page.tsx).

## 6. Expense intake, private receipt, proposal, review and posting

**Routes:** Mobile → Submit an expense; Finance Inbox; Expenses and approved direct cost. **Actors:** assigned user submits, Director/assigned Area Manager resolves, Director posts.

~~~mermaid
flowchart TD
  A[App form or durable normalized WhatsApp message] --> B[Persist original source and candidate]
  B --> C[Optional private receipt ticket, upload and byte/hash finalization]
  C --> D[Deterministic text/OCR suggestion with provenance]
  D --> E[Human resolves vendor, date, total, site, category, payment and allocation]
  E --> F{Complete and supported?}
  F -->|No| G[Reject or leave pending with reason; zero cost]
  F -->|Yes| H[Submitted claim]
  H --> I{Director approval and duplicate-hash check}
  I -->|Exact receipt already posted| J[Blocked second posting]
  I -->|Approved| K[Immutable posting per balanced allocation]
  K --> L[Operational direct cost and later accounting match]
~~~

The receipt never becomes a financial fact merely by arriving. Finalization verifies content signature, size and SHA-256 rather than trusting a filename. A suggestion cannot silently replace canonical claim fields. The approval transaction serializes the organization plus receipt hash, locks the claim and is idempotent on retry. Employee-paid is a payment/reimbursement attribute, not a second cost. Equipment purchase is flagged for asset/accounting review and excluded from ordinary direct expense contribution until treatment is settled. See [mobile actions](../../src/app/mobile/expenses/actions.ts), [review/post actions](../../src/app/finance/expenses/actions.ts), [expense service](../../src/services/finance-expenses.ts), [Inbox](assets/gate-a-finance/04-finance-inbox.png) and [approved cost](assets/gate-a-finance/05-approved-expenses.png).

**Gate A result:** app form receipt upload, Director rejection of incomplete claims, a corrected meal approval, OCR suggestion and exact-hash duplicate guard passed hosted UAT. Normalized WhatsApp candidates appear in the generated scenario. There is no claim that the official Tornado WhatsApp/Make channel was verified.

## 7. Attendance, manual project time, rate and labour posting

~~~mermaid
flowchart TD
  A[Persisted assignment attendance] --> B[derive_shift_time_entry]
  C[Manual project time + source reason] --> D[Draft time entry]
  B --> D
  D --> E{Missing checkout, swap, invalid duration or cancellation?}
  E -->|Yes| F[Exception until operational review]
  E -->|No| G[Reviewer approves actual hours and class]
  F --> G
  G --> H[Director-only effective worker cost rate]
  H --> I[post_approved_time_cost transaction]
  I --> J[Immutable labour-cost snapshot and audit]
  J --> K[Project/site operational cost and accounting match]
~~~

Attendance is attached to the site's local work date. A reviewer chooses regular, overtime or contractor class; duration does not silently infer overtime. A changed attendance source can refresh only an unposted draft. Rates are effective-dated, audited and non-overlapping. Director posting requires exactly one active rate on that local work date, rounds the amount to cents and links the resulting labour ledger ID to the time entry; a retry returns that same ledger. Area Managers receive operational hours/exception state and aggregate site cost, not worker rate or individual ledger payload. See [time actions](../../src/app/finance/time/actions.ts), [rates actions](../../src/app/finance/rates/actions.ts), [time integration](../../src/integrations/finance/supabase-time.ts), [Screens 06/07](assets/gate-a-finance/06-time-review.png) and [historical posted time](assets/gate-a-finance/uat-posted-labour-seed-20260926.png).

**Gate A result:** two separate one-hour Hastings entries were posted at the tested effective rate; a worker-swap/missing-attendance path remained an exception. The current scenario keeps two Grand Villa review exceptions. Posted costs retain their historical rate snapshot after a rate interval changes.

## 8. One-off project terms, source links and contribution

~~~mermaid
flowchart TD
  A[Assigned-site project draft] --> B[Director approves fixed/hourly terms and activates]
  B --> C[Approved project time and posted labour]
  B --> D[Linked posted expenses or inventory issues]
  B --> E[Invoice record, separate from recognition]
  E --> F[Accepted accounting revenue allocation]
  C --> G[Direct project cost]
  D --> G
  F --> H{Accounting complete and Director cost close?}
  G --> H
  H -->|No| I[Recognized contribution pending]
  H -->|Yes| J[Recognized revenue minus direct cost]
~~~

An assigned Area Manager or Director can create and edit a site-bound operational draft. Director approval is required for commercial terms, activation, cancellation, billable hours and cost close. A source link references existing immutable postings; project costs are included once in the site view and are not added again as a separate site expense. Equipment purchase is excluded pending asset treatment. The completed HASTINGS-DEEP-CLEAN in seed 20260927 has CAD 800.39 recognized revenue, CAD 157.30 direct cost and CAD 643.09 recognized contribution; HASTINGS-REPAIR-PENDING deliberately has pending recognized contribution. See [project actions](../../src/app/finance/projects/actions.ts), [project workspace](../../src/components/project-workspace.tsx) and [Screen 18](assets/gate-a-finance/18-complete-project.png).

## 9. Accounting CSV preview and acceptance

~~~mermaid
flowchart TD
  A[Director chooses supported CSV] --> B[previewFinanceImport validates rows and mapping]
  B --> C{Complete, approved, actual and allocated?}
  C -->|No| D[Review exceptions; not accepted actuals]
  C -->|Yes| E[Unchanged file hash + mapping version]
  E --> F[stage_finance_csv_import]
  F --> G[accept_finance_import]
  G --> H[Accepted rows and site/category/period allocations]
  H --> I[Reconciliation source; distinct from operational posting]
~~~

The import validates source ID, service period, currency, category, amount, site mapping, approval and recognition. Unknown site/category remains unallocated. A complete batch cannot contain pending, rejected, estimated or unallocated rows. Hash plus mapping version is the idempotency key. A correction identifies and supersedes a prior batch, preserving both histories. This is a manual Director CSV path, not a live Sage feed. See [finance import actions](../../src/app/finance/actions.ts), [CSV service](../../src/services/finance-csv.ts), [finance integration](../../src/integrations/finance/supabase-finance.ts) and [Screen 15](assets/gate-a-finance/15-accounting-csv.png).

**Gate A result:** a malformed hosted acceptance first failed, a released repair made the corrected complete CSV pass, and a later superseding import was used to close the tested September period.

## 10. Deterministic matching, manual split and period close

~~~mermaid
flowchart TD
  A[Accepted accounting allocation] --> C[Deterministic proposal]
  B[Posted operational cost] --> C
  C --> D{Unique, same context and remaining balance?}
  D -->|No| E[Ambiguous or unmatched; human review]
  D -->|Yes| F[Director applies unique match]
  E --> G[Director manual amount/split with reason]
  F --> H[Audited link consumes both remaining balances]
  G --> H
  H --> I{Full-month accepted coverage, valid sources, zero unresolved balances?}
  I -->|No| J[Close blocked]
  I -->|Yes| K[Move to review and Director close]
  K --> L[Versioned snapshot]
  L --> M{Late import or new posting?}
  M -->|Yes| N[Stale; explicit reasoned reopen, correction and reclose]
~~~

Matching first considers exact source IDs/document references and then supported amount/date/context. Multiple best candidates stay ambiguous. Manual links and splits must fit remaining balances and matching organization, site, project, category, currency and period. A link associates sources; it does not duplicate direct cost. Full-month accepted coverage is required even when unresolved amounts happen to be zero. The Director-only close recomputes controls in the database. A later accepted import or changed operational amount marks the snapshot stale; old links and close versions remain auditable. Area Managers see only assigned-site aggregate status. See [reconciliation actions](../../src/app/finance/reconciliation/actions.ts), [reconciliation integration](../../src/integrations/finance/supabase-reconciliation.ts), [Screen 17](assets/gate-a-finance/17-august-close-controls.png) and [historical corrected close](assets/gate-a-finance/uat-balanced-close-seed-20260926.png).

**Gate A result:** September's corrected hosted UAT matched and closed, a subsequent posting made it stale, and a superseding import/split reclosed it with zero remaining balance. The active reset scenario instead presents current August, stale July and open June. These are separate snapshots.

## 11. Management overview, site comparison and review prompts

~~~mermaid
flowchart LR
  A[Permitted site and selected month] --> B[Expected contract projections]
  A --> C[Accepted accounting revenue and direct costs]
  A --> D[Approved operational sources and hours]
  A --> E[Period completeness and freshness]
  B --> F[Site card with distinct labels]
  C --> F
  D --> F
  E --> F
  F --> G{All sites complete for combined result?}
  G -->|No| H[N/A combined contribution]
  G -->|Yes| I[Combined recognized contribution]
  F --> J[Rule-based review prompt and source workspace link]
~~~

The overview reads permitted sites, current revenue expectations, accepted accounting reconciliation and approved operational source indicators separately. The rule-based prompts point to owning workspaces and require human review; they are not allegations or autonomous decisions. Direct contribution is recognized revenue less accepted direct cost and appears only with complete accepted accounting and a current closed period. The displayed margin is unavailable if revenue or completeness is missing. A site selector does not grant access to an unassigned site. See [finance summary](../../src/components/finance-summary.tsx), [summary service](../../src/services/finance-summary.ts), [finance integration](../../src/integrations/finance/supabase-finance-summary.ts) and [Screens 01/02/14](assets/gate-a-finance/01-director-overview.png).

## 12. Supplier catalogue, stock ledger and administrative adjustments

~~~mermaid
flowchart TD
  A[Director selects an authorized casino] --> B{Finance action}
  B --> C[Add organization supplier]
  B --> D[Add organization inventory item]
  B --> E[Record site stock movement]
  B --> F[Record separately labelled direct labour adjustment]
  C --> G[Active catalogue option]
  D --> G
  G --> E
  E --> H[Database-generated quantity × unit-cost total]
  F --> I[Database-generated hours × hourly-cost total]
  H --> J[Site ledger and later accounting matching]
  I --> J
  J --> K[Director edit/delete with audit event]
~~~

The released Finance & inventory workspace contains these Director-only forms below the overview and CSV import, visible in [Screen 15](assets/gate-a-finance/15-accounting-csv.png). The server action validates input, resolves the authenticated organization, checks site grant and writes vendors, inventory_items, inventory_transactions or labor_cost_entries. The database generates total_cost; the browser cannot supply it. A later edit/delete is restricted to the same organization/site and recorded in finance_ledger_audit_events; the identity and tenant/site of an existing row cannot be reassigned. Area Managers can read permitted inventory ledger and aggregate accepted finance, but no individual labour ledger. The standard labour path is approved time plus effective rate (§7); the older direct labour form is labelled an administrative adjustment or import reference, not routine attendance posting.

An inventory movement records stock cost context, but a supply request/order/receipt/issue must not multiply one invoice expense. The finance-showcase approved supply and repair receipts can be posted and reconciled as direct costs. Equipment purchase remains flagged for accounting/asset treatment and is excluded from ordinary direct expense contribution until treatment is resolved. The full operational supply-request, stock-history and equipment-repair drill-through modules are not claimed complete by Gate A. See [finance workspace](../../src/components/finance-workspace.tsx), [finance actions](../../src/app/finance/actions.ts) and [DATA_MAPPING](../DATA_MAPPING.md#finance--supplier-inventory-labour).

## 13. Normalized message context confirmation

~~~mermaid
flowchart LR
  A[Durably stored external message] --> B[Site-scoped context queue]
  B --> C[Director or granted Area Manager reviews sender, text, media and site]
  C --> D[Choose zone, task, worker and sender role when supported]
  D --> E[Confirm context with actor and timestamp]
  E --> F[Resolved operational context for later attribution]
~~~

The queue is mounted below the ledgers on Finance & inventory. Its source message is read through the site-authorized list_site_external_messages RPC; the browser does not receive a raw table grant. Confirming context updates external_message_contexts with the selected site and optional zone/task/worker, resolution_status confirmed, resolution_source manual and confidence 1. An Area Manager may confirm for a granted site because this is operational context, even though they cannot edit finance ledgers. This confirmation does **not** approve an expense, post cost or prove an official live WhatsApp channel. See [Screen 19](assets/gate-a-finance/19-message-context-queue.png), [finance actions](../../src/app/finance/actions.ts), [message context integration](../../src/integrations/messages/supabase-message-context.ts) and [DATA_MAPPING](../DATA_MAPPING.md#finance--whatsapp-context-queue).

## 14. What counts as a verified flow

| Flow | Gate A hosted evidence | Limit |
| --- | --- | --- |
| Contract source → human review → activation/amendment | Completed against a synthetic PDF, with generated task/staffing/expected-revenue checks. | Latest amendment view is not a full original-versus-amendment history screen. |
| App expense/receipt → proposal → review/post/duplicate guard | Completed, including rejection, corrected meal, OCR and exact-hash duplicate. | Official customer WhatsApp transport unverified. |
| Time → Director rate → labour posting | Completed for manual Hastings time; generated recurring shifts and exceptions asserted. | Not payroll or automatic overtime approval. |
| Project contribution | Completed source-backed project and incomplete follow-up asserted; current UI captured. | Final result depends on accepted accounting and cost close. |
| CSV import → match/split → close/stale/reclose | Completed in hosted UAT, with current August/July/June scenario states captured. | Manual synthetic CSV, not a live Sage connection. |
| Roles and private source access | Assigned-site and denied roles, private-document denial and one revoked membership were tested. | Recheck after any role/schema change. |
| Physical iPhone Camera/Photo Library | Deferred by owner. | Browser emulation is not a device pass. |
| Timed human rehearsal | Presenter script and 10m44s automated walkthrough exist. | Human timing and handoffs still pending. |

When a new seed or deployment changes the current figures, run the protected assert and update the presenter snapshot and screenshots rather than carrying forward an old amount.
