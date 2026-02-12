# Rules DSL (v0)

Rules are declarative JSON structures that implement conditional logic in a deterministic, testable way.

**Schema:** `docs/contracts/rulesdsl.schema.json`  
**Runtime:** evaluated by `packages/engine` in a stability loop.

## Concepts

### Condition
A condition inspects the normalized state using operators like:
- `all`, `any`, `not`
- `eq`, `neq`, `in`
- numeric comparisons (`gt`, `lt`) as needed

### Actions
Actions mutate computed UI state and/or normalized selections in a controlled way:
- show/hide steps/sections/fields/options
- enable/disable options
- require fields
- set/clear values
- add/remove/override pricing line items

## Evaluation order
Rules are evaluated in passes and repeated until stable. A capped loop prevents infinite toggling.

## Example
```json
{
  "id": "hardtop-frame-color-visibility",
  "priority": 50,
  "when": { "all": [ { "eq": ["hardtop", true] } ] },
  "then": [
    { "action": "showField", "fieldId": "hardtop_frame_color" }
  ],
  "else": [
    { "action": "hideField", "fieldId": "hardtop_frame_color" },
    { "action": "clearField", "fieldId": "hardtop_frame_color" }
  ]
}
```

## Best practices
- Key rules off stable IDs, not display labels.
- Keep rules small and composable.
- Prefer mapping tables for compatibility matrices; let rules apply them.

