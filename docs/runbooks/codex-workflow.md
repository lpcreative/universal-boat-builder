# Codex Workflow Runbook

This runbook describes how to use Codex to accelerate development without drifting from the roadmap.

## Guardrails
- Codex must follow `AGENTS.md` and the roadmap: `docs/roadmap/universal-boat-builder-v0.3.md`
- Any change to contracts requires updating:
  - `packages/engine/src/model-config.ts`
  - relevant docs in `docs/contracts/`
  - compiler validation + tests

## Best practice loop
1) Create an Issue with a clear task + acceptance criteria.
2) Create a branch.
3) Run Codex on one task at a time (keep scope small).
4) Review diffs carefully.
5) Run tests/CI locally.
6) Commit and open PR.

## Good Codex task prompt format
- Context: which roadmap section and ADR(s)
- Scope: files/directories
- Acceptance criteria (bullets)
- Out of scope (bullets)
- Tests expected

## Examples
- “Implement rules schema validation in compiler; add tests for invalid rules.”
- “Add layer selection function: given state + layers return active layers sorted by z-index; add tests.”

