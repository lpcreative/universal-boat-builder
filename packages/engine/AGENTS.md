# packages/engine — AI Agent Instructions

## Purpose
This package contains the shared business logic:
- rules evaluation + stability loop
- derived values and compatibility mappings
- pricing line-item computation
- rendering layer selection
- compile/publish pipeline (compile CMS data into runtime artifacts)

## Guardrails
- All functions should be deterministic and testable.
- Avoid side effects; treat inputs as immutable.
- Do not introduce UI concerns here.
- Do not hardcode per-client behavior.

## Testing requirements
When changing engine behavior:
- add or update unit tests
- include at least one test for each new rule action/operator or pricing behavior

