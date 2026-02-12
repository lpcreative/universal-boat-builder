# ADR-0004: Rules DSL and Evaluation Order

**Status:** Accepted  
**Date:** 2026-02-12

## Context
Clients have complex conditional logic around selections. We need a reusable, debuggable approach.

## Decision
- Rules are authored as declarative JSON validated against `docs/contracts/rulesdsl.schema.json`.
- Rules are evaluated deterministically in passes:
  1) compute visibility/availability requirements
  2) enforce constraints and auto-clear invalid selections
  3) apply auto-selection / derived changes
  4) repeat until state stabilizes (capped loop)
- Rules are ordered by priority (global → client → model → version → emergency override).

## Consequences
- Predictable behavior even with complex dependencies.
- Requires a stability loop and safeguards against infinite toggling.
- Enables future “rule debugger” tooling.

## Alternatives considered
- Hardcoded logic in UI: rejected (unscalable).
- Embedding a full programming language: rejected (unsafe/overkill).

