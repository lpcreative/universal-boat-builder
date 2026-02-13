# Local Directus Dev Runbook

This runbook starts a local Directus + PostgreSQL stack for admin authoring and submissions management.

## Prerequisites
1) Docker Desktop (or Docker Engine + Compose plugin)
2) Repo dependencies installed (`pnpm install`)

## One-time setup
1) Copy the env template:
   - `cp docker/.env.directus.example docker/.env.directus`
2) Set `DIRECTUS_KEY` and `DIRECTUS_SECRET` in `docker/.env.directus` to unique random values.

## Start stack
- `docker compose -f docker/compose.directus.yml --env-file docker/.env.directus up -d`
- Or with repo scripts: `pnpm directus:up`

## Stop stack
- `docker compose -f docker/compose.directus.yml --env-file docker/.env.directus down`
- Or with repo scripts: `pnpm directus:down`

## View logs
- `docker compose -f docker/compose.directus.yml --env-file docker/.env.directus logs -f`
- Or with repo scripts: `pnpm directus:logs`

## Access Directus
- Open `http://localhost:8055`

## First-time admin creation
1) Open `http://localhost:8055`
2) Directus onboarding prompts for the first admin user.
3) Enter email/password and complete setup.

## Ports and persistence
- Directus UI/API: `8055` (host) -> `8055` (container)
- Postgres: `5433` (host) -> `5432` (container)
- Persistent volumes:
  - `directus_postgres_data`
  - `directus_uploads`
