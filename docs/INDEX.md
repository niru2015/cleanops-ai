# Context router

Read AGENTS + this map + issue first. Then select the smallest row that fits.
Paths below are relative to `docs/`. Follow linked security/integration details only when relevant.

| Task | Read | Canonical responsibility |
|---|---|---|
| Scope / feature acceptance | [PRODUCT](PRODUCT.md), [ROADMAP](plans/ROADMAP.md) | What and when |
| Business states / workflow | [DOMAIN](DOMAIN.md) | Terms, transitions, metrics |
| Scaffold / boundaries | [ARCHITECTURE](ARCHITECTURE.md) | Stack, placement, execution |
| Database / authorization | [DATA_MODEL](DATA_MODEL.md), [SECURITY](SECURITY.md), [SUPABASE](integrations/SUPABASE.md) | Relationships and access |
| Message / media ingestion | [WHATSAPP](integrations/WHATSAPP.md), [DOMAIN](DOMAIN.md), [SECURITY](SECURITY.md) | Durable ingestion contract |
| AI / evaluation | [AI](AI.md), [OPENAI](integrations/OPENAI.md) | Suggestions, budgets, fallback |
| Demo / UI | [DEMO](DEMO.md), [DOMAIN](DOMAIN.md) | Synthetic scenario and states |
| Architecture change | relevant [ADR](adr/README.md) plus affected spec | Decision and rationale |

## Context budget

Target AGENTS + INDEX below 1,200 words; normal issue adds 1–3 focused documents.
This is a reading budget, not a measured tokenizer guarantee. Do not reread unchanged
files during the same task. Do not load every integration or completed plan by default.
Use issue IDs and paths in prompts; store durable decisions in the repository.

## Sources of truth

Product scope: PRODUCT; states/metrics: DOMAIN; logical relationships: DATA_MODEL.
Once implemented, migrations own exact SQL, schemas own API/AI shapes, tests own executable
examples. Update the corresponding doc when behavior changes. Generated references are
created only from real code/migrations, with command and revision; never invent a schema dump.
See [generated policy](generated/README.md). Resolve contradictions explicitly in the affected
canonical document and ADR rather than silently following stale prose.
