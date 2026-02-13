# Directus Schema Plan

This document defines the baseline Directus data model for the boat builder control plane and submission storage.

## Goals
- Keep runtime behavior config-driven by storing authoring data and published versions in Directus.
- Support immutable submission records tied to the exact published model version.
- Support file/document attachments per submission.
- Leave extension points for ERP/CRM/other outbound connectors.

## Naming Conventions
- Use `snake_case` for all collection and field names.
- Use singular semantic names for fields and plural names for collections.
- Use `id` as UUID primary key for all custom collections.
- Use `created_at` and `updated_at` datetime fields on all custom collections.
- Use boolean flags with `is_` prefix (`is_active`, `is_locked`).
- Use ISO currency code in `currency_code`.
- Store JSON payloads in Directus `json` fields.

## Collections And Relations (ERD Style)

```text
manufacturers (1) ----< (N) boat_models
manufacturers (1) ----< (N) model_versions
boat_models (1) ------< (N) model_versions
manufacturers (1) ----< (N) submissions
boat_models (1) ------< (N) submissions
model_versions (1) ---< (N) submissions
submissions (1) ------< (N) documents
directus_files (1) ---< (N) documents
submissions (1) ------< (N) submission_integrations   [future connector outbox]
```

## Collections

### `manufacturers`
- `id` (uuid, pk)
- `slug` (string, required)
- `name` (string, required)
- `is_active` (boolean, required, default `true`)
- `created_at` (datetime, required)
- `updated_at` (datetime, required)

Notes:
- Represents top-level tenant boundary for models/submissions.

### `boat_models`
- `id` (uuid, pk)
- `manufacturer_id` (uuid, fk -> `manufacturers.id`, required)
- `slug` (string, required)
- `name` (string, required)
- `is_active` (boolean, required, default `true`)
- `created_at` (datetime, required)
- `updated_at` (datetime, required)

Notes:
- `slug` only needs to be unique per manufacturer, not globally.

### `model_versions`
- `id` (uuid, pk)
- `manufacturer_id` (uuid, fk -> `manufacturers.id`, required)
- `model_id` (uuid, fk -> `boat_models.id`, required)
- `model_slug` (string, required, denormalized from `boat_models.slug` for fast lookup)
- `version_label` (string, required; ex: `2026-q1-v3`)
- `status` (string enum: `draft`, `published`, `archived`; required; default `draft`)
- `published_at` (datetime, nullable)
- `config` (json, required; compiled-compatible configuration payload)
- `compiled_hash` (string, nullable; hash/signature of compiled artifact)
- `is_locked` (boolean, required, default `false`)
- `created_at` (datetime, required)
- `updated_at` (datetime, required)

Notes:
- `status=published` means the version is immutable and should not be edited.
- Publish action should set both `status=published` and `published_at`.

### `submissions`
- `id` (uuid, pk)
- `manufacturer_id` (uuid, fk -> `manufacturers.id`, required)
- `model_id` (uuid, fk -> `boat_models.id`, required)
- `model_version_id` (uuid, fk -> `model_versions.id`, required)
- `submission_number` (string, optional but recommended human-readable identifier)
- `customer` (json, required)
- `dealer` (json, nullable)
- `selections` (json, required)
- `state_snapshot` (json, required; frozen runtime state at submit)
- `pricing_snapshot` (json, required; frozen line-item totals used at submit)
- `currency_code` (string, required)
- `subtotal_amount` (decimal(12,2), required)
- `total_amount` (decimal(12,2), required)
- `search_text` (text, nullable; optional denormalized searchable content)
- `created_at` (datetime, required)
- `updated_at` (datetime, required)

Notes:
- `state_snapshot` and `pricing_snapshot` preserve historical accuracy and explainable totals.
- Include `pricing_snapshot.items[]` with per-line `label`, `quantity`, `unit_amount`, `line_total_amount`, and optional `code/category`.

### `documents`
- `id` (uuid, pk)
- `submission_id` (uuid, fk -> `submissions.id`, required)
- `file_id` (uuid, fk -> `directus_files.id`, required)
- `document_type` (string, optional; ex: `quote_pdf`, `customer_upload`, `signed_order`)
- `title` (string, optional)
- `meta` (json, required, default `{}`)
- `created_at` (datetime, required)
- `updated_at` (datetime, required)

Notes:
- This is the junction table between domain submissions and `directus_files`.
- One submission can have many files; one file can be attached to multiple submissions if needed.

### `submission_integrations` (future connector support)
- `id` (uuid, pk)
- `submission_id` (uuid, fk -> `submissions.id`, required)
- `target_system` (string, required; ex: `erp`, `crm`, `dms`)
- `status` (string enum: `pending`, `sent`, `failed`, `retrying`; required)
- `payload` (json, required)
- `external_reference` (string, nullable)
- `error_message` (text, nullable)
- `attempt_count` (integer, required, default `0`)
- `last_attempt_at` (datetime, nullable)
- `created_at` (datetime, required)
- `updated_at` (datetime, required)

Notes:
- Outbox-style collection so connector workers can process submissions asynchronously.

## Required Indexes And Constraints

### Uniqueness
- `manufacturers.slug` unique.
- `boat_models` unique composite on (`manufacturer_id`, `slug`).
- `model_versions` unique composite on (`model_id`, `version_label`).
- `submissions.submission_number` unique if used.

### Publish invariants
- Partial unique index on `model_versions(model_id)` where `status = 'published'`.
- Optional stricter variant: unique composite on (`manufacturer_id`, `model_slug`) where `status = 'published'`.

### Query performance
- `boat_models(manufacturer_id, is_active)`.
- `model_versions(manufacturer_id, model_slug, status, published_at desc)`.
- `submissions(manufacturer_id, created_at desc)`.
- `submissions(model_id, created_at desc)`.
- `submissions(model_version_id, created_at desc)`.
- `documents(submission_id, created_at desc)`.
- `documents(file_id)`.
- `submission_integrations(status, created_at)`.

## ModelVersion Publish Workflow
1. Author changes in a `model_versions` record with `status=draft`.
2. Validate config against contracts before publish (`ModelConfig` + Rules DSL schema).
3. On publish:
   - Set target version `status=published`
   - Set `published_at=now()`
   - Set `is_locked=true`
4. For the same `model_id`, move previously published version to `status=archived`.
5. Prevent updates to `config` when `status` is `published` or `archived` (policy/flow/hook).

Outcome:
- Exactly one active published version per model.
- Historical submissions keep references to immutable version data.

## Submission Payload Shape (Recommended)

### `customer` JSON
- `name`
- `email`
- `phone`
- `address` (object)
- extra per-channel fields as needed

### `dealer` JSON (nullable)
- `dealer_id`
- `dealer_name`
- `rep_name`
- `rep_email`
- optional pricing tier metadata (never expose publicly)

### `selections` JSON
- Raw selected options and user inputs used to generate the final state.

### `state_snapshot` JSON
- Fully resolved/frozen configuration state used for render and pricing determinism.

### `pricing_snapshot` JSON
- `currency`
- `subtotal_amount`
- `total_amount`
- `items[]` with line-item breakdown for explainability
- optional tax/discount/shipping breakdown fields

## Document/File Handling
- Keep binary assets in `directus_files`.
- Store per-submission attachment metadata in `documents`.
- Use `document_type` for filtering generated outputs vs uploaded files.
- For generated PDFs, include in `meta`:
  - `render_key`
  - `model_version_id`
  - `generated_at`
  - `generator_version`
- Recommended cleanup policy: never delete files attached to finalized submissions.

## Mapping To `packages/cms-adapter` Types
- Adapter layer should map snake_case Directus fields to the existing TypeScript domain shape:
  - `manufacturer_id` -> `manufacturerId`
  - `model_version_id` -> `modelVersionId`
  - `published_at` -> `publishedAtISO`
  - `state_snapshot` -> `stateSnapshot`
  - etc.
- Keep this mapping isolated in `packages/cms-adapter-directus` to avoid leaking storage naming into app domain models.
