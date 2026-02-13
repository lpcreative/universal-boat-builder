# Contracts

Contracts define the stable interfaces between:
- Admin-authored configs (Directus control plane)
- Compiled runtime configs (Engine)
- Builder UI rendering
- Submission storage and output generation

## Authoritative sources
- `packages/engine/src/model-config.ts` — TypeScript contract used by code
- `docs/contracts/rulesdsl.schema.json` — JSON Schema for Rules DSL
- `docs/contracts/compile-spec.md` — compile/publish spec reference

## Human-readable docs
- `model-config.md`
- `rules-dsl.md`
- `compile-publish-pipeline.md`

## When to update contracts
Update contracts when:
- A new field type is added
- Rules DSL gains new operators/actions
- Pricing or rendering semantics change
- Compile/publish pipeline changes

Do not ship contract changes without updating:
- compiler validation
- engine tests
- roadmap/ADRs as appropriate

