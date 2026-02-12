# Boat Builder Compile Step & Publish Pipeline (v0)

This file is a repo-friendly companion to the main roadmap document.
It describes how we compile editable CMS data (Payload) into a single, immutable runtime artifact (`ModelConfig`)
and how publishing should be gated and versioned.

## Goals

- **Deterministic runtime payload**: identical draft inputs produce identical compiled output.
- **Runtime performance**: Builder loads *one* compiled config payload (plus assets) rather than many relational queries.
- **Safety**: invalid rules, broken references, or missing assets cannot be published.
- **Historical accuracy**: published versions are immutable; submissions reference a specific published version.

## Terms

- **Draft ModelVersion**: editable version in Payload.
- **Published ModelVersion**: immutable, compiled, served to public builder.
- **Compiled ModelConfig**: single JSON payload used by the Builder UI and Engine.

## Pipeline overview

Draft -> Validate -> Compile -> Hash -> Persist artifacts -> Publish (lock) -> Serve (cached)

## Validation stages (publish must fail on any blocking error)

1) **Structural**
- Required fields exist (steps/sections/fields/options)
- Rules validate against JSON Schema (`Boat_Builder_RulesDSL_v0.schema.json`)

2) **Referential integrity**
- Rules reference existing `stepId/sectionId/fieldId/optionId`
- `optionId` belongs to the referenced `fieldId`
- Layer assets exist
- Gallery IDs exist

3) **Uniqueness & stability**
- Unique IDs within a version (steps/sections/fields/options/layers)
- Stable ordering: explicit `order` then stable tie-breaker (id)

4) **Rule safety**
- Unknown operators/actions rejected
- Illegal targets rejected (e.g., setValue on non-existent field)
- Optional smoke-test: run the rule loop against a small set of sample states and ensure convergence within N iterations

5) **Pricing**
- Prices are numeric and currency is defined
- Package includes refer to valid options
- Line-item IDs are unique

6) **Rendering**
- Views have valid dimensions
- Layers have deterministic z ordering
- (Optional) “exclusive layer groups” are well formed (no multiple active layers in group for the same state unless allowed)

## Normalization (draft -> runtime)

- Runtime keys use **stable IDs**, never labels.
- Sort everything deterministically (order + id).
- Build O(1) lookup maps:
  - `fieldsById`, `optionsById`, `stepsById`, `optionsByFieldId`
- Compute **default state** from defaults and base selections.
- Compile compatibility mappings into fast lookup tables.
- Group layers by view and keep predicates in normalized `ConditionExpr` form.

## Outputs (persisted artifacts)

For each published ModelVersion:

- `compiledModelConfig` (JSON)
- `assetManifest` (by view, type: layer/gallery)
- `validationReport` (warnings/errors + summary)
- `compiledHash` (hash of compiled JSON + referenced asset version IDs)

## Serving and caching

- Serve `compiledModelConfig` from an endpoint with **ETag** = `compiledHash`.
- For assets, prefer immutable URLs (filename includes content hash) and CDN cache.
- For server compositing, compute:
  `renderKey = hash(modelVersionId + viewId + normalizedState + compiledHash)`

## Publish rules

- Published versions are **immutable**.
- To modify pricing/logic/assets: **clone** published -> new draft -> edit -> validate -> publish.

## Suggested engine package layout

- `packages/engine/src/model-config.ts`
- `packages/engine/src/compiler/*`
- `packages/engine/src/rules/*`
- `packages/engine/src/pricing/*`
- `packages/engine/src/render/*`

