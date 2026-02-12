# packages/engine — Shared Engine

This package is the reusable core of the Boat Builder Platform.

## Responsibilities
- Compile authored model data into a runtime `ModelConfig`
- Validate rules, references, and invariants during publish
- Evaluate Rules DSL deterministically (stability loop)
- Compute pricing line items and totals from state
- Select active rendering layers for each view (profile/overhead)
- Provide helpers for derived fields and compatibility matrices

## Contracts
- `src/model-config.ts` is the authoritative runtime contract
- `docs/contracts/` contains human-readable guidance

## Notes
Treat this package as the product. Apps (`web`, `cms`) should be replaceable shells.

