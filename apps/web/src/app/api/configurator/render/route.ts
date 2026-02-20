import type { ModelVersionBundle, RenderViewRecord } from "@ubb/cms-adapter-directus";
import { NextResponse } from "next/server";
import { bySortThenId, sanitizeSelectionState } from "../../../../lib/configurator-shared";
import { checkRequiredDirectusEnv } from "../../../../lib/server/directus-env";

export const runtime = "nodejs";

interface RenderRequestBody {
  modelVersionId?: unknown;
  selections?: unknown;
}

function firstRenderView(bundle: ModelVersionBundle): RenderViewRecord | null {
  const sortedViews = [...bundle.render_views].sort(bySortThenId);
  return sortedViews[0] ?? null;
}

export async function POST(request: Request): Promise<Response> {
  const env = checkRequiredDirectusEnv();
  if (!env.ok) {
    return NextResponse.json({ error: "missing_env", missing: env.missing }, { status: 400 });
  }

  try {
    const [{ getModelVersionBundle }, { buildColorByAreaKey }] = await Promise.all([
      import("@ubb/cms-adapter-directus"),
      import("@ubb/compiler")
    ]);
    const body = (await request.json()) as RenderRequestBody;
    const modelVersionId = typeof body.modelVersionId === "string" ? body.modelVersionId : "";

    if (!modelVersionId) {
      return NextResponse.json({ error: "modelVersionId is required" }, { status: 400 });
    }

    const bundle = await getModelVersionBundle(modelVersionId);
    if (!bundle) {
      return NextResponse.json({ error: `No published model version bundle found for \"${modelVersionId}\".` }, { status: 404 });
    }

    const selections = sanitizeSelectionState(body.selections);
    const warnings: string[] = [];
    const colorByAreaKey = buildColorByAreaKey(bundle, selections, (message: unknown) => warnings.push(String(message)));

    const view = firstRenderView(bundle);
    const dataUrl = null;
    if (view) {
      warnings.push("Server preview rendering is disabled in Node runtime; client compositor should render preview.");
    }

    return NextResponse.json({
      dataUrl,
      colorByAreaKey,
      warnings
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to render configurator view";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
