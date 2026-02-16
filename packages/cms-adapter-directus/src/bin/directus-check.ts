import { readItems } from "@directus/sdk";
import { directusClient } from "../directus-client.js";

type DirectusErrorPayload = {
  errors?: Array<{
    message?: unknown;
    extensions?: {
      code?: unknown;
      reason?: unknown;
    };
  }>;
};

function setExitCode(code: number): void {
  const processLike = (globalThis as { process?: { exitCode?: number } }).process;
  if (processLike) {
    processLike.exitCode = code;
  }
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatError(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "errors" in error &&
    Array.isArray((error as DirectusErrorPayload).errors)
  ) {
    const lines = (error as DirectusErrorPayload).errors?.map((entry, index) => {
      const message = typeof entry?.message === "string" ? entry.message : "Unknown Directus error";
      const code = typeof entry?.extensions?.code === "string" ? entry.extensions.code : null;
      const reason = typeof entry?.extensions?.reason === "string" ? entry.extensions.reason : null;
      const suffix = [code, reason].filter((part): part is string => Boolean(part)).join(" | ");
      return suffix.length > 0 ? `  ${index + 1}. ${message} (${suffix})` : `  ${index + 1}. ${message}`;
    });

    return ["Directus API returned errors:", ...(lines ?? [])].join("\n");
  }

  if (error instanceof Error) {
    const stack = error.stack
      ?.split("\n")
      .slice(0, 10)
      .join("\n");

    return [`${error.name}: ${error.message}`, stack]
      .filter((line): line is string => Boolean(line))
      .join("\n");
  }

  return safeJson(error);
}

function readEnv(name: string): string | undefined {
  const processLike = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return processLike?.env?.[name];
}

async function validateRequiredSchema(): Promise<void> {
  const requiredCollections: Record<string, string[]> = {
    boat_models: ["id", "name", "model_code", "sort"],
    model_versions: ["id", "boat_model", "year", "trim", "status", "published_revision", "sort"],
    version_revisions: ["id", "model_version", "revision_number", "effective_date", "status", "sort"],
    version_items: ["id", "revision", "item", "msrp", "dealer_price", "is_available", "is_default", "sort"],
    items: ["id", "label_default", "key", "color_hex", "sort"],
    flows: ["id", "revision", "template_key", "title", "sort"],
    flow_steps: ["id", "flow", "key", "title", "sort"],
    flow_sections: ["id", "step", "title", "sort"],
    selection_groups: ["id", "section", "key", "title", "selection_mode", "color_area", "color_palette", "sort"],
    group_options: ["id", "selection_group", "version_item", "sort"],
    color_areas: ["id", "key", "title", "sort"],
    color_palettes: ["id", "revision", "key", "title", "sort"],
    color_palette_items: ["id", "color_palette", "item", "sort"],
    render_views: ["id", "revision", "key", "title", "sort"],
    render_layers: [
      "id",
      "render_view",
      "key",
      "layer_type",
      "asset",
      "mask_asset",
      "color_area",
      "blend_mode",
      "opacity",
      "sort"
    ]
  };

  const failures: string[] = [];

  for (const [collection, fields] of Object.entries(requiredCollections)) {
    try {
      await directusClient.request(
        readItems(collection as never, { limit: 1, fields } as never) as never
      );
    } catch (error) {
      const formatted = formatError(error).split("\n")[0] ?? "unknown error";
      failures.push(`${collection}: ${formatted}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(
      `Schema is missing required collections/fields for cms-adapter-directus:\n${failures
        .sort()
        .map((line) => `- ${line}`)
        .join("\n")}`
    );
  }
}

function countBundle(bundle: {
  version_items?: unknown[];
  flows?: unknown[];
  flow_steps?: unknown[];
  flow_sections?: unknown[];
  selection_groups?: unknown[];
  render_views?: unknown[];
  render_layers?: Array<{ asset?: string | null; mask_asset?: string | null }>;
  version_revisions?: unknown[];
}): {
  revisions: number;
  versionItems: number;
  flows: number;
  flowSteps: number;
  flowSections: number;
  selectionGroups: number;
  renderViews: number;
  renderLayers: number;
  renderLayerAssets: number;
  renderLayerMaskAssets: number;
} {
  let renderLayerAssets = 0;
  let renderLayerMaskAssets = 0;

  for (const layer of bundle.render_layers ?? []) {
    if (typeof layer.asset === "string" && layer.asset.length > 0) {
      renderLayerAssets += 1;
    }
    if (typeof layer.mask_asset === "string" && layer.mask_asset.length > 0) {
      renderLayerMaskAssets += 1;
    }
  }

  return {
    revisions: (bundle.version_revisions ?? []).length,
    versionItems: (bundle.version_items ?? []).length,
    flows: (bundle.flows ?? []).length,
    flowSteps: (bundle.flow_steps ?? []).length,
    flowSections: (bundle.flow_sections ?? []).length,
    selectionGroups: (bundle.selection_groups ?? []).length,
    renderViews: (bundle.render_views ?? []).length,
    renderLayers: (bundle.render_layers ?? []).length,
    renderLayerAssets,
    renderLayerMaskAssets
  };
}

async function main(): Promise<void> {
  const directusApiUrl = readEnv("DIRECTUS_API_URL") ?? "<unset>";
  console.log("Directus connectivity check");
  console.log(`- DIRECTUS_API_URL: ${directusApiUrl}`);

  try {
    await validateRequiredSchema();

    const { getModelVersionBundle, getPublishedModels } = await import("../directus-queries.js");
    const models = await getPublishedModels();

    const publishedVersions = models.flatMap((model) => model.model_versions ?? []);
    const firstPublished = publishedVersions[0];

    console.log(`- models count: ${models.length}`);
    console.log(`- published model_versions: ${publishedVersions.length}`);

    if (!firstPublished) {
      console.log("- first published version id: none");
      return;
    }

    console.log(`- first published version id: ${firstPublished.id}`);

    const bundle = await getModelVersionBundle(firstPublished.id);

    if (!bundle) {
      throw new Error(`Published model_version ${firstPublished.id} could not be resolved as a bundle.`);
    }

    const counts = countBundle(bundle as {
      version_items?: unknown[];
      flows?: unknown[];
      flow_steps?: unknown[];
      flow_sections?: unknown[];
      selection_groups?: unknown[];
      render_views?: unknown[];
      render_layers?: Array<{ asset?: string | null; mask_asset?: string | null }>;
      version_revisions?: unknown[];
    });

    console.log(
      "- bundle counts (revisions/version_items/flows/steps/sections/groups/render_views/render_layers/assets/mask_assets): " +
        `${counts.revisions}/${counts.versionItems}/${counts.flows}/${counts.flowSteps}/${counts.flowSections}/` +
        `${counts.selectionGroups}/${counts.renderViews}/${counts.renderLayers}/${counts.renderLayerAssets}/` +
        `${counts.renderLayerMaskAssets}`
    );
  } catch (error) {
    console.error("Directus connectivity check failed");
    console.error(formatError(error));
    if (
      typeof error === "object" &&
      error !== null &&
      "data" in error &&
      typeof (error as { data?: unknown }).data === "object" &&
      (error as { data?: unknown }).data !== null &&
      "errors" in ((error as { data?: { errors?: unknown[] } }).data ?? {})
    ) {
      console.error("Directus API error payload:");
      console.error(safeJson((error as { data?: unknown }).data));
    }
    setExitCode(1);
  }
}

void main();
