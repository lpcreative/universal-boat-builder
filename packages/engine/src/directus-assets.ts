function readEnv(name: string): string | undefined {
  const processLike = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return processLike?.env?.[name];
}

export function createDirectusAssetUrlResolver(
  apiBaseUrl = readEnv("DIRECTUS_API_URL") ?? readEnv("DIRECTUS_URL")
): (fileId: string) => string {
  if (!apiBaseUrl) {
    throw new Error("DIRECTUS_API_URL (or DIRECTUS_URL) is required to resolve render asset URLs.");
  }

  const base = apiBaseUrl.replace(/\/$/, "");
  return (fileId: string) => `${base}/assets/${fileId}`;
}
