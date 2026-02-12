# ADR-0002: Config Versioning & Immutable Submissions

**Status:** Accepted  
**Date:** 2026-02-12

## Context
Boat model logic, pricing, and rendering assets will change over time. We must not break historical submissions or generated PDFs.

## Decision
- Every model has versioned configurations (`ModelVersion`).
- Publishing produces an immutable compiled artifact (compiled `ModelConfig` + manifest + validation report).
- Submissions store:
  - `modelVersionId`
  - `stateSnapshot` (frozen)
  - `computedLineItems` and totals (frozen)
  - references to output artifacts (PDF URLs, composed image URLs)

## Consequences
- Old submissions always render correctly even if pricing/logic changes.
- Admin workflow requires draft → validate → publish.
- Implementation must support cloning versions to make edits.

## Alternatives considered
- Single mutable config per model: rejected (breaks history).
- “Recompute totals on view”: rejected (can change old quotes and cause disputes).

