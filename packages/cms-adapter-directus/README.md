# @ubb/cms-adapter-directus

Directus adapter and query wrappers for reading published boat-builder authoring data.

## Required Environment Variables

Set these in your server runtime (never expose in browser bundles):

- `DIRECTUS_API_URL` (example: `http://localhost:8055`)
- `DIRECTUS_STATIC_TOKEN` (Directus static token for a read-capable service account)

## Connectivity Check

Build first:

```sh
pnpm --filter @ubb/cms-adapter-directus build
```

Run the connectivity script:

```sh
DIRECTUS_API_URL=http://localhost:8055 DIRECTUS_STATIC_TOKEN=... pnpm --filter @ubb/cms-adapter-directus directus:check
```

The script verifies published model visibility and tries to load a complete published `model_version` bundle.

Publishing visibility is controlled by `model_versions.status = "published"` (Directus built-in `status` field).

## Collections The Reader Role Must Be Able To Read

Minimum read permissions for an app reader/service account token:

- `manufacturers`
- `model_series`
- `boat_models`
- `model_versions`
- `option_groups`
- `questions`
- `options`
- `render_views`
- `layers`
- `layer_assets`
- `color_palettes`
- `colors`
- `color_areas`
- `color_selections`
- `rules`
- `directus_files` (required if file relations are resolved)
