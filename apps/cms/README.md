# apps/cms — Payload CMS (Next.js)

This package hosts the Payload CMS v3 admin and API on top of Next.js.

## Environment

Copy `.env.example` to `.env.local` and set:

- `DATABASE_URL`
- `PAYLOAD_SECRET`
- `NEXT_PUBLIC_SERVER_URL`

## Local database

Postgres is provided in `docker/compose.yml`.

```bash
cd docker
docker compose up -d postgres
```

Default local connection:

```text
postgresql://boatbuilder:boatbuilder@localhost:5432/boatbuilder
```

## Run

```bash
corepack pnpm install
corepack pnpm --filter @ubb/cms dev
```

Open `http://localhost:3001/admin`.
