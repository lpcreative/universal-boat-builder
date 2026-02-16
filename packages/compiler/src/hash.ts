import { createHash } from "node:crypto";
import type { CompiledModelConfig } from "./types.js";

type CanonicalValue = null | boolean | number | string | CanonicalValue[] | { [key: string]: CanonicalValue };

function canonicalize(value: unknown): CanonicalValue {
  if (value === null) {
    return null;
  }
  if (typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return null;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => canonicalize(item));
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, nested]) => nested !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    const obj: { [key: string]: CanonicalValue } = {};
    for (const [key, nested] of entries) {
      obj[key] = canonicalize(nested);
    }
    return obj;
  }
  return null;
}

function normalizeForHash(compiled: CompiledModelConfig): CompiledModelConfig {
  return {
    ...compiled,
    metadata: {
      ...compiled.metadata,
      compiled_at: null,
      compiled_hash: ""
    }
  };
}

export function hashCompiledConfig(compiled: CompiledModelConfig): string {
  const normalized = normalizeForHash(compiled);
  const canonical = canonicalize(normalized);
  const json = JSON.stringify(canonical);
  return createHash("sha256").update(json).digest("hex");
}
