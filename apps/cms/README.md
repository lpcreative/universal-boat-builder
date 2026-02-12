# apps/cms — Admin Dashboard (Payload CMS)

This app hosts the internal admin UI used to:
- create clients, models, model versions (draft/published)
- author steps/sections/fields/options
- manage pricing data
- manage rendering layers and preview galleries
- author rules JSON (v0) and later visual builders

## Runtime vs authoring
The CMS stores authoring data. Runtime must use compiled artifacts produced by the compiler/publish pipeline.

