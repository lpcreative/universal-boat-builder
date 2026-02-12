# Compile & Publish Pipeline (Summary)

This document summarizes the compile/publish pipeline described in:
- `docs/contracts/compile-spec.md` (reference spec)
- `packages/engine/src/compiler.ts` (compiler skeleton)

## Why compile?
CMS documents are designed for authoring; runtime needs:
- stable ordering
- fast lookup maps
- resolved references
- validated rules
- deterministic rendering and pricing behavior

## Draft → Publish lifecycle
1) Draft edits (CMS)
2) Validate (schema + referential integrity + business rules)
3) Compile to immutable `ModelConfig` artifact
4) Persist artifacts:
   - compiled config JSON
   - asset manifest
   - validation report
   - content hash
5) Publish (make version active)
6) Submissions reference published version (immutable)

## Validation gates (minimum)
- Rules validate against JSON schema
- Every referenced field/option exists and belongs to its parent
- No duplicate IDs in a version
- Required defaults and base pricing exist
- Layer references point to valid assets
- Stability loop safeguards: detect toggling patterns where possible

