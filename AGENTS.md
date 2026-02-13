# Boat Builder Platform — AI Agent Instructions (Codex)

> **Read this file first.** It is the highest-level guardrail for all automated coding tasks in this repo.

## Roadmap
- Follow: `docs/roadmap/universal-boat-builder-v0.3.md`
- CMS is Directus; do not add legacy CMS packages from the previous stack; admin runs via Directus (Docker/managed).
- Architectural decisions: `docs/decisions/`
- Contracts (authoritative):
  - `packages/engine/src/model-config.ts` — compiled `ModelConfig` contract (TypeScript source of truth)
  - `docs/contracts/rulesdsl.schema.json` — Rules DSL JSON Schema
  - `docs/contracts/compile-spec.md` — compile/publish spec (reference)
- Human-readable contract notes:
  - `docs/contracts/model-config.md`
  - `docs/contracts/rules-dsl.md`
  - `docs/contracts/compile-publish-pipeline.md`

## Non‑negotiable invariants
1) **Config-driven**: client/model behavior comes from configuration + assets, not per-client hardcoded logic in the engine.
2) **Versioned configs**: publishing creates an immutable `ModelVersion` artifact; only one version is active per model.
3) **Immutable submissions**: every submission stores a frozen `stateSnapshot` + `computedLineItems` and references the exact `ModelVersion` used at submission time.
4) **Deterministic rules**: rules are JSON, schema-validated, evaluated in stable order, converge via a capped stability loop.
5) **Hybrid imagery**: live preview is client-side stacking; server compositing is for final outputs (PDF/final images) and is cacheable by render key.
6) **Explainable pricing**: pricing is line-item based; totals must always have a human-readable breakdown.

## How to work in this repo
- Prefer small, reviewable PRs with clear acceptance criteria.
- Do not change contracts silently. If a config key/type changes:
  - update `packages/engine/src/model-config.ts`
  - update `docs/contracts/*` (human docs) if needed
  - update compiler validation
  - add/adjust engine tests

## Definition of Done (minimum)
- Typecheck passes
- Lint passes
- Unit tests updated/added for engine behavior changes (rules/pricing/render selection)
- No breaking changes to published submission rendering
- Docs updated when behavior changes (roadmap/ADR/contract docs as appropriate)

## Recommended task format for Codex
When opening an Issue or starting a Codex task, include:
- Context: link to roadmap section + ADRs
- Scope: what files/modules to touch
- Acceptance criteria (bullet list)
- Out of scope (bullet list)
- Tests expected
