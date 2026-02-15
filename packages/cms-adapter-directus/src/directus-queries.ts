import { readItems } from "@directus/sdk";
import { directusClient } from "./directus-client.js";
import type {
  ColorAreaRecord,
  ColorPaletteRecord,
  ColorRecord,
  ColorSelectionRecord,
  LayerAssetRecord,
  LayerRecord,
  ModelVersionBundle,
  ModelVersionRecord,
  OptionGroupRecord,
  OptionRecord,
  PublishedModel,
  QuestionRecord,
  RenderViewRecord,
  RuleRecord
} from "./directus-schema.js";

type RawRecord = Record<string, unknown>;

function bySortThenId<T extends { sort?: number | null; id: string }>(a: T, b: T): number {
  const aSort = a.sort ?? Number.MAX_SAFE_INTEGER;
  const bSort = b.sort ?? Number.MAX_SAFE_INTEGER;
  if (aSort !== bSort) {
    return aSort - bSort;
  }
  return a.id.localeCompare(b.id);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

async function readMany(collection: string, query: RawRecord): Promise<RawRecord[]> {
  return (await directusClient.request(readItems(collection as never, query as never) as never)) as RawRecord[];
}

export async function getPublishedModels(): Promise<PublishedModel[]> {
  const versionRows = await readMany("model_versions", {
    filter: {
      status: { _eq: "published" }
    },
    fields: ["id", "boat_model_id", "version_label", "status", "published_at"],
    sort: ["boat_model_id", "-published_at", "-id"]
  });

  const versionsByModelId = new Map<string, ModelVersionRecord[]>();

  for (const row of versionRows) {
    const id = asString(row.id);
    const modelId = asString(row.boat_model_id);
    const versionLabel = asString(row.version_label);

    if (!id || !modelId || !versionLabel) {
      continue;
    }

    const modelVersions = versionsByModelId.get(modelId) ?? [];
    modelVersions.push({
      id,
      model_id: modelId,
      version_label: versionLabel,
      status: "published",
      published_at: asString(row.published_at),
      option_groups: [],
      render_views: [],
      color_palettes: [],
      rules: []
    });
    versionsByModelId.set(modelId, modelVersions);
  }

  const modelIds = Array.from(versionsByModelId.keys());
  if (modelIds.length === 0) {
    return [];
  }

  const modelRows = await readMany("boat_models", {
    filter: {
      id: { _in: modelIds },
      status: { _eq: "published" }
    },
    fields: ["id", "manufacturer_id", "slug", "name"],
    sort: ["name", "id"]
  });

  const models: PublishedModel[] = [];

  for (const row of modelRows) {
    const id = asString(row.id);
    if (!id) {
      continue;
    }

    const modelVersions = versionsByModelId.get(id) ?? [];
    if (modelVersions.length === 0) {
      continue;
    }

    modelVersions.sort((a, b) => {
      const aPublishedAt = a.published_at ?? "";
      const bPublishedAt = b.published_at ?? "";
      if (aPublishedAt !== bPublishedAt) {
        return bPublishedAt.localeCompare(aPublishedAt);
      }
      return b.id.localeCompare(a.id);
    });

    const slug = asString(row.slug) ?? id;
    const name = asString(row.name) ?? slug;

    models.push({
      id,
      manufacturer_id: asString(row.manufacturer_id),
      slug,
      name,
      is_active: true,
      model_versions: modelVersions
    });
  }

  return models;
}

export async function getModelVersionBundle(modelVersionId: string): Promise<ModelVersionBundle | null> {
  const versionRows = await readMany("model_versions", {
    filter: {
      id: { _eq: modelVersionId },
      status: { _eq: "published" }
    },
    limit: 1,
    fields: ["id", "boat_model_id", "version_label", "status", "published_at"]
  });

  const versionRow = versionRows[0];
  const versionId = asString(versionRow?.id);

  if (!versionId) {
    return null;
  }

  const optionGroupRows = await readMany("option_groups", {
    filter: {
      model_version_id: { _eq: versionId }
    },
    fields: ["id", "model_version_id", "title", "description", "sort"],
    sort: ["sort", "id"]
  });

  const questionRows = await readMany("questions", {
    filter: {
      model_version_id: { _eq: versionId }
    },
    fields: ["id", "group_id", "key", "label", "input_type", "sort"],
    sort: ["sort", "id"]
  });

  const questionIds = questionRows
    .map((row) => asString(row.id))
    .filter((id): id is string => Boolean(id));

  const optionRows = questionIds.length
    ? await readMany("options", {
        filter: {
          question_id: { _in: questionIds }
        },
        fields: ["id", "question_id", "code", "label", "sort"],
        sort: ["sort", "id"]
      })
    : [];

  const renderViewRows = await readMany("render_views", {
    filter: {
      model_version_id: { _eq: versionId }
    },
    fields: ["id", "model_version_id", "key", "label", "sort"],
    sort: ["sort", "id"]
  });

  const renderViewIds = renderViewRows
    .map((row) => asString(row.id))
    .filter((id): id is string => Boolean(id));

  const layerRows = renderViewIds.length
    ? await readMany("layers", {
        filter: {
          render_view_id: { _in: renderViewIds }
        },
        fields: ["id", "render_view_id", "key", "sort"],
        sort: ["sort", "id"]
      })
    : [];

  const layerIds = layerRows
    .map((row) => asString(row.id))
    .filter((id): id is string => Boolean(id));

  const layerAssetRows = layerIds.length
    ? await readMany("layer_assets", {
        filter: {
          layer_id: { _in: layerIds }
        },
        fields: ["id", "layer_id", "option_id", "file", "sort"],
        sort: ["sort", "id"]
      })
    : [];

  const colorPaletteRows = await readMany("color_palettes", {
    filter: {
      model_version_id: { _eq: versionId }
    },
    fields: ["id", "model_version_id", "name", "sort"],
    sort: ["sort", "id"]
  });

  const paletteIds = colorPaletteRows
    .map((row) => asString(row.id))
    .filter((id): id is string => Boolean(id));

  const colorRows = paletteIds.length
    ? await readMany("colors", {
        filter: {
          palette_id: { _in: paletteIds }
        },
        fields: ["id", "palette_id", "name", "hex", "sort"],
        sort: ["sort", "id"]
      })
    : [];

  const colorAreaRows = await readMany("color_areas", {
    filter: {
      model_version_id: { _eq: versionId }
    },
    fields: ["id", "render_view_id", "key", "name", "mask_file", "sort"],
    sort: ["sort", "id"]
  });

  const colorAreaIds = colorAreaRows
    .map((row) => asString(row.id))
    .filter((id): id is string => Boolean(id));

  const colorSelectionRows = colorAreaIds.length
    ? await readMany("color_selections", {
        filter: {
          color_area_id: { _in: colorAreaIds }
        },
        fields: ["id", "color_area_id", "question_id", "allowed_palette_id", "sort"],
        sort: ["sort", "id"]
      })
    : [];

  const ruleRows = await readMany("rules", {
    filter: {
      model_version_id: { _eq: versionId }
    },
    fields: ["id", "model_version_id", "rule_type", "is_enabled", "sort", "rule_json"],
    sort: ["sort", "id"]
  });

  const optionsByQuestionId = new Map<string, OptionRecord[]>();
  for (const row of optionRows) {
    const id = asString(row.id);
    const questionId = asString(row.question_id);
    if (!id || !questionId) {
      continue;
    }

    const options = optionsByQuestionId.get(questionId) ?? [];
    options.push({
      id,
      question_id: questionId,
      key: asString(row.code) ?? id,
      label: asString(row.label) ?? asString(row.code) ?? id,
      sort: asNumber(row.sort)
    });
    optionsByQuestionId.set(questionId, options);
  }
  for (const options of optionsByQuestionId.values()) {
    options.sort(bySortThenId);
  }

  const questionsByGroupId = new Map<string, QuestionRecord[]>();
  for (const row of questionRows) {
    const id = asString(row.id);
    const groupId = asString(row.group_id);
    if (!id || !groupId) {
      continue;
    }

    const questions = questionsByGroupId.get(groupId) ?? [];
    questions.push({
      id,
      option_group_id: groupId,
      key: asString(row.key) ?? id,
      label: asString(row.label) ?? asString(row.key) ?? id,
      input_type: asString(row.input_type),
      sort: asNumber(row.sort),
      options: optionsByQuestionId.get(id) ?? []
    });
    questionsByGroupId.set(groupId, questions);
  }
  for (const questions of questionsByGroupId.values()) {
    questions.sort(bySortThenId);
  }

  const optionGroups: OptionGroupRecord[] = [];
  for (const row of optionGroupRows) {
    const id = asString(row.id);
    if (!id) {
      continue;
    }

    const title = asString(row.title) ?? id;

    optionGroups.push({
      id,
      model_version_id: asString(row.model_version_id) ?? versionId,
      key: title,
      label: title,
      sort: asNumber(row.sort),
      questions: questionsByGroupId.get(id) ?? []
    });
  }

  const layerAssetsByLayerId = new Map<string, LayerAssetRecord[]>();
  for (const row of layerAssetRows) {
    const id = asString(row.id);
    const layerId = asString(row.layer_id);
    if (!id || !layerId) {
      continue;
    }

    const assets = layerAssetsByLayerId.get(layerId) ?? [];
    assets.push({
      id,
      layer_id: layerId,
      asset_role: asString(row.option_id),
      sort: asNumber(row.sort),
      file: asString(row.file)
    });
    layerAssetsByLayerId.set(layerId, assets);
  }
  for (const assets of layerAssetsByLayerId.values()) {
    assets.sort(bySortThenId);
  }

  const layersByRenderViewId = new Map<string, LayerRecord[]>();
  for (const row of layerRows) {
    const id = asString(row.id);
    const renderViewId = asString(row.render_view_id);
    if (!id || !renderViewId) {
      continue;
    }

    const layers = layersByRenderViewId.get(renderViewId) ?? [];
    layers.push({
      id,
      render_view_id: renderViewId,
      key: asString(row.key) ?? id,
      sort: asNumber(row.sort),
      layer_assets: layerAssetsByLayerId.get(id) ?? []
    });
    layersByRenderViewId.set(renderViewId, layers);
  }
  for (const layers of layersByRenderViewId.values()) {
    layers.sort(bySortThenId);
  }

  const colorSelectionsByAreaId = new Map<string, ColorSelectionRecord[]>();
  for (const row of colorSelectionRows) {
    const id = asString(row.id);
    const areaId = asString(row.color_area_id);
    if (!id || !areaId) {
      continue;
    }

    const selections = colorSelectionsByAreaId.get(areaId) ?? [];
    const questionId = asString(row.question_id);
    const paletteId = asString(row.allowed_palette_id);

    selections.push({
      id,
      color_area_id: areaId,
      sort: asNumber(row.sort),
      option: questionId ? { id: questionId, key: questionId, label: questionId } : null,
      color: paletteId ? { id: paletteId, name: paletteId, hex: "" } : null
    });
    colorSelectionsByAreaId.set(areaId, selections);
  }
  for (const selections of colorSelectionsByAreaId.values()) {
    selections.sort(bySortThenId);
  }

  const colorAreasByRenderViewId = new Map<string, ColorAreaRecord[]>();
  for (const row of colorAreaRows) {
    const id = asString(row.id);
    const renderViewId = asString(row.render_view_id);
    if (!id || !renderViewId) {
      continue;
    }

    const areas = colorAreasByRenderViewId.get(renderViewId) ?? [];
    const key = asString(row.key) ?? asString(row.name) ?? id;

    areas.push({
      id,
      key,
      sort: asNumber(row.sort),
      mask_file: asString(row.mask_file),
      color_selections: colorSelectionsByAreaId.get(id) ?? []
    });
    colorAreasByRenderViewId.set(renderViewId, areas);
  }
  for (const areas of colorAreasByRenderViewId.values()) {
    areas.sort(bySortThenId);
  }

  const renderViews: Array<RenderViewRecord & { color_areas?: ColorAreaRecord[] }> = [];
  for (const row of renderViewRows) {
    const id = asString(row.id);
    if (!id) {
      continue;
    }

    const key = asString(row.key) ?? id;
    const label = asString(row.label) ?? key;

    renderViews.push({
      id,
      model_version_id: asString(row.model_version_id) ?? versionId,
      key,
      label,
      sort: asNumber(row.sort),
      layers: layersByRenderViewId.get(id) ?? [],
      color_areas: colorAreasByRenderViewId.get(id) ?? []
    });
  }

  const colorsByPaletteId = new Map<string, ColorRecord[]>();
  for (const row of colorRows) {
    const id = asString(row.id);
    const paletteId = asString(row.palette_id);
    if (!id || !paletteId) {
      continue;
    }

    const paletteColors = colorsByPaletteId.get(paletteId) ?? [];
    paletteColors.push({
      id,
      color_palette_id: paletteId,
      name: asString(row.name) ?? id,
      hex: asString(row.hex) ?? "",
      sort: asNumber(row.sort)
    });
    colorsByPaletteId.set(paletteId, paletteColors);
  }
  for (const paletteColors of colorsByPaletteId.values()) {
    paletteColors.sort(bySortThenId);
  }

  const colorPalettes: ColorPaletteRecord[] = [];
  for (const row of colorPaletteRows) {
    const id = asString(row.id);
    if (!id) {
      continue;
    }

    const name = asString(row.name) ?? id;

    colorPalettes.push({
      id,
      model_version_id: asString(row.model_version_id) ?? versionId,
      key: name,
      label: name,
      sort: asNumber(row.sort),
      colors: colorsByPaletteId.get(id) ?? []
    });
  }

  const rules: RuleRecord[] = [];
  for (const row of ruleRows) {
    const id = asString(row.id);
    if (!id) {
      continue;
    }

    rules.push({
      id,
      model_version_id: asString(row.model_version_id) ?? versionId,
      scope: asString(row.rule_type),
      priority: asNumber(row.sort),
      enabled: asBoolean(row.is_enabled),
      rule_json: (row.rule_json as Record<string, unknown> | null | undefined) ?? null
    });
  }

  return {
    id: versionId,
    model_id: asString(versionRow.boat_model_id) ?? "",
    version_label: asString(versionRow.version_label) ?? versionId,
    status: "published",
    published_at: asString(versionRow.published_at),
    option_groups: optionGroups,
    render_views: renderViews as unknown as RenderViewRecord[],
    color_palettes: colorPalettes,
    rules
  };
}
