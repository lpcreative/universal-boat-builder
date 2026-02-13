// packages/engine/src/compiler/compile-model-version.ts
//
// Skeleton: Draft (Directus control plane) -> Compiled ModelConfig artifact
//
// Notes:
// - Keep this pure/deterministic: same inputs => same outputs.
// - All ordering should be stable (order fields, then id as tie-breaker).
// - Reject invalid references at compile time (publish must be gated).

import type { ModelConfig } from "./model-config.js";

export interface AssetManifest {
  layersByView: Record<string, Array<{ layerId: string; assetUrl: string }>>;
  galleries: Array<{ galleryId: string; mediaUrls: string[] }>;
}

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: ValidationSeverity;
  message: string;
  pointer?: string; // e.g., 'steps[2].sections[0].fields[3].options[1]'
  entity?: { type: string; id: string };
}

export interface ValidationReport {
  ok: boolean;
  issues: ValidationIssue[];
  summary: {
    errors: number;
    warnings: number;
  };
}

export interface CompileResult {
  compiled: ModelConfig;
  manifest: AssetManifest;
  hash: string;
  report: ValidationReport;
}

/**
 * Generic compile context.
 * You can replace the `unknown` types with your Directus collection types.
 */
export interface CompileContext {
  client: unknown;
  model: unknown;
  modelVersionDraft: unknown;
  assets: unknown[];
}

/**
 * Compile a draft model version into a single runtime artifact.
 * This should be invoked on publish (or on-demand for preview).
 */
export function compileModelVersion(ctx: CompileContext): CompileResult {
  // 1) Load and validate draft data (structural + referential integrity)
  const report: ValidationReport = { ok: true, issues: [], summary: { errors: 0, warnings: 0 } };

  // TODO: validate rules against JSON Schema (Appendix D)
  // TODO: validate references (field/option ownership, layer assets exist, etc.)

  // If errors, return early with ok=false and no publish.
  // In a real implementation you might throw and let the caller capture issues.
  if (!report.ok) {
    return {
      compiled: {} as ModelConfig,
      manifest: { layersByView: {}, galleries: [] },
      hash: '',
      report,
    };
  }

  // 2) Normalize data
  // TODO: stable ordering, ID maps, default state, mappings, etc.

  // 3) Produce compiled config
  const compiled = {} as ModelConfig;

  // 4) Build asset manifest (used for preloading and validation)
  const manifest: AssetManifest = { layersByView: {}, galleries: [] };

  // 5) Compute deterministic hash/signature
  // TODO: hash(compiled JSON + referenced asset version IDs)
  const hash = '';

  return { compiled, manifest, hash, report };
}
