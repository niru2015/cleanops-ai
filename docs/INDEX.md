# Context router

Read AGENTS + this map + issue first. Then select the smallest row that fits.
Paths below are relative to `docs/`. Follow linked security/integration details only when relevant.

| Task | Read | Canonical responsibility |
|---|---|---|
| Scope / feature acceptance | [PRODUCT](PRODUCT.md), [ROADMAP](plans/ROADMAP.md) | What and when |
| Business states / workflow | [DOMAIN](DOMAIN.md) | Terms, transitions, metrics |
| Scaffold / boundaries | [ARCHITECTURE](ARCHITECTURE.md) | Stack, placement, execution |
| Database / authorization | [DATA_MODEL](DATA_MODEL.md), [SECURITY](SECURITY.md), [SUPABASE](integrations/SUPABASE.md) | Relationships and access |
| Table/field business meaning | [DATA_DICTIONARY](DATA_DICTIONARY.md) | Current implemented data dictionary |
| Page/query/write mapping | [DATA_MAPPING](DATA_MAPPING.md) | UI/module to tables, columns, RPCs and transformations |
| End-to-end process flow | [PROCESS_FLOWS](PROCESS_FLOWS.md) | Multi-step persistence, state transitions and human gates |
| Message / media ingestion | [WHATSAPP](integrations/WHATSAPP.md), [DOMAIN](DOMAIN.md), [SECURITY](SECURITY.md) | Durable ingestion contract |
| AI / evaluation | [AI](AI.md), [OPENAI](integrations/OPENAI.md) | Suggestions, budgets, fallback |
| Demo / UI | [DEMO](DEMO.md), [GATE_A_FINANCE_TRAINING](demo/GATE_A_FINANCE_TRAINING.md), [GATE_A_FINANCE_PROCESS_FLOWS](demo/GATE_A_FINANCE_PROCESS_FLOWS.md), [DATA_FACTORY](demo/DATA_FACTORY.md), [TORNADO_FINANCE_REHEARSAL](demo/TORNADO_FINANCE_REHEARSAL.md), [FINANCE_UAT](demo/FINANCE_UAT.md), [GATE_A_EXECUTION](demo/GATE_A_EXECUTION.md), [DOMAIN](DOMAIN.md) | Synthetic scenario, screenshot-led presenter training, implemented finance process flows, generator, UAT and release evidence |
| UI research | [UX_AUDIT_110](UX_AUDIT_110.md) | Journey friction, screenshot evidence, reference patterns and first design slice |
| Tornado recording | [TORNADO_DEMO](../TORNADO_DEMO.md), [RECORDING_UAT](demo/TORNADO_RECORDING_UAT.md), [NARRATION](demo/TORNADO_NARRATION.md), [CANVA_HANDOFF](demo/TORNADO_CANVA_HANDOFF.json) | Read-only browser recording, evidence and presentation handoff |
| Architecture change | relevant [ADR](adr/README.md) plus affected spec | Decision and rationale |

## Context budget

Target AGENTS + INDEX below 1,200 words; normal issue adds 1–3 focused documents.
Do not load all three data-reference files by default:
- schema/field question -> DATA_DICTIONARY;
- page/query/write question -> DATA_MAPPING;
- workflow/state-transition question -> PROCESS_FLOWS.

Do not reread unchanged files during the same task. Do not load every integration or completed
plan by default. Use issue IDs and paths in prompts; store durable decisions in the repository.

## Sources of truth

Product scope: PRODUCT; states/metrics: DOMAIN; logical relationships: DATA_MODEL.
For implemented behavior, migrations own exact SQL/schema/RLS/RPCs, code owns page/service behavior,
and tests own executable examples. DATA_DICTIONARY, DATA_MAPPING and PROCESS_FLOWS are agent-oriented
implementation maps and must be updated when their referenced data path changes.

Generated references are created only from real code/migrations, with command and revision; never
invent a schema dump. See [generated policy](generated/README.md). Resolve contradictions explicitly
in the affected canonical document and ADR rather than silently following stale prose.
