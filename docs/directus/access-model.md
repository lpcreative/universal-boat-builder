# Directus Access Model

This document defines recommended Directus roles and collection permissions for boat builder control-plane and submissions data.

## Roles
- `admin`: internal manufacturer/admin operations role.
- `dealer`: authenticated dealer users with constrained tenant-level access.
- `public`: unauthenticated role (website visitors).
- `service_account` (recommended as a dedicated Directus user + role): server-to-server access for app APIs/workers.

## Permission Matrix (Collection Level)

Legend: `R` = read, `C` = create, `U` = update, `D` = delete.

| Collection | admin | dealer | public | service_account |
| --- | --- | --- | --- | --- |
| `manufacturers` | R,C,U,D | R | - | R |
| `boat_models` | R,C,U,D | R | R (active only) | R |
| `model_versions` | R,C,U,D | R (published only) | R (published only) | R |
| `submissions` | R,C,U,D | R,C (own tenant only) | C (optional: anonymous quote flow) | R,C,U |
| `documents` | R,C,U,D | R,C (linked submissions only) | - | R,C,U |
| `directus_files` | R,C,U,D | R,C (linked files only) | - | R,C,U |
| `submission_integrations` | R,C,U,D | - | - | R,C,U |

## Row-Level Rules (Critical)

### Tenant boundaries
- `dealer` and `service_account` access should be restricted by `manufacturer_id`.
- For `boat_models`, `model_versions`, `submissions`, `documents`, enforce filters that resolve to dealer’s allowed manufacturer(s).

### Published-only model access
- `dealer` and `public` should only see `model_versions` where `status = "published"`.
- Hide draft/archived versions from non-admin users.

### Submission immutability
- After submission is finalized, block edits to `selections`, `state_snapshot`, and `pricing_snapshot` for `dealer`.
- Prefer `service_account` updates only for operational fields (integration statuses, enrichment metadata), not pricing/config snapshots.

## Dealer Pricing Protection
- Never expose internal cost fields to `public`.
- Keep dealer-specific pricing tiers in protected data (inside `dealer` JSON or separate protected collection).
- For `public` quote flows:
  - allow create submission only with public-safe pricing output, or
  - proxy through server logic that strips restricted fields before returning results.
- In Directus field permissions:
  - deny `public` read on `dealer`, `pricing_snapshot.items` fields that encode dealer-only cost logic.
  - allow only aggregated public-safe totals when needed.

## Service Account Recommendation
- Create a dedicated Directus user for machine access (not a human admin account).
- Assign minimal custom role (`service_account`) instead of full admin.
- Use a static API token for local/server use.
- Scope permissions to required collections and tenant filters.
- Rotate token on a schedule and immediately on suspected leak.

## Recommended Server-Side Usage
- Only backend/server runtime should use `DIRECTUS_TOKEN`.
- Never expose `DIRECTUS_TOKEN` to browser clients.
- Apps/web should call internal API routes/server actions that use the token privately.
- If public reads are needed, use public role permissions or a separate read-only token with strict scope.

## Suggested Default Policies By Use Case

### Manufacturer admin console
- Runs under admin login; full CRUD on model authoring collections.

### Dealer portal
- Dealer users can:
  - read active manufacturer models and published versions
  - create submissions
  - view their own/manufacturer-scoped submissions and documents
- Dealer users cannot:
  - publish model versions
  - edit historical pricing snapshots
  - access other manufacturers' data

### Public configurator
- Read active models + published versions only.
- Optional submission creation with tightly scoped fields.
- No read access to submissions/documents after create unless explicitly designed.

### Web configurator app-reader token (required reads)
- If `@ubb/web` loads render assets directly from Directus `/assets/:id`, the token used by `DIRECTUS_STATIC_TOKEN` must have read access to:
- `boat_models`
- `model_versions`
- `version_revisions`
- `version_items`
- `items`
- `flows`
- `flow_steps`
- `flow_sections`
- `selection_groups`
- `group_options`
- `color_areas`
- `color_palettes`
- `color_palette_items`
- `render_views`
- `render_layers`
- `directus_files`
