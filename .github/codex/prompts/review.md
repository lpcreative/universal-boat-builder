# Codex Review Prompt

Review this PR for:
- Alignment with `AGENTS.md` and `docs/roadmap/universal-boat-builder-v0.3.md`
- Contract correctness (`packages/engine/src/model-config.ts`, `docs/contracts/rulesdsl.schema.json`)
- Determinism in rules/pricing/render selection
- Versioning + immutable submission guarantees
- Adequate tests for engine behavior changes
- No per-client hardcoded logic in shared engine

In your review, include:
- Any spec/contract mismatches
- Any missing tests
- Any risks to backward compatibility for published submissions

