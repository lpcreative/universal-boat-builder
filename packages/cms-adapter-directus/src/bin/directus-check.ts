type DirectusErrorEnvelope = {
  errors?: Array<{
    message?: string;
    extensions?: {
      code?: string;
    };
  }>;
};

function setExitCode(code: number): void {
  const processLike = (globalThis as { process?: { exitCode?: number } }).process;
  if (processLike) {
    processLike.exitCode = code;
  }
}

function formatError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? String((error as { status?: number | string }).status)
      : undefined;
  const data =
    typeof error === "object" && error !== null && "data" in error
      ? ((error as { data?: unknown }).data as DirectusErrorEnvelope | undefined)
      : undefined;

  const firstCode = data?.errors?.[0]?.extensions?.code;
  const firstMessage = data?.errors?.[0]?.message;

  if (status === "401" || firstCode === "INVALID_CREDENTIALS" || firstCode === "INVALID_TOKEN") {
    return `Authentication error (401/invalid token). ${firstMessage ?? message}`;
  }

  if (status === "403" || firstCode === "FORBIDDEN") {
    return `Permissions error (403/forbidden). ${firstMessage ?? message}`;
  }

  if (
    firstCode === "INVALID_QUERY" ||
    firstCode === "INVALID_PAYLOAD" ||
    /invalid query|field .*doesn't exist|cannot read properties/i.test(`${firstMessage ?? ""} ${message}`)
  ) {
    return `Schema/query path error. ${firstMessage ?? message}`;
  }

  return `${firstMessage ?? message}${status ? ` (status: ${status})` : ""}`;
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
  views: Array<{ layers?: Array<{ layer_assets?: unknown[]; color_areas?: Array<{ color_selections?: unknown[] }> }> }>
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

      const areas = layer.color_areas ?? [];
      colorAreas += areas.length;

      for (const area of areas) {
        colorSelections += (area.color_selections ?? []).length;
      }
    }
  }

  return { layers, layerAssets, colorAreas, colorSelections };
}

function countPaletteColors(palettes: Array<{ colors?: unknown[] }>): number {
  return palettes.reduce((total, palette) => total + (palette.colors ?? []).length, 0);
}

async function main(): Promise<void> {
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

    console.log("Directus connectivity check");
    console.log(`- manufacturers (derived from models): ${manufacturerIds.size}`);
    console.log(`- models with published versions: ${models.length}`);
    console.log(`- published model_versions: ${publishedVersions.length}`);

    if (!firstPublished) {
      console.log("- first published model_version: none");
      return;
    }

    const inferredYear =
      typeof (firstPublished as { year?: unknown }).year === "number"
        ? String((firstPublished as { year?: number }).year)
        : firstPublished.version_label.match(/\b(19|20)\d{2}\b/u)?.[0];

    console.log(
      `- first published model_version: id=${firstPublished.id} label=${firstPublished.version_label}${
        inferredYear ? ` year=${inferredYear}` : ""
      }`
    );

    const bundle = await getModelVersionBundle(firstPublished.id);

    if (!bundle) {
      throw new Error(`Published model_version ${firstPublished.id} could not be resolved as a bundle.`);
    }

    const optionGroups = bundle.option_groups ?? [];
    const renderViews = bundle.render_views ?? [];
    const palettes = bundle.color_palettes ?? [];

    const qCounts = countQuestions(optionGroups);
    const renderCounts = countRenderTree(renderViews);
    const totalPaletteColors = countPaletteColors(palettes);

    console.log("Bundle summary");
    console.log(`- option_groups/questions/options: ${optionGroups.length}/${qCounts.questions}/${qCounts.options}`);
    console.log(
      `- render_views/layers/layer_assets: ${renderViews.length}/${renderCounts.layers}/${renderCounts.layerAssets}`
    );
    console.log(
      `- palettes/colors/areas/selections: ${palettes.length}/${totalPaletteColors}/${renderCounts.colorAreas}/${renderCounts.colorSelections}`
    );
    console.log(`- rules: ${(bundle.rules ?? []).length}`);
  } catch (error) {
    console.error("Directus connectivity check failed");
    console.error(`- ${formatError(error)}`);
    setExitCode(1);
  }
}

void main();
