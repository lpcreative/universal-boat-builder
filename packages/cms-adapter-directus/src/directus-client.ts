import { createDirectus, rest, staticToken } from "@directus/sdk";
import type { DirectusSchema } from "./directus-schema.js";

// Keep this module server-side only. It relies on a privileged static token.
function readRequiredEnv(name: "DIRECTUS_API_URL" | "DIRECTUS_STATIC_TOKEN"): string {
  const processLike = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  const value = processLike?.env?.[name];
  if (!value) {
    throw new Error(`${name} is required to initialize the Directus client`);
  }
  return value;
}

const directusApiUrl = readRequiredEnv("DIRECTUS_API_URL");
const directusStaticToken = readRequiredEnv("DIRECTUS_STATIC_TOKEN");

export const directusClient = createDirectus<DirectusSchema>(directusApiUrl)
  .with(rest())
  .with(staticToken(directusStaticToken));
