import { createDirectus, rest, staticToken } from "@directus/sdk";
import type { DirectusSchema } from "./directus-schema.js";

function assertServerOnly(): void {
  if (typeof window !== "undefined") {
    throw new Error(
      "[@ubb/cms-adapter-directus] directus-client is server-only and cannot run in the browser."
    );
  }
}

// Keep this module server-side only. It relies on a privileged static token.
function readRequiredEnv(name: "DIRECTUS_API_URL" | "DIRECTUS_STATIC_TOKEN"): string {
  assertServerOnly();
  const processLike = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const value = processLike?.env?.[name];
  if (!value) {
    throw new Error(
      `[@ubb/cms-adapter-directus] Missing required env var ${name}. ` +
        "Set DIRECTUS_API_URL and DIRECTUS_STATIC_TOKEN in your server runtime."
    );
  }
  return value;
}

function createConfiguredClient() {
  const directusApiUrl = readRequiredEnv("DIRECTUS_API_URL");
  const directusStaticToken = readRequiredEnv("DIRECTUS_STATIC_TOKEN");

  return createDirectus<DirectusSchema>(directusApiUrl)
    .with(rest())
    .with(staticToken(directusStaticToken));
}

let cachedClient: ReturnType<typeof createConfiguredClient> | null = null;

export function getDirectusClient(): ReturnType<typeof createConfiguredClient> {
  if (cachedClient) {
    return cachedClient;
  }
  cachedClient = createConfiguredClient();
  return cachedClient;
}
