# CleanOps UX system V2 (issue #111)

**Status:** proposed for acceptance in `codex/ui-preview`, 2026-09-25. Design and documentation only: no route, service, schema or permission change. Inputs: [UX audit #110](../UX_AUDIT_110.md), the Tornado brand at tornadobmc.ca, and the owner-approved Director overview direction. Decisions: [ADR 014](../adr/014-ux-system-v2.md).

**Visual references (private claude.ai links, shared on request):**
- Design canvas: [CleanOps design directions](https://claude.ai/artifact/2PCN3oMuEzuUkXGuX9QKSr): rounds 1–2 (approved: "B layout with A's navy sidebar") and the three #111 example screens.
- Component library: [Tornado CleanOps design system](https://claude.ai/artifact/MFuRsQjFVzRuan9d9o59Pp): tokens, 12 components with live state previews and usage rules, logo usage.
- **Figma:** not yet created. No Figma connection was available; the library above is the interim source. Recreate it as a Figma library with variables before #112 sign-off if Figma remains a requirement.

## 1. Tokens

Implement as CSS custom properties in `src/app/globals.css` and expose them to Tailwind 4 with `@theme` (ADR 014). Names match the design-system library.

### Colour (light theme; dark theme is out of scope)

| Token | Value | Use | Contrast |
|---|---|---|---|
| `brand-navy` | `#00354D` | Sidebar, mobile header, hero KPI card, active tab, page titles | white on it 12.99:1 |
| `brand-navy-700` | `#0B4A67` | Active nav item, user card, product tag on navy | `ink-on-navy` 9.59:1 |
| `brand-navy-900` | `#002A3D` | Hover/pressed for navy fills | white 15.02:1 |
| `brand-red` | `#E04838` | Brand marks on light grounds only | 4.07:1 on white (marks, not text) |
| `brand-red-on-dark` | `#FF6A5A` | Active-nav inset bar on navy | 3.41:1 on `brand-navy-700` |
| `brand-blue` | `#2F63A8` | Primary buttons, links, focus ring | 6.05:1 both ways with white |
| `brand-blue-hover` | `#24508A` | Hover/pressed for blue | white 8.11:1 |
| `canvas` / `surface` / `surface-muted` | `#F3F6F9` / `#FFFFFF` / `#EEF2F5` | Page, cards, table heads and disabled fills | — |
| `border` | `#E1E8EE` | Decorative card/row hairlines | decorative only |
| `border-control` | `#7B8C97` | Inputs, selects, secondary buttons, tabs | 3.48:1 on `surface`, 3.21:1 on `canvas` |
| `ink` / `ink-secondary` / `ink-muted` | `#0F2330` / `#33464F` / `#5B6B76` | Text on light grounds; `ink-muted` is the lightest allowed | 14.85 / 9.86 / 5.51:1 on white |
| `ink-on-navy` / `-soft` / `-muted` | `#DCE8EF` / `#BCD2DF` / `#9FBCCC` | Text on navy | 10.41 / 8.30 / 6.52:1 |
| `focus-ring` / `focus-ring-on-dark` | `#2F63A8` / `#FFFFFF` | 2px outline, 2px offset | 6.05:1 on white; 12.99:1 on navy |
| `status-{success,pending,ai,danger,neutral,info}-{bg,fg}` | see library | Record states, always with words | every pair 5.88:1 or more |
| `status-danger-border` | `#C0392B` | Invalid input border | 5.44:1 on white |
| `prototype-{bg,fg,dot}` | `#FFF4DF` / `#6B4300` / `#B26B00` | Synthetic-data banner and pill | 7.93:1 |
| `planned-border` | `#8A9BA5` | Dashed Planned outline, always with words | — |

Rules: blue is the only action colour. Red is a brand mark, never a button or error: errors use `status-danger-*`. Brand values come from tornadobmc.ca (navy `#00354D`, red `#E04838`, blue `#2F63A8`); red and blue are used unchanged where they pass, and `brand-red-on-dark` exists because `#E04838` is 2.35:1 on the active nav fill.

### Typography

Faces: **Poppins** (Tornado's web display face) for page titles, KPI figures and card headings; **Plus Jakarta Sans** for all UI and reading text. Load both with `next/font/google` (self-hosted at build). Tabular numerals (`font-variant-numeric: tabular-nums`) in tables and KPI grids.

| Style | Size / line | Weight | Face | Use |
|---|---|---|---|---|
| `kpi-hero` | 44/52 (38 on phones) | 600 | Poppins | The one hero figure |
| `page-title` | 32/40 (26 on phones) | 600 | Poppins | One per page, navy |
| `kpi-lg` / `kpi-md` | 28/36 · 24/32 (21 on phones) | 600 | Poppins | KPI figures |
| `section-title` | 19/26 | 600 | Poppins | Card and panel headings |
| `body` / `body-strong` | 15/22 | 400 / 600 | Jakarta | Default text, table cells |
| `label` | 14/20 | 600 | Jakarta | Labels, buttons, tabs |
| `caption` | 13/18 | 500 | Jakarta | Help text, footnotes; smallest reading size |
| `badge` / `overline` | 12/16 | 700 (+0.06em uppercase for overline) | Jakarta | Badges; nav group labels and table headers |

This replaces about 40 distinct font sizes in `globals.css` (0.6rem up to `clamp(…, 4.5rem)`) with ten styles.

### Spacing, radius, elevation, layout

- **Spacing** (4px base): `space-1` 4 · `space-2` 8 · `space-3` 12 · `space-4` 16 (grid gap, phone gutter) · `space-5` 20 (card padding) · `space-6` 24 · `space-8` 32 · `space-9` 36 (desktop gutter).
- **Radius:** `radius-sm` 6 · `radius-md` 10 (nav items) · `radius-lg` 12 (controls, alerts) · `radius-xl` 16 (cards, tables, dialogs) · `radius-2xl` 18 (hero card only) · `radius-pill`.
- **Elevation:** cards use borders, not shadows. `shadow-raised` (`0 1px 2px rgba(15,35,48,.06)`) for sticky table headers; `shadow-overlay` (`0 18px 50px rgba(5,27,46,.14)`, today's `--shadow`) for dialogs, sheets, drawers and popovers only.
- **Breakpoints (3, replacing 6 between 520 and 980px):** `bp-phone` 640, `bp-drawer` 840 (keeps today's 839px sidebar→drawer switch), `bp-wide` 1200.
- **Layout grid:** 264px navy rail + fluid content with a 36px gutter; content uses a 12-column grid with 16px gaps. KPI grid: 4-up ≥1200, 2-up below 640; the hero card spans 2 of 3 columns ≥1200 and is full width below.
- **Icons:** keep `src/components/icons.tsx` conventions: 24px grid, 1.8px stroke, round caps, `currentColor`, drawn at 20px, always with a label or `aria-label`. No emoji.
- **Logo:** the Tornado logo from tornadobmc.ca (white single-ink PNG, 257×53) on navy only: 208px in the sidebar, 150px in the mobile header, beside a `CLEANOPS` tag. The asset is added to `public/` in #112, not in this documentation PR. Request the vector original from Tornado.

## 2. Components and states

Each component's full rules and live previews are in the library. Summary:

| Component | Variants and states |
|---|---|
| Navigation | Desktop rail / mobile header + drawer; item default, hover, active (`aria-current`), focus, Planned (`aria-disabled`); role-filtered list |
| Casino switcher | One casino (default on site pages), All assigned casinos (only where aggregation is valid), open listbox, static label for single-site roles |
| Section tabs | Route links in a labelled `nav`; current, hover, focus, optional real count; horizontal scroll on phones |
| KPI card | Hero, standard, loading, unavailable (em dash + rule; never `$0.00` for missing data), restricted, planned |
| Data table | Toolbar, caption, header, rows with state badges, selected row, totals `tfoot`, loading, empty, error; stacked cards below 640 |
| Filters | Search, period, state chips (`aria-pressed`), clear, live result count; never contains a casino selector; sheet on phones |
| Form field | Text, select, textarea; default, focus, help, error (`aria-invalid` + fix-it message), read-only (context-set), disabled with reason |
| Button | Primary (blue), navy (human approval/release), secondary, ghost, danger (outlined); default, hover, focus, disabled, loading (`aria-busy`) |
| Status badge | Approved, Pending human approval, Mock AI suggestion, Correction required, Restricted / Period closed, Draft, Planned · not available, Prototype · synthetic data |
| Alert | Info, success, pending, Mock AI, danger (`role="alert"`), restricted; prototype banner |
| State views | Loading skeleton, empty, error, restricted, unavailable / no fixture |
| Dialog / sheet | Confirmation for human gates (post, release, accept import, close period); bottom sheet below 640 |

**Required state variants (#111):** read-only → read-only field and Period closed badge; restricted → Restricted badge, KPI card, alert and state view naming who can grant access; pending human approval → Pending badge, alert and navy decision button; simulated/Mock AI → Mock AI badge and alert that persist until a human decision; unavailable → em-dash KPI, Planned badge and unavailable state view.

## 3. Accessibility (WCAG 2.2 AA review for these screens)

- 1.4.3 / 1.4.11 contrast: all text pairs at or above 4.5:1 and all control borders, focus rings and meaningful marks at or above 3:1, computed as tabulated above.
- 1.4.1 use of colour: every state carries words; colour is never the only signal.
- 2.4.7 / 2.4.11 focus visible and not obscured: 2px outline at 2px offset; sticky headers and the prototype banner must not cover focused elements (use `scroll-padding-top`).
- 2.5.8 target size: controls are 44px tall (phones 48px for primary), above the 24px minimum.
- 1.3.1 / 4.1.2 names and roles: real `button`, `a`, `label`, `table`/`th scope`; `aria-current` for navigation and tabs; `aria-pressed` for toggles; `aria-expanded` for the drawer; icon-only buttons have `aria-label`.
- 3.3.1 / 3.3.3 errors: field-level messages say how to fix; focus moves to the first invalid field.
- 1.4.10 reflow / 1.4.4 resize: single column at 320px CSS width and at 200% zoom; tables become stacked rows rather than two-dimensional scroll.
- Dialogs trap focus, close on Escape and return focus; the drawer keeps today's verified Escape/focus-return behaviour.
- Motion limited to drawer and dialog entrances, disabled under `prefers-reduced-motion`.

## 4. Roles, permissions and synthetic labelling

- The prototype banner/pill appears on every signed-in screen while synthetic data is shown and survives navigation.
- Navigation, section tabs and "where to go next" lists show only routes the role can open; Planned items are visibly non-interactive. The UI never grants access: server-side authorization and RLS remain the boundary.
- The casino switcher lists only server-authorized casinos; single-site roles see a static label.
- AI output is labelled Mock AI (or its real provider state) until a human approves or corrects it; approval and posting use the navy decision button and a confirmation dialog.

## 5. Example screens (trace to existing routes)

| Screen | Route / components today | Shown | Planned or placeholder |
|---|---|---|---|
| Director finance overview (desktop + 390px) | `/finance`: `finance-summary.tsx`, `finance-workspace.tsx` | Real synthetic figures from Gate A screenshot 01; one casino switcher; section tabs replace the inline link sentence | Notifications button is decorative until a notification feature exists |
| Casino detail | `/operations`: `site-portfolio.tsx`, `operations-command.tsx` | Areas, task records, eligible workers, equipment register (labels from `site-portfolio.tsx`); "Issue reported · not repaired" never implies a repair | Counts shown as `[N]`; Inspections tab marked Planned (#31); per-casino detail route is new in #112 |
| Finance Inbox review | `/finance/inbox`: `expense-inbox.tsx` | Source → reviewed fields → decision grouping; copy from the component (duplicate, receipt missing, review reason, "Suggest fields from source", "Save reviewed expense", "Reject with reason") | Values shown as placeholders; Director posting stays a separate gate |

## 6. Mapping from current CSS to components

| Current (`globals.css` / component) | Proposed component |
|---|---|
| `.appShell`, `.desktopSidebar`, `.navigationPanel`, `.navItem*`, `.mobileHeader`, `.mobileDrawer`, `.brand*`; `app-shell.tsx` | Navigation |
| Casino scope select and the second finance-summary casino select (`finance/page.tsx`, `finance-summary.tsx`) | Casino switcher (one per page) |
| Inline finance link sentence (`finance/page.tsx`) | Section tabs |
| `.financeMetricGrid`, `.opsMetrics`, `.coverageMetric`, `.reportMetrics`, `.clientMetric`, `.sitePortfolioMetrics`, `.portfolioTotals`, `.scoreValue` | KPI card |
| `.financeTable*`, `.financeLedger`, `.financeRowActions`, `.auditList` | Data table |
| `.financeForm*`, `.financeEditRow`, `.loginField`, `.messageResolutionForm` | Form field |
| `.buttonRow`, `.reviewButton`, `.mobilePrimaryButton`, `.cameraButton`, `.photoLibraryButton`, `.iconButton`, `.signOutButton`, `.loginSubmit`, `.demoReset`, `.removePhotoButton` | Button |
| `.neutralBadge`, `.coverageBadge*`, `.releaseBadge*`, `.shiftPill`, `.taskState`, `.zoneState`, `.equipmentState`, `.equipmentAssetState`, `.resolutionStatus`, `.accessState`, `.confirmedState`, `.dismissedState`, `.qualityAwaiting`, `.mockLabel`, `.prototypePill` | Status badge |
| `.prototypeBanner`, `.approvalCallout`, `.boundaryCallout`, `.reviewNotice*`, `.mobileNotice*`, `.importIssue*`, `.manualNote`, `.clientPrivacyNote`, `.privacyLabel` | Alert |
| `.emptyState`, `.mobileEmptyState`, `.portfolioEmpty`, `.reviewEmpty`, `.reportingEmpty`, `.clientReportEmpty`, `.routeLoading`, `.loadingPulse`, `.loginError` | State views |
| None today (confirmations are inline buttons) | Dialog / sheet: new |
| None today | Filters: new |

Current tokens map as: `--navy-950/900/800` → `brand-navy`, `brand-navy-900`, `brand-navy-700`; `--cyan-*` and `--focus` → retired (`brand-blue`, `focus-ring`); `--canvas`, `--surface`, `--text`, `--muted`, `--border` → `canvas`, `surface`, `ink`, `ink-muted`, `border`; `--radius` → `radius-md`/`radius-lg`; `--shadow` → `shadow-overlay`. Body text currently names Inter without loading it, so it falls back to system fonts; V2 loads its faces explicitly. Demo-only surfaces (`.rolePicker`, `.loginPage`, `.qrGraphic`) keep their behaviour and adopt tokens only.

## 7. Adoption plan

1. **#112 (first slice, on `codex/ui-preview`):** add tokens and fonts; ship Navigation, Casino switcher, Section tabs, KPI card, Status badge and State views; apply to the shell, `/finance` overview and `/operations` → casino entry. Old classes stay until each screen migrates; no service, query, schema or permission change. Verify figures match the same records before/after, and browser checks for a Director and a restricted role at desktop and 390px.
2. **#113 child issues, one per journey:** workforce/shift, evidence/review, equipment, finance inbox and approvals (after #61 contracts stabilize), incidents/reporting. Each adopts Data table, Form field, Filters, Alert and Dialog as needed.
3. Retire a legacy class only when no screen uses it. The promotion PR `codex/ui-preview` → `main` under #113 carries the release.

Not changed by this PR: finance behaviour (#61), scenario rules (#28), security and data contracts.

## Open items

- Figma library (see references above).
- Vector Tornado logo for high-density displays.
- Authenticated role-scoped screenshots of Grand Villa operations, review pair, incident timeline and released report (#110 gap) before #112 sign-off.
- Mobbin references remain unavailable (paid plan); interaction patterns follow the #110 public references.
