import { DirectusHttpClient } from "@ubb/cms-adapter-directus";
import type { CompiledModelConfig } from "./types.js";

interface DirectusFieldMeta {
  field?: string;
}

export interface PersistCompiledResult {
  persisted: boolean;
  stored_payload: "compiled_config" | "artifact_only";
  note?: string;
}

function readEnv(name: "DIRECTUS_API_URL" | "DIRECTUS_STATIC_TOKEN"): string {
  const processLike = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const value = processLike?.env?.[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

export async function persistCompiled(
  modelVersionId: string,
  compiled: CompiledModelConfig,
  hash: string
): Promise<PersistCompiledResult> {
  const client = new DirectusHttpClient({
    baseUrl: readEnv("DIRECTUS_API_URL"),
    token: readEnv("DIRECTUS_STATIC_TOKEN")
  });

  const fields = await client.request<DirectusFieldMeta[]>({
    path: "/fields/model_versions"
  });
  const hasCompiledConfigField = fields.some((field) => field.field === "compiled_config");

  const nowIso = new Date().toISOString();
  const payload: Record<string, unknown> = {
    compiled_hash: hash,
    compiled_at: nowIso
  };

  if (hasCompiledConfigField) {
    payload.compiled_config = compiled;
  }

  await client.request<Record<string, unknown>, Record<string, unknown>>({
    method: "PATCH",
    path: `/items/model_versions/${modelVersionId}`,
    body: payload
  });

  if (hasCompiledConfigField) {
    return { persisted: true, stored_payload: "compiled_config" };
  }

  return {
    persisted: true,
    stored_payload: "artifact_only",
    note: "Field model_versions.compiled_config is missing. Compiled JSON was persisted to artifacts only."
  };
}
