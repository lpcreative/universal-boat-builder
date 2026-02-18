# apps/web

Minimal Next.js app for the v0 configurator.

## Required environment variables (server-side)

- `DIRECTUS_API_URL` - Directus API base URL (for example `http://localhost:8055`)
- `DIRECTUS_STATIC_TOKEN` - Directus static token used by server-side adapter calls
- `MODEL_VERSION_ID` (optional) - force a specific published `model_versions.id`

Important:
- Do not expose `DIRECTUS_STATIC_TOKEN` in client code.
- Only `NEXT_PUBLIC_*` variables are browser-visible in Next.js. This app intentionally uses server-only env vars.

## Run

```bash
pnpm install
pnpm -r typecheck
DIRECTUS_API_URL=http://localhost:8055 DIRECTUS_STATIC_TOKEN=your_token pnpm --filter apps/web dev
```

Optional forced version:

```bash
DIRECTUS_API_URL=http://localhost:8055 DIRECTUS_STATIC_TOKEN=your_token MODEL_VERSION_ID=your_model_version_id pnpm --filter apps/web dev
```
