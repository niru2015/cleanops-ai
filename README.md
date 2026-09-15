# CleanOps AI — Phase-0 context pack

A repo-ready specification for commercial cleaning operations in casinos and other
24/7 facilities. Principle: digitize the existing workflow before replacing it.

**Status:** documentation and GitHub roadmap only. No application, database, live
WhatsApp connection, OpenAI calls, deployment or customer onboarding exists yet.

Start with [AGENTS.md](AGENTS.md) and [docs/INDEX.md](docs/INDEX.md).
Build order and gates: [ROADMAP](docs/plans/ROADMAP.md).
First ready-to-use issue: [CLEAN-001](docs/plans/active/CLEAN-001.md).

## Start development

1. Open this repository as a Codex project.
2. Begin with GitHub issue CLEAN-001. Prompt: “Implement CLEAN-001 using AGENTS.md
   and its Read list. Stop after the issue's acceptance criteria; report verification.”
3. Complete the foundation before the evidence slice. Keep each PR limited to one issue.

Repository: https://github.com/niru2015/cleanops-ai (private).
The local parent Vancouver project is a synced mirror, so this CleanOps folder remains
separate from it.

## Provenance and decision status

Source: user-provided “Research casino cleaning systems” conversation,
ID `6aa8e316-0e4c-83e8-ad13-1f4169e500fe`, retrieved 2026-09-14.
The full available recent planning answer and bounded prototype specification informed
this pack; older long answers were truncated by the conversation reader.
This is a compressed implementation baseline, not a verbatim research archive.
Business claims about Tornado, regulations, API availability and vendor prices are not
validated customer requirements. Demo organizations, people and performance are synthetic.
Accepted ADRs mean this pack's initial design baseline; no customer/legal approval implied.

Phase ordering, role boundaries, retry limits and demo arithmetic are explicit design
choices to make the first build executable. Pilot-dependent decisions remain open in the roadmap.
