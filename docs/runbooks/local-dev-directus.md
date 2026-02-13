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

## Create service account and API token
1) Sign in to Directus as admin at `http://localhost:8055`.
2) Go to `Settings -> Access Control -> Roles` and create a role named `service_account`.
3) Grant only the collection permissions needed by your local app/backend:
   - read: `manufacturers`, `boat_models`, `model_versions`
   - create/read: `submissions`, `documents`
   - read/create as needed: `directus_files`
4) Go to `Settings -> User Directory` and create a user named `local-service-account` (or similar).
5) Assign the `service_account` role to that user.
6) Open the user record and generate a static token in the token section.
7) Copy the token immediately (it will be used as `DIRECTUS_TOKEN` in local env files).

## Local environment variables
Set Directus connection variables for server-side code:

1) Add to root `.env` or `.env.local` (or app-specific env file):
   - `DIRECTUS_URL=http://localhost:8055`
   - `DIRECTUS_TOKEN=<service_account_token>`
2) If running `apps/web`, place the same values in `apps/web/.env.local` if that app reads env locally.
3) Restart your dev server after setting/changing env variables.

Security notes:
- Keep `DIRECTUS_TOKEN` server-side only; do not expose it to browser bundles.
- Do not commit tokens to git.

## Ports and persistence
- Directus UI/API: `8055` (host) -> `8055` (container)
- Postgres: `5433` (host) -> `5432` (container)
- Persistent volumes:
  - `directus_postgres_data`
  - `directus_uploads`
