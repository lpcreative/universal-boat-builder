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

## Configurator URL Params

The configurator supports shareable deep-links on `/configurator`:

- `mv=<modelVersionId>` - target model version id for link validation
- `step=<stepId>` - active flow step id
- `book=msrp|dealer` - pricing book
- `mode=paged|all` - step presentation mode
- `s=<encodedSelections>` - compressed selections payload

Selection encoding format is deterministic:

- prefix: `v1:`
- payload: `base64url(encodeURIComponent(JSON.stringify(canonicalSelectionState)))`
- canonical selection state: sorted object keys + sorted string arrays

If decode fails, the UI safely falls back to local state/defaults.

## Reset State

- `Reset Configuration` in the configurator header:
  - clears local persisted state for the current model version
  - resets selections to server deterministic defaults
  - resets step to first step
  - resets price book to `msrp`
- If URL `mv` does not match the loaded payload, a warning panel appears with:
  - `Clear Stored State And Reload`
