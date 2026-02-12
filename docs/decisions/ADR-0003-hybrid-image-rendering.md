# ADR-0003: Hybrid Image Rendering (Client Stack + Server Composite)

**Status:** Accepted  
**Date:** 2026-02-12

## Context
Users need immediate visual feedback while selecting options. Final outputs (PDFs/build sheets) need a stable composed image.

## Decision
- Live preview: client-side stacking of transparent PNG/WebP layers (per view: profile/overhead).
- Final outputs: server-side compositing (Sharp) triggered on submit and/or PDF generation.
- Compositing is cached via a deterministic render key based on:
  - modelVersionId
  - view
  - normalized state snapshot
  - asset fingerprints

## Consequences
- UI is responsive without chatty server calls.
- Server load is controlled and cacheable.
- Layer selection must be deterministic and reproducible.

## Alternatives considered
- Server compositing on every click: rejected (latency, cost).
- Client-only compositing for PDFs: rejected (inconsistent outputs, hard to guarantee).

