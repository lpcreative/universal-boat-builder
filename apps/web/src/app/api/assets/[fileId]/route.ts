import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ fileId?: string }>;
}

function readRequiredEnv(name: "DIRECTUS_API_URL" | "DIRECTUS_STATIC_TOKEN"): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function errorJson(status: number, code: string, message: string): Response {
  return NextResponse.json(
    {
      error: code,
      message
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { fileId } = await context.params;
  const normalizedFileId = typeof fileId === "string" ? fileId.trim() : "";
  if (!normalizedFileId) {
    return errorJson(400, "invalid_file_id", "Asset file id is required.");
  }

  let apiUrl: string;
  let staticToken: string;
  try {
    apiUrl = readRequiredEnv("DIRECTUS_API_URL");
    staticToken = readRequiredEnv("DIRECTUS_STATIC_TOKEN");
  } catch (error) {
    const message = error instanceof Error ? error.message : "Missing Directus env vars";
    return errorJson(500, "missing_env", message);
  }

  const targetUrl = `${apiUrl.replace(/\/$/, "")}/assets/${encodeURIComponent(normalizedFileId)}`;

  let upstream: Response;
  try {
    upstream = await fetch(targetUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${staticToken}`
      },
      cache: "no-store"
    });
  } catch {
    return errorJson(502, "directus_unreachable", "Failed to fetch asset from Directus.");
  }

  if (!upstream.ok) {
    const status = upstream.status === 403 || upstream.status === 404 ? upstream.status : 500;
    const message =
      upstream.status === 403
        ? "Asset access forbidden. Check DIRECTUS_STATIC_TOKEN permissions for directus_files."
        : upstream.status === 404
          ? "Asset not found in Directus."
          : `Directus asset request failed with status ${upstream.status}.`;

    return errorJson(status, "asset_fetch_failed", message);
  }

  if (!upstream.body) {
    return errorJson(500, "empty_asset_response", "Directus returned an empty asset response body.");
  }

  const headers = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) {
    headers.set("Content-Type", contentType);
  }
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }
  const etag = upstream.headers.get("etag");
  if (etag) {
    headers.set("ETag", etag);
  }
  headers.set("Cache-Control", "no-store");

  return new Response(upstream.body, {
    status: 200,
    headers
  });
}
