# CleanOps UX audit — issue #110

**Scope:** research for the synthetic CleanOps role demo and Finance MVP. **Baseline:** `5c1e51f` on `main`, inspected 2026-09-25 UTC. This is a design input for [#111](https://github.com/niru2015/cleanops-ai/issues/111) and [#112](https://github.com/niru2015/cleanops-ai/issues/112), not a change to product behavior or access rules. Finance scope remains [#61](https://github.com/niru2015/cleanops-ai/issues/61); scenario data remains [#28](https://github.com/niru2015/cleanops-ai/issues/28).

## Evidence and limits

- **Code:** current routes, `src/config/navigation.ts`, `src/components/app-shell.tsx`, journey components and `src/app/globals.css`. Code establishes available controls and fallback states, not a successful hosted action.
- **Committed screenshots:** [Gate A finance inventory](demo/assets/gate-a-finance/README.md) and its [capture manifest](demo/assets/gate-a-finance/capture-manifest.json). These are 1440 × 900 synthetic hosted captures from a named scenario run; figures and states can become historical after reset.
- **Live browser observation:** public `/mobile` at 390 × 844. The menu opened, Escape closed it, focus returned to the menu button, and the prototype banner remained visible. An existing Director `/finance` tab initially displayed role and casino selectors, source-backed totals, review prompts and the long finance workspace. Its authenticated session did not survive subsequent route navigation, so this audit makes no fresh authenticated mobile or cross-role claim.
- **Mobbin:** four targeted screen searches (operations dashboard, shift coverage, inspection/photo evidence, expense approval) returned `Mobbin MCP requires a paid plan`. No Mobbin screen or flow was inspected; no Mobbin screenshot is reproduced. The public examples below are substitutes to validate with Mobbin when access becomes available.

## Journey map and friction

| Journey / role | Implemented path and state | Observed friction or design question | Evidence |
| --- | --- | --- | --- |
| Director overview | `/finance` shows site/month finance summary, reviewed source prompts, and a separate site-scoped inventory/labour/message workspace. | The page has a **casino scope** selector and a second **finance summary** casino selector; the summary can show all assigned casinos while lower controls stay on one site. Their different scopes need a persistent, explicit label. The landing page is long and puts dense administrative forms below summary cards. | Code: `src/app/finance/page.tsx`, `src/components/finance-summary.tsx`; screenshot 01; initial live tab. |
| Casino/site navigation | `/operations` lists assigned site cards with areas, task counts, eligible workers and equipment. The Grand Villa synthetic command follows the portfolio if available. | Portfolio cards provide summaries but no direct site-detail action; “Sites & zones” is an anchor to `/operations`, while the full operations command exists only for the legacy walkthrough site. A Director cannot infer a consistent casino-to-workflow path from each card. | Code: `src/components/site-portfolio.tsx`, `src/app/operations/page.tsx`, `src/config/navigation.ts`. |
| Workforce/shift | `/operations` shows coverage, eligible replacement candidates, explicit assignment and distinct check-in; `/finance/time` reviews approved hours and exceptions. | Staffing and approved cost review sit in different top-level journeys without a clear contextual handoff. Candidate status and attendance status must remain separate in any compact design. | Code: `src/components/operations-command.tsx`, `src/app/finance/time/page.tsx`; screenshot 06. |
| Evidence/review | `/review` can show a private before/after pair, revision, Mock AI suggestion, human correction/approval, and image loading/denial states. | Sidebar “Evidence review” opens the legacy default task; assigned sites without that fixture receive a no-fixture screen. Current hosted recording skips Mock AI because the Restroom B pair cannot be prepared. The route needs a task queue or scoped entry when the owning evidence work is ready. | Code: `src/app/review/page.tsx`, `src/components/review-workspace.tsx`; `docs/demo/TORNADO_RECORDING_UAT.md`. |
| Equipment | Site cards embed asset condition and issue-report summaries; `/incidents` records the legacy scrubber issue. | Equipment details are nested in every casino card, which lengthens the portfolio and leaves no direct asset detail or filtered issue path. A reported issue must not look like a completed repair. Asset/inspection/repair-cost expansion belongs to #31. | Code: `src/components/site-portfolio.tsx`, `src/components/incident-operations.tsx`; UAT-06/06A. |
| Finance intake/approval | `/finance/inbox` and `/finance/expenses` keep synthetic source context, receipt and human review/posting. | Screenshot 04 shows a dense source block, duplicate warnings and review form flowing together with weak grouping; scan order and primary action are hard to identify. Screenshot 12 shows the app expense form as a narrow band at desktop width. Preserve duplicate and approval gates while improving grouping. | Screenshots 04, 05, 12, 19; code: `src/components/expense-inbox.tsx`, `src/components/expense-submission.tsx`. |
| Incident | `/incidents` separates the reported scratch, attributed wording, audit correction and equipment report. | The page is a fixed legacy scenario for one site; users assigned elsewhere get a fixture message rather than a general site-scoped incident list. Keep “cause undetermined” prominent. | Code: `src/app/incidents/page.tsx`, `src/components/incident-operations.tsx`; UAT-07. |
| Reporting | `/reports` prepares a draft, computes metrics, requires explicit release, then `/reports/client` exposes a redacted snapshot. | Supervisor and client views share the “Client reports” nav label, yet have different tasks. A direct “Open client view” link appears after release, but the shared nav label does not explain the supervisor/client task difference. Never treat draft as released or N/A safety as zero. | Code: `src/components/supervisor-report.tsx`, `src/components/client-report.tsx`, `src/config/navigation.ts`; report journey is code-backed only in this audit. |
| Mobile cleaner | `/mobile` offers an assigned task picker, zone context, before/after camera or library upload, private upload states and retry. | The top-level nav points to a fixed default fixture and other assigned sites can see a no-fixture state. This is a capture flow, not a general mobile task inbox. An authenticated 390 px capture journey still needs browser verification. | Code: `src/app/mobile/page.tsx`, `src/components/mobile-task.tsx`; public 390 px observation; UAT-05B. |

**Boundary:** “inspection checklist,” supply ordering, repair completion and general cross-site task/incident queues are not established by the current screens. Their owning issues are #31, #30 and #26/#27 as applicable. WhatsApp source labels, Mock AI and accounting imports must retain their actual evidence states.

## Screenshot inventory for design work

| Asset / browser view | What it supports | Limit |
| --- | --- | --- |
| [01 Director overview](demo/assets/gate-a-finance/01-director-overview.png), [02 River Rock comparison](demo/assets/gate-a-finance/02-river-rock-comparison.png) | Site/month controls, metric density and drilldown presentation | Desktop historical snapshot after any scenario reset. |
| [04 Finance Inbox](demo/assets/gate-a-finance/04-finance-inbox.png), [05 approved expenses](demo/assets/gate-a-finance/05-approved-expenses.png), [19 message context](demo/assets/gate-a-finance/19-message-context-queue.png) | Source, duplicate, human review and posting hierarchy | Read-only capture; does not prove a new approval in this audit. |
| [06 time review](demo/assets/gate-a-finance/06-time-review.png), [09 reconciliation](demo/assets/gate-a-finance/09-reconciliation.png) | Exception and period-state scan | Current scenario figures must be refreshed before presentation. |
| [11 Area Manager](demo/assets/gate-a-finance/11-area-assigned-site.png), [13 rate denial](demo/assets/gate-a-finance/13-rates-denied.png) | Role-specific content and denied state | Captured in the documented run, not reverified live today. |
| [12 expense submission](demo/assets/gate-a-finance/12-expense-submission.png) | Narrow desktop form layout | Screenshot is desktop, not a mobile capture. |
| Live public `/mobile`, 390 × 844 | Shell, synthetic banner, menu/drawer, inaccessible-task state | Inspected in browser; no new repository screenshot or authenticated cleaner state. |

Other screenshot names and seed provenance remain in the linked inventory; do not copy its images into a new reference library. No current-run screenshot is available for the Grand Villa operations command, review pair, incident timeline or released client report in this audit. Capture those in a protected role-scoped session before Figma signoff.

## Navigation and responsive findings

- The current sidebar is role filtered after authentication; before authentication it lists every implemented route. Keep server authorization as the boundary. A redesign should show role-relevant work first and avoid making unassigned modules look immediately actionable.
- The same synthetic banner survives navigation. The footer still says “Phase P3 · Client reporting,” which describes an older phase rather than the current Finance MVP and can confuse presenters.
- Desktop navigation is a 254 px sidebar. Under 839 px it becomes a right drawer. The 390 px public check confirmed open/close by Escape and focus return; the drawer has accessible labels. A full keyboard trap, zoom/reflow and authenticated form check remains open.
- Code has responsive breakpoints for site cards, finance metrics, report grids and evidence pairs. That is implementation evidence, not proof of usable 390 px content. Finance tables use horizontal overflow; each dense table needs actual narrow-width inspection.
- Buttons/links have a shared `:focus-visible` outline; inputs use additional focus rules. Image loading, access denied, missing and unavailable states are explicit in review. Finance and route-level restricted/error states are text labelled. Future design work should make these states consistent and test focus order, contrast, status announcements and 200% zoom across the representative screens.
- Semantic colors often accompany text labels (`Approved`, `Correction required`, `N/A`, `Reported`); preserve text, reason and source provenance so color alone never carries the decision.

## Proposed information architecture

Keep one **current casino** context visible on all site-scoped pages; show an explicit **All assigned casinos** portfolio mode only where aggregation is valid. Place portfolio → site overview → authorized action/drilldown in that order. Treat finance period selection as a separate filter that never silently changes the current casino. Do not infer a tenant from the visual selector: access must continue to resolve server-side.

| Role | First entry | Primary journeys | Secondary access |
| --- | --- | --- | --- |
| Director | Portfolio / management overview | Casino detail, finance source → review → reconciliation, workforce exceptions | Contracts, projects, rates, reports |
| Area/Operations Manager | Assigned casinos | Operational status, staffing, evidence/incident queues; Area Manager finance aggregate where granted | Site records and client report preview per permission |
| Supervisor | Assigned-site command | Shift coverage, task evidence review, incidents, report release | Equipment issue intake |
| Cleaner | Assigned tasks | Select task → capture before/after → upload state | Expense submission where granted |
| Client viewer | Released reports | Authorized released snapshot | No internal operations or finance navigation |

Use short, task-based subnavigation within a site or finance workspace instead of a long sentence of inline links. Show a clear next action in each empty, restricted and pending state. A pending/AI-suggested record remains visually distinct from human-approved or released state.

## Reference patterns (Mobbin fallback)

Mobbin access was blocked by its paid-plan gate, so these **public, directly linked examples** are the research inputs. They establish interaction ideas only; they are not CleanOps screenshots or assets to copy.

| Source and observed pattern | CleanOps adaptation | Boundary |
| --- | --- | --- |
| [Deputy shift statuses](https://help.deputy.com/hc/en-au/articles/6054132302991-Shift-status): distinguish empty/open/filled shift states and approval requests. | Show coverage gap, candidate assignment and actual check-in as separate status steps. | Do not auto-dispatch or equate assignment with attendance. |
| [MaintainX mobile overview](https://help.getmaintainx.com/getting-started-new-users/mobile-app-overview): status summary, due-today entry and recent activity. | Give a cleaner an assigned-task entry and a supervisor a small site-specific queue. | Do not add work-order creation or QR effects beyond existing task context. |
| [MaintainX asset view](https://help.getmaintainx.com/viewing-assets): asset status and work-order history near the asset. | Make asset condition and its **reported** issue easy to locate from a casino. | Repair history/inspection is #31; no completed repair claim. |
| [SafetyCulture inspection report example](https://wp-website.safetyculture.com/wp-content/uploads/sites/3/2023/11/Hotel-Room-Checklist-Sample-Report-SafetyCulture.pdf): evidence beside a flagged item and a distinct corrective action. | Keep before/after pair, finding, correction and supervisor approval adjacent. | A checklist itself is deferred; a photo does not certify quality. |
| [Ramp expense review](https://support.ramp.com/hc/en-us/articles/4417421399699-Transaction-reviews): reviewer inbox, source detail, request changes and audit feed. | Separate candidate/source, duplicate warning, reviewed fields and Director posting action. | Do not copy automated policy decisions or weaken Director approval. |
| [Carbon data table](https://carbondesignsystem.com/components/data-table/usage/): title, toolbar, row actions, filters and pagination conventions. | Use a compact source/exception table with an explicit primary action and responsive detail view. | Table behavior is a design proposal, not a chosen library or new finance query. |

Do not embed third-party imagery, reproduce branded layouts, or depend on expiring media links. If Mobbin access is later enabled, inspect actual previews and replace/add references with canonical Mobbin URLs and a short applicability note.

## Ranked next changes

| Rank | Candidate | Demo impact / frequency | Dependency and handoff |
| --- | --- | --- | --- |
| 1 | Shared shell, current-casino context and Director/site overview drilldown | High: every presenter/user enters here; fixes ambiguous scope and dead-end portfolio cards | [#111](https://github.com/niru2015/cleanops-ai/issues/111) design → [#112](https://github.com/niru2015/cleanops-ai/issues/112) first implementation. Preserve #61/#67 context and counts. |
| 2 | Finance intake/review grouping and period-state scan | High for Finance MVP, frequent reviewer work | After owning #61 flows stabilize; stage under [#113](https://github.com/niru2015/cleanops-ai/issues/113). Keep posting/reconciliation gates. |
| 3 | Workforce-to-evidence handoff and site-scoped task entry | High operational demo value | Requires evidence/fixture ownership in #26/#28; #113 child issue. |
| 4 | Cleaner 390 px capture/retry and report-release clarity | High for field use; moderate for Director demo | Capture authenticated mobile screenshots and role checks first; #113 child issues. |
| 5 | Equipment/incident depth and generalized queues | Moderate current demo value | Follow #31 and #27 product contracts; avoid designing an unimplemented repair/inspection system as live. |

**First implementation slice:** design a role-aware shell and a single casino context, then implement authorized portfolio → casino/Director overview navigation in #112. Acceptance should require desktop and 390 px browser checks for a Director and restricted role, along with unchanged source-backed counts and permission denials. No schema or security change is implied by this audit.
