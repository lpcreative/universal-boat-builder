import "server-only";

const REQUIRED_DIRECTUS_ENV_VARS = ["DIRECTUS_API_URL", "DIRECTUS_STATIC_TOKEN"] as const;

type RequiredDirectusEnvVar = (typeof REQUIRED_DIRECTUS_ENV_VARS)[number];

export type DirectusEnvCheckResult =
  | {
      ok: true;
      apiUrl: string;
      token: string;
    }
  | {
      ok: false;
      missing: string[];
    };

function readEnv(name: RequiredDirectusEnvVar): string | null {
  const value = process.env[name]?.trim();
  return value && value.length > 0 ? value : null;
}

export function checkRequiredDirectusEnv(): DirectusEnvCheckResult {
  const values: Partial<Record<RequiredDirectusEnvVar, string>> = {};
  const missing: string[] = [];

  for (const envVar of REQUIRED_DIRECTUS_ENV_VARS) {
    const value = readEnv(envVar);
    if (value) {
      values[envVar] = value;
    } else {
      missing.push(envVar);
    }
  }

  if (missing.length > 0) {
    return {
      ok: false,
      missing
    };
  }

  return {
    ok: true,
    apiUrl: values.DIRECTUS_API_URL as string,
    token: values.DIRECTUS_STATIC_TOKEN as string
  };
}
