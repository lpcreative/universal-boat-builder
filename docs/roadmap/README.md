# Roadmap & Specs

This folder contains the canonical architecture and roadmap documents.

- `universal-boat-builder-v0.3.md` is the current primary spec/roadmap.
- If implementation changes the spec, update the spec and add an ADR (Architectural Decision Record) in `docs/decisions/`.

## Versioning
Keep older versions for historical reference. Prefer:
- `universal-boat-builder-v0.4.md`, `universal-boat-builder-v0.5.md`, etc.

## Source of truth
- The roadmap defines *intended behavior* and *non-negotiable invariants*.
- The engine contract (`packages/engine/src/model-config.ts`) defines the *runtime interface*.

