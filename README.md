<<<<<<< HEAD
# universal-boat-builder
Universal Boat Builder is a configurable rules-driven engine for powering marine product configurators. It compiles structured model definitions and conditional logic into validated, publishable artifacts for use in web, dealer, and eCommerce applications.
=======
# Universal Boat Builder Platform

A **config-driven, multi-tenant boat configurator** that can be tailored for any client (Prodigy, Phoenix, etc.) without rewriting core logic.

## What this repo is building

### Core concept
**Config → Engine → Outputs**

- **Config** (per client/model/version): steps/fields/options, rules, pricing, rendering layers, preview galleries
- **Engine** (shared): rules evaluation, derived values, pricing line items, layer selection, validation, snapshotting
- **Outputs** (shared): PDF quote + build sheet; server-composited final images (hybrid approach)

## Key invariants (do not break)
- Config-driven behavior (no per-client hardcoding)
- Versioned published model configs
- Immutable submissions (frozen snapshot + computed line items)
- Deterministic rules engine with stability loop
- Hybrid imagery (client stack, server composite on submit/PDF)
- Explainable pricing (line-item breakdown)

See the roadmap/spec:
- `docs/roadmap/universal-boat-builder-v0.3.md`

## Repo layout

- `apps/web/` — Next.js builder UI (public configurator)
- `apps/admin/` — Directus control plane (Docker or managed) for model/rule/layer authoring
- `packages/engine/` — shared engine (rules, pricing, compile pipeline, selection)
- `docs/` — roadmap, contracts, ADRs, runbooks
- `.github/` — PR/issue templates + Codex prompts
- `docker/` — local infra helpers (postgres, optional object storage)

## Getting started (initial setup)
This repo scaffold focuses on **structure + contracts** first.

Recommended prerequisites (adjust to your team):
- Node.js LTS
- pnpm (or your package manager of choice)
- Docker (for local Postgres)

Next steps:
1) Read `docs/roadmap/universal-boat-builder-v0.3.md`
2) Follow `docs/runbooks/local-dev.md` to wire local services
3) Implement the engine first (`packages/engine`) before UI polish

## Contributing
See `CONTRIBUTING.md`.

>>>>>>> da7389b (Initial commit: scaffold + roadmap + contracts)
