# ADR 014: UX system V2 tokens, typefaces and component primitives

Status: Proposed, 2026-09-25 (issue #111; accepted when merged into `codex/ui-preview`).

## Context

The #110 audit found inconsistent hierarchy, two competing casino selectors and no shared components: `globals.css` holds 210 hand-written classes in 1,805 lines, about 40 distinct font sizes and 6 breakpoints, and names Inter without loading it. The owner approved a Tornado-branded direction (navy rail, light work area, Tornado navy/red/blue from tornadobmc.ca). #111 asks for a decision on Geist and shadcn/ui against Next.js 16, React 19 and Tailwind 4, without a wholesale migration.

## Decision

- **Tokens** are CSS custom properties in `src/app/globals.css`, exposed to Tailwind 4 through `@theme`, named as in [UX_SYSTEM_V2](../design/UX_SYSTEM_V2.md). Components read tokens, never raw hex values.
- **Typefaces:** Poppins (Tornado's brand face) for display and figures, Plus Jakarta Sans for UI text, both self-hosted through `next/font/google`. Geist is not adopted: it would add a third face unrelated to the Tornado brand.
- **Primitives:** shadcn/ui is adopted **selectively** as source-owned code, only for components that need robust accessible behaviour: Dialog/Sheet, Select/Popover (casino listbox) and DropdownMenu. Each copied component is restyled with V2 tokens and reviewed like our own code. Simple components (Button, Badge, KPI card, Alert, Table, State views, Navigation) are written directly with tokens and semantic HTML. No other UI kit is added.
- Adoption is incremental per #112/#113 slice; legacy classes are removed only when unused.

## Alternatives

- Full shadcn/ui migration: fastest visual uniformity, but rewrites every screen at once against the "no wholesale migration" boundary and risks Finance MVP behaviour.
- Keep hand-written CSS only: no new dependencies, but dialogs, listboxes and menus would re-implement focus management and keyboard behaviour that tested headless primitives already handle.
- Geist + neutral palette: modern, but loses the Tornado brand the owner approved.

## Consequences and revisit trigger

Adds the headless primitive packages shadcn/ui depends on only for the adopted components; each must pass lint, typecheck, tests, build and browser keyboard checks in its slice. Two self-hosted web fonts add download weight; load only the weights in the type scale (Poppins 600, Plus Jakarta Sans 400/500/600/700), Latin subset, `display: swap`. Revisit if bundle budgets are exceeded, if Tornado supplies different brand typography, or if more than half the components end up copied from shadcn/ui (then consider adopting it fully).
