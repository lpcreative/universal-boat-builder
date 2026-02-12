# Contributing Guide

This repo is designed to be **framework-first** and **contract-driven**. The fastest way to create long-term pain is to skip versioning, snapshots, and deterministic rules.

## Before you start
- Read the roadmap/spec: `docs/roadmap/universal-boat-builder-v0.3.md`
- Read AI agent guardrails: `AGENTS.md`
- Check ADRs: `docs/decisions/`

## Branching + PR workflow
- Create a short-lived branch per task.
- Keep PRs small and reviewable.
- Include a clear description of:
  - What changed
  - Why it changed
  - How to test it

## Contract-driven development
If you change any config behaviors or shapes:
- Update `packages/engine/src/model-config.ts`
- Update docs under `docs/contracts/`
- Update compiler validation (referential integrity, schema validation)
- Add/adjust tests (engine is the safety net)

## PR checklist (Definition of Done)
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Tests pass (and new tests added for changed behavior)
- [ ] No breaking change to rendering old submissions
- [ ] Docs updated (roadmap/ADR/contracts) if behavior changed
- [ ] No per-client hardcoded behavior in the shared engine

## Using Codex effectively
Codex performs best when tasks are tightly scoped and acceptance criteria are explicit.

**Recommended task template** (use in Issues):
- Context (which roadmap section / ADR)
- Scope (files/modules)
- Acceptance criteria (bullets)
- Out of scope (bullets)
- Tests expected

When Codex changes engine behavior:
- Require unit tests for the new behavior.
- Require updates to contracts/docs if any DSL/type changed.

