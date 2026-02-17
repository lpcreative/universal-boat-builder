import { getModelVersionBundle, getPublishedModels } from "@ubb/cms-adapter-directus";
import type {
  PublishedModel,
  PublishedModelVersionRecord,
  RenderViewRecord
} from "@ubb/cms-adapter-directus";
import { buildColorByAreaKey } from "../render/color-selection.js";
import { render_view_to_data_url } from "../render/mask_tint_renderer.js";

function readEnv(name: string): string | null {
  const processLike = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return processLike.process?.env?.[name] ?? null;
}

function directusAssetUrl(fileId: string): string {
  const apiBase = readEnv("DIRECTUS_API_URL");
  if (!apiBase) {
    throw new Error("DIRECTUS_API_URL is required for mask tint harness.");
  }
  return `${apiBase.replace(/\/$/, "")}/assets/${fileId}`;
}

async function main(): Promise<void> {
  if (typeof document === "undefined") {
    throw new Error("mask tint harness requires a browser-like runtime with Canvas + Image.");
  }

  const models = await getPublishedModels();
  const firstPublished = models.flatMap(
    (model: PublishedModel): PublishedModelVersionRecord[] => model.model_versions
  )[0];
  if (!firstPublished) {
    throw new Error("No published model_versions found.");
  }

  const bundle = await getModelVersionBundle(firstPublished.id);
  if (!bundle) {
    throw new Error(`Unable to load bundle for model_version ${firstPublished.id}.`);
  }

  const firstView = [...bundle.render_views].sort(
    (a: RenderViewRecord, b: RenderViewRecord) =>
      (a.sort ?? 1e9) - (b.sort ?? 1e9) || a.id.localeCompare(b.id)
  )[0];
  if (!firstView) {
    throw new Error("Bundle has no render_views.");
  }

  const selections: Record<string, unknown> = {};
  const colorByAreaKey = buildColorByAreaKey(bundle, selections);
  const dataUrl = await render_view_to_data_url({
    view: firstView,
    layers: bundle.render_layers,
    selections,
    colorByAreaKey,
    fileUrlForId: directusAssetUrl
  });

  console.log("Mask tint harness success");
  console.log(`- model_version: ${bundle.id}`);
  console.log(`- view: ${firstView.key}`);
  console.log(`- data_url_prefix: ${dataUrl.slice(0, 60)}`);
}

void main();
