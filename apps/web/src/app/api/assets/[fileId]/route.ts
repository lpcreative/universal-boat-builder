import { NextResponse } from "next/server";

function readRequiredEnv(name: "DIRECTUS_API_URL" | "DIRECTUS_STATIC_TOKEN"): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

export async function GET(_: Request, context: { params: { fileId: string } }): Promise<Response> {
  const fileId = context.params.fileId?.trim();
  if (!fileId) {
    return NextResponse.json({ error: "Missing file id" }, { status: 400 });
  }

  let apiUrl: string;
  let staticToken: string;
  try {
    apiUrl = readRequiredEnv("DIRECTUS_API_URL");
    staticToken = readRequiredEnv("DIRECTUS_STATIC_TOKEN");
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Missing Directus configuration" },
      { status: 500 }
    );
  }

  const upstreamUrl = `${apiUrl.replace(/\/+$/, "")}/assets/${encodeURIComponent(fileId)}`;
  const upstreamResponse = await fetch(upstreamUrl, {
    headers: {
      Authorization: `Bearer ${staticToken}`
    },
    cache: "force-cache"
  });

  if (!upstreamResponse.ok) {
    const message =
      upstreamResponse.status === 403
        ? "Asset access forbidden. Check DIRECTUS_STATIC_TOKEN permissions for directus_files."
        : `Asset fetch failed with status ${upstreamResponse.status}`;
    return NextResponse.json({ error: message }, { status: upstreamResponse.status });
  }

  const contentType = upstreamResponse.headers.get("content-type") ?? "application/octet-stream";
  const cacheControl = upstreamResponse.headers.get("cache-control") ?? "public, max-age=86400";
  const body = await upstreamResponse.arrayBuffer();

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": contentType,
      "cache-control": cacheControl
    }
  });
}
