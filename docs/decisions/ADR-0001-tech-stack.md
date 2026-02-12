# ADR-0001: Tech Stack and Repo Structure

**Status:** Accepted  
**Date:** 2026-02-12

## Context
We need a standalone, reusable boat builder platform that can serve multiple clients and models with different logic trees and pricing.

The system must support:
- Config-driven multi-step form UX
- Deterministic conditional logic
- Real-time pricing
- Layered image preview (client-side) + server compositing for PDFs
- Admin dashboard for building configs and mapping assets
- Versioning and immutable submissions

## Decision
Adopt a JavaScript/TypeScript-first stack aligned with the team's skills:

- Frontend: Next.js (React) + TypeScript
- Admin/CMS: Payload CMS (Node/TS) for ACF-like model authoring
- DB: PostgreSQL
- Assets: S3-compatible object storage (local dev may use MinIO)
- Server compositing: Sharp
- PDF generation: HTML → PDF via headless Chromium (Playwright/Puppeteer)

Repo is a monorepo:
- `apps/web`: builder UI
- `apps/cms`: admin dashboard
- `packages/engine`: shared rules/pricing/render selection/compile pipeline

## Consequences
- Shared engine enables reuse across clients.
- Payload reduces custom admin build time, but we still need compile/publish gates.
- Strong TypeScript contracts reduce drift.

## Alternatives considered
- Keep WordPress + ACF + Fluent Forms: rejected (not standalone, hard to productize).
- Fully custom admin UI from scratch: possible later; rejected for v0 due to timeline.
- Strapi/Directus: viable; Payload chosen for TS-first dev ergonomics.

