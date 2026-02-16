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

    return [
      `${error.name}: ${error.message}`,
      stack
    ]
      .filter((line): line is string => Boolean(line))
      .join("\n");
  }

  return safeJson(error);
}

function countQuestions(groups: Array<{ questions?: Array<{ options?: unknown[] }> }>): {
  questions: number;
  options: number;
} {
  let questions = 0;
  let options = 0;

  for (const group of groups) {
    const groupQuestions = group.questions ?? [];
    questions += groupQuestions.length;

    for (const question of groupQuestions) {
      options += (question.options ?? []).length;
    }
  }

  return { questions, options };
}

function countRenderTree(
  views: Array<{
    layers?: Array<{ layer_assets?: unknown[]; color_areas?: Array<{ color_selections?: unknown[] }> }>;
    color_areas?: Array<{ color_selections?: unknown[] }>;
  }>
): {
  layers: number;
  layerAssets: number;
  colorAreas: number;
  colorSelections: number;
} {
  let layers = 0;
  let layerAssets = 0;
  let colorAreas = 0;
  let colorSelections = 0;

  for (const view of views) {
    const viewLayers = view.layers ?? [];
    layers += viewLayers.length;

    for (const layer of viewLayers) {
      layerAssets += (layer.layer_assets ?? []).length;

      const layerAreas = layer.color_areas ?? [];
      colorAreas += layerAreas.length;
      for (const area of layerAreas) {
        colorSelections += (area.color_selections ?? []).length;
      }
    }

    const viewAreas = view.color_areas ?? [];
    colorAreas += viewAreas.length;
    for (const area of viewAreas) {
      colorSelections += (area.color_selections ?? []).length;
    }
  }

  return { layers, layerAssets, colorAreas, colorSelections };
}

function countPaletteColors(palettes: Array<{ colors?: unknown[] }>): number {
  return palettes.reduce((total, palette) => total + (palette.colors ?? []).length, 0);
}

function readEnv(name: string): string | undefined {
  const processLike = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return processLike?.env?.[name];
}

async function main(): Promise<void> {
  const directusApiUrl = readEnv("DIRECTUS_API_URL") ?? "<unset>";
  console.log("Directus connectivity check");
  console.log(`- DIRECTUS_API_URL: ${directusApiUrl}`);

  try {
    const { getModelVersionBundle, getPublishedModels } = await import("../directus-queries.js");
    const models = await getPublishedModels();

    const manufacturerIds = new Set<string>();
    for (const model of models) {
      if (model.manufacturer_id) {
        manufacturerIds.add(model.manufacturer_id);
      }
    }

    const publishedVersions = models.flatMap((model) => model.model_versions ?? []);
    const firstPublished = publishedVersions[0];

    console.log(`- manufacturers (derived from models): ${manufacturerIds.size}`);
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

    const optionGroups = bundle.option_groups ?? [];
    const renderViews = bundle.render_views ?? [];
    const palettes = bundle.color_palettes ?? [];

    const qCounts = countQuestions(optionGroups);
    const renderCounts = countRenderTree(
      renderViews as Array<{
        layers?: Array<{ layer_assets?: unknown[]; color_areas?: Array<{ color_selections?: unknown[] }> }>;
        color_areas?: Array<{ color_selections?: unknown[] }>;
      }>
    );
    const totalPaletteColors = countPaletteColors(palettes);

    console.log(
      `- bundle counts (groups/questions/options/views/layers/assets/palettes/colors/areas/selections/rules): ` +
        `${optionGroups.length}/${qCounts.questions}/${qCounts.options}/${renderViews.length}/${renderCounts.layers}/` +
        `${renderCounts.layerAssets}/${palettes.length}/${totalPaletteColors}/${renderCounts.colorAreas}/` +
        `${renderCounts.colorSelections}/${(bundle.rules ?? []).length}`
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
