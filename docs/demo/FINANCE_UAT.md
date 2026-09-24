# Finance showcase UAT — synthetic Gate A

For a read-only customer presentation using the currently verified hosted run, start with
[TORNADO_FINANCE_REHEARSAL.md](TORNADO_FINANCE_REHEARSAL.md). This document is the broader
state-changing Gate A checklist; its pending cases must be executed and evidenced separately.

This is the presenter and evidence checklist for #38. It tests a synthetic Tornado-style
finance workflow, not a customer pilot or a live Sage/WhatsApp claim. Use #28's generated
`finance-showcase` version and record the actual seed, run ID, app commit, schema migration,
demo organization and execution time before beginning. Keep passwords outside this document.
Plan for 10–12 minutes: 2 minutes on contracts, 2 on intake, 2 on time/projects, 2 on
reconciliation, 2 on the overview and roles. Record a separate 2-minute walk-through after
the full run passes.

## Prepare the source pack and hosted run

1. On local Supabase, run `npm run demo:generate -- finance-showcase`,
   `npm run demo:assert -- finance-showcase`, and
   `npm run demo:presenter -- finance-showcase`. Save the generated
   `expected.json`, `presenter-tests.md`, `contract-documents.json`,
   `expense-receipts.json`, `time-cases.json`, PDFs and PNG receipts as the
   versioned presenter pack. After copying the pack, run `npm run demo:reset -- finance-showcase`.
2. For the hosted demo, use the dedicated synthetic organization and the protected release
   procedure in [DATA_FACTORY.md](DATA_FACTORY.md). Review the read-only hosted preflight before
   the separately approved `--apply` operation. Run hosted `assert` after provisioning. Save its
   output and verify the deployed app commit includes #34 and #76. Never paste secret keys or
   persona passwords into evidence.
3. Sign in as the generated scenario Director. The existing hosted Director account belongs to
   a different organization and will not see this scenario. Confirm the banner says synthetic.
   Select the latest complete closed month (August 2026 in hosted version 8) and compare Grand Villa
   and River Rock. Read exact site amounts from `expected.reconciliation.showcaseSites`, rather
   than a slide or handwritten card. September may be empty; June is deliberately unresolved;
   July is deliberately stale.
4. Record the generated account identifiers and granted sites for Director, Area Manager,
   Supervisor, Worker and Client from the current `expected.json` role/site matrix. Obtain
   their passwords from the protected provisioning channel. Use separate browser sessions;
   never include credentials in this pack or its recording.

## Presenter sequence and expected result

| Step | Action | Evidence to capture |
| --- | --- | --- |
| 1 | Open `/finance`; compare the two August sites and select each one. | Expected and recognized revenue are distinct. Accepted direct costs and direct contribution match the manifest. Other sites with no accepted data show N/A. |
| 2 | Open `/finance/contracts`. Inspect the generated manual contract, its source PDF and amendment. | Approved versions, future effective date, recurring task, staffing rule, and expected revenue are traceable. Source is visibly synthetic. |
| 3 | Create a **new synthetic draft** at an authorized site; upload `contract-source.pdf`, run extraction, and review proposed clauses. | Source page/span is visible for supported values; “Payment terms: TBD” remains unresolved. Extraction alone does not activate or post revenue. |
| 4 | As Director, preview and activate only after resolving required terms. Upload `contract-amendment.pdf` as a changed source for a new effective-dated version. | The preview names downstream task/staffing/revenue effects. Reload confirms the approved version and generated operational requirements; the amendment does not rewrite history. Record any added demo facts separately from the baseline manifest. |
| 5 | Open `/finance/inbox`, then submit a new fuel and meal case through the supported app/simulator path with the synthetic receipts. | Candidate and original source persist; suggested values require human review. Director approval produces one allocated operational cost per accepted receipt. |
| 6 | Submit the **same fuel receipt bytes** a second time under a different message. | Two inbound sources may exist, but the duplicate warning prevents a second approved cost. |
| 7 | Open `/finance/time` and `/finance/rates`. Review a normal shift, missing checkout, overtime, swap, and manual project entry. | Exceptions remain unposted until reviewed. Posted labour uses the effective Director rate and keeps its original cost snapshot after a later rate change. |
| 8 | Open `/finance/projects`. Inspect `HASTINGS-DEEP-CLEAN` and the incomplete follow-up. | Labour, fuel and supplies link to source records. Project cost is counted once in site totals. Recognized contribution for the incomplete project stays N/A. |
| 9 | Open `/finance/reconciliation`. Import a supported synthetic accounting file through the Director flow, then inspect an exact match, same-amount ambiguity, split allocation, unmatched approved expense, corrected/superseded source, June ambiguity, stale July close, and balanced closed August. | Exact matches can be accepted once; ambiguity and unmatched rows remain in review. A late import or correction marks a closed period stale until explicitly reviewed/reclosed. August's source allocations and operational matches balance and its close is current. Record the new file's results separately from the baseline. |
| 10 | Return to `/finance` and change site/month. | Every card and review prompt follows the selected period and permitted sites. A source link opens the owning workspace; the amounts remain synthetic. |
| 11 | Sign in as generated Area Manager, Supervisor/Worker, and Client viewer in separate sessions. | Area Manager sees only granted-site aggregates and no worker hourly cost/rate payload. Other roles cannot retrieve finance summaries or Director actions. Record denied cross-site and revoked-membership attempts. |
| 12 | Repeat hosted assert, then in a separately approved demo reset/release window reset and regenerate with another seed. Retry one duplicate event, fail one intentionally invalid input, and repeat across a month boundary. | No unrelated tenant changes, duplicate costs, leftover Auth accounts or private files. New expected controls match new source records; no dashboard value is hard-coded. Record rollback/recovery behavior for a failed run. |

## Copy/paste intake cases

Use the generated `expense-receipts.json` for the exact amount, site, date and attachment for
each case. The text below is a test input, not an assertion that an official WhatsApp group is
connected. Use the canonical app/simulator path unless #37 has independently verified the
live channel.

| Case and message | Attachment | Expected review |
| --- | --- | --- |
| “Fuel for the Hastings job tonight. Receipt attached.” | `fuel-receipt.png` | Resolve site/project and fuel/travel; Director posts one cost. |
| “Team lunch for the Hastings job. Receipt attached.” | `meal-receipt.png` | Capture meals and payment method; approve before posting. |
| “Bought 3 cases of cleaning chemical for <SITE>. Receipt attached.” | `supply-receipt.png` | Review supply category; avoid counting order, receipt and stock issue as separate expenses. |
| “Scrubber repair completed for asset <ASSET_CODE>. Invoice attached.” | `repair-receipt.png` | Link repair expense to asset only if an authorized asset record exists; otherwise leave asset context unresolved. |
| “Purchased a new carpet extractor for <SITE>. Receipt attached.” | `equipment-receipt.png` | Flag accounting/asset treatment; no automatic capitalization decision. |
| “Hastings job: Paul worked 8 hours today.” | none | Draft time only until site/project, hours and supervisor review are confirmed. |
| “Hastings job: Paul worked 8 hours at $30/hr.” | none | Claimed rate is untrusted and must not update a Director cost rate. |
| “Fuel receipt from tonight's job. Receipt attached.” | `fuel-receipt.png` | Ambiguous site/project stays unresolved and unposted. |
| “Fuel for the Hastings job again. Receipt attached.” | the **same** `fuel-receipt.png` | Duplicate source warning; no second approved cost. |
| “Correction: the fuel receipt I sent earlier was for Hastings, not River Rock.” | none | Human review or audited correction, preserving original source. |
| “Spent some money for work.” | none | No guessed amount or approved expense. |
| “Restroom B cleaning complete.” | none | Operational message; no finance expense. |

For each expense case, the reviewer resolves source identity, site, date, category, amount,
payment method and project/asset context when supported; the Director approves or rejects
the candidate. Approval creates one immutable operational cost linked to the source. The
overview and reconciliation totals change only when the posting falls in the selected period
and site; a duplicate, unresolved or rejected case contributes zero. Save the before/after
manifest comparison and source ID for each case. The generated `expense-receipts.json` supplies
the amount and approved baseline for the corresponding fixture.

Cases that rely on #30/#31 asset or supply workflows are **partial** until those issues land.
Do not imply that those source links exist when the corresponding record is absent. For the
insufficient and non-finance messages, record the classification decision and reason, and
confirm no approved cost exists. For the correction, require an audited review path and
preserve the original source; if that path is unavailable, fail that case and file the defect
on its owning issue.

## Additional negative and access checks

- Contract: keep the deliberately unclear payment clause in Review recommended / Not found;
  verify that failed extraction and unsupported file types cannot activate a version.
- Labour: inspect missing checkout, approved overtime, worker swap, rate changes across
  periods, manual project time and repeated processing. A later rate change must not rewrite
  a posted cost snapshot.
- Accounting: test exact, ambiguous, split, unmatched, late and superseded rows. Record the
  close status before and after a correction and require a named Director action to reclose.
- Access: Director can approve and close; Area Manager sees only assigned-site aggregates
  and no worker rate payload; Supervisor verifies operational facts only; Worker submits
  through the approved channel; Client cannot load internal finance. Repeat with a revoked
  membership, forbidden site ID and signed-media URL; inspect network responses, not only
  hidden controls.
- Device and recovery: run a desktop browser and real iPhone camera/library capture, test
  offline/reconnect, keyboard navigation, a failed upload, and browser console errors. Keep
  a printable redacted client report and record any report gap rather than inventing one.

## Record pass/fail evidence

For each step keep: actor role, site, test input/document hash, timestamp, source ID, expected
and actual state, reviewer/approver, finance record ID, accounting/period status, screenshot or
recording reference, and a pass/fail note. Keep a redacted 2-minute recording and known-limitations
list with the evidence pack. Capture browser console errors, mobile width, keyboard
navigation, reload persistence, and duplicate/retry behavior. A green build or local assertion
does not substitute for this hosted run. Record code merge, migration release, hosted scenario
provisioning, browser verification, and any live provider proof as separate outcomes.
