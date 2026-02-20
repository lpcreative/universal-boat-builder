import { createDirectus, rest, staticToken } from "@directus/sdk";
import type { DirectusSchema } from "./directus-schema.js";

type ProcessLike = { env?: Record<string, string | undefined> };

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error(
      "[@ubb/cms-adapter-directus] directus-client is server-only and cannot run in the browser."
    );
  }
}

// Keep this module server-side only. It relies on a privileged static token.
function readRequiredEnv(
  processLike: ProcessLike | undefined,
  name: "DIRECTUS_API_URL" | "DIRECTUS_STATIC_TOKEN"
): string {
  assertServerOnly();
  const value = processLike?.env?.[name];
  if (!value) {
    throw new Error(
      `[@ubb/cms-adapter-directus] Missing required env var ${name}. ` +
        "Set DIRECTUS_API_URL and DIRECTUS_STATIC_TOKEN in your server runtime."
    );
  }
  return value;
}

export interface DirectusClientConfig {
  apiUrl: string;
  token: string;
}

type DirectusClient = ReturnType<typeof createDirectusClient>;

let cachedDirectusClientFromEnv: DirectusClient | null = null;

function assertConfigValue(name: "apiUrl" | "token", value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`[@ubb/cms-adapter-directus] Missing required Directus config value "${name}".`);
  }
  return value;
}

export function createDirectusClient(config: DirectusClientConfig) {
  assertServerOnly();

  return createDirectus<DirectusSchema>(assertConfigValue("apiUrl", config.apiUrl))
    .with(rest())
    .with(staticToken(assertConfigValue("token", config.token)));
}

export function createDirectusClientFromEnv(processLike?: ProcessLike) {
  const runtimeProcess =
    processLike ?? (globalThis as { process?: ProcessLike }).process;
  const apiUrl = readRequiredEnv(runtimeProcess, "DIRECTUS_API_URL");
  const token = readRequiredEnv(runtimeProcess, "DIRECTUS_STATIC_TOKEN");
  return createDirectusClient({ apiUrl, token });
}

function getCachedDirectusClientFromEnv(): DirectusClient {
  if (!cachedDirectusClientFromEnv) {
    cachedDirectusClientFromEnv = createDirectusClientFromEnv();
  }
  return cachedDirectusClientFromEnv;
}

export const directusClient: DirectusClient = new Proxy({} as DirectusClient, {
  get(_target, prop, receiver) {
    const client = getCachedDirectusClientFromEnv();
    const value = Reflect.get(client, prop, receiver);
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  }
});
