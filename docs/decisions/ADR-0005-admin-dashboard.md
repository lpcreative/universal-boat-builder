# ADR-0005: Admin Dashboard via Directus (Control Plane)

**Status:** Accepted  
**Date:** 2026-02-12

## Context
We need an internal UI to author models, options, pricing, rules, and layer mappings efficiently.

## Decision
Use Directus to:
- model Steps → Sections → Fields → Options as nested structures
- manage media uploads (layer assets, gallery assets)
- manage draft/publish lifecycle for ModelVersions
- provide role-based access control

We will implement a **compile/publish pipeline** so runtime uses compiled artifacts, not raw CMS documents.

## Consequences
- Faster authoring with a familiar “ACF-like” workflow.
- Requires compile step validation (schema + referential integrity).
- Future improvements may include visual rule builders and layer preview tools.

## Alternatives considered
- Fully custom admin UI: deferred.
- Fully custom admin UI: deferred.

