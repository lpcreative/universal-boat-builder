import { getModelVersionBundle, type ModelVersionBundle, type RenderViewRecord } from "@ubb/cms-adapter-directus";
import { buildColorByAreaKey, render_view_to_data_url } from "@ubb/compiler";
import { createDirectusAssetUrlResolver } from "@ubb/engine";
import { NextResponse } from "next/server";
import { bySortThenId, sanitizeSelectionState } from "../../../../lib/configurator-shared";

interface RenderRequestBody {
  modelVersionId?: unknown;
  selections?: unknown;
}

function firstRenderView(bundle: ModelVersionBundle): RenderViewRecord | null {
  const sortedViews = [...bundle.render_views].sort(bySortThenId);
  return sortedViews[0] ?? null;
}

export async function POST(request: Request): Promise<Response> {
  try {
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
    const dataUrl = view
      ? await render_view_to_data_url({
          view,
          layers: bundle.render_layers,
          selections,
          colorByAreaKey,
          fileUrlForId: createDirectusAssetUrlResolver()
        })
      : null;

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
