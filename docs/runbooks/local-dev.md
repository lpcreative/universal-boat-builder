# Local Development Runbook

This runbook is a starting point and can be refined once tooling choices are finalized.

## Recommended local services
- PostgreSQL (required)
- Optional: MinIO (S3-compatible) for local object storage

## Setup steps (suggested)
1) Install Node.js LTS
2) Install your package manager (pnpm recommended for monorepos)
3) Install Docker Desktop
4) Copy env file:
   - create `.env.local` for apps as needed (or `.env` at repo root if you prefer)
5) Start services:
   - `docker compose -f docker/compose.yml up -d`

## Next.js (web app)
- Start dev server in `apps/web`
- Confirm it can load a compiled `ModelConfig` fixture from the engine

## Directus admin (control plane)
- Start Directus (Docker or managed service)
- Confirm it can connect to Postgres and upload media

## Notes
- Keep CMS authoring separate from runtime compiled configs.
- Runtime should consume compiled artifacts (by version), not raw CMS data.

