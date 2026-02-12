# ModelConfig (Compiled Runtime Contract)

This document explains the compiled `ModelConfig` contract at a conceptual level.

**Authoritative source:** `packages/engine/src/model-config.ts`

## Purpose
`ModelConfig` is the single object the Builder UI and Engine consume at runtime. It is compiled from CMS-authored data (draft/published versions) and includes:
- steps/sections/fields/options (schema-driven UI)
- rules (validated DSL)
- pricing configuration (base + option deltas + packages + conditional line items)
- rendering config (views + layers + galleries)
- mapping tables and derived field definitions
- lookup maps for fast evaluation

## Key requirements
- IDs are stable (do not key off labels).
- All references are resolved during compile (e.g., option belongs to field).
- Compiled config is immutable once published.
- Config includes enough information to:
  - render the wizard
  - evaluate rules deterministically
  - compute pricing line items deterministically
  - select active layers deterministically

## Notes
When you add capabilities, prefer:
- adding new `FieldType` variants
- adding new `RuleAction` / `RuleCondition` operators
- keeping evaluation order deterministic and testable

