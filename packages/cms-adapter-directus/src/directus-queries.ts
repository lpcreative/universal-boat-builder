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

function asDecimal(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
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
    fields: ["id", "model_id", "version_label", "status", "published_at"],
    sort: ["model_id", "-published_at", "-id"]
  });

  const versionsByModelId = new Map<string, ModelVersionRecord[]>();

  for (const row of versionRows) {
    const id = asString(row.id);
    const modelId = asString(row.model_id);
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

  models.sort((a, b) => {
    const byName = a.name.localeCompare(b.name);
    if (byName !== 0) {
      return byName;
    }
    return a.id.localeCompare(b.id);
  });

  return models;
}

export async function getModelVersionBundle(modelVersionId: string): Promise<ModelVersionBundle | null> {
  const versionRows = await readMany("model_versions", {
    filter: {
      id: { _eq: modelVersionId },
      status: { _eq: "published" }
    },
    limit: 1,
    fields: [
      "id",
      "model_id",
      "model_year",
      "version_label",
      "status",
      "published_at",
      "compiled_hash",
      "compiled_at"
    ]
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
    fields: ["id", "model_version_id", "key", "label", "title", "description", "sort"],
    sort: ["sort", "id"]
  });

  const optionGroupIds = optionGroupRows
    .map((row) => asString(row.id))
    .filter((id): id is string => Boolean(id));

  const questionRows = optionGroupIds.length
    ? await readMany("questions", {
        filter: {
          option_group_id: { _in: optionGroupIds }
        },
        fields: ["id", "option_group_id", "key", "label", "input_type", "is_required", "default_value", "sort"],
        sort: ["sort", "id"]
      })
    : [];

  const questionIds = questionRows
    .map((row) => asString(row.id))
    .filter((id): id is string => Boolean(id));

  const optionRows = questionIds.length
    ? await readMany("options", {
        filter: {
          question_id: { _in: questionIds }
        },
        fields: [
          "id",
          "question_id",
          "key",
          "code",
          "label",
          "description",
          "price_msrp",
          "price_dealer",
          "price_mode",
          "media_mode",
          "is_default",
          "is_available",
          "sort"
        ],
        sort: ["sort", "id"]
      })
    : [];

  const renderViewRows = await readMany("render_views", {
    filter: {
      model_version_id: { _eq: versionId }
    },
    fields: ["id", "model_version_id", "key", "label", "base_image", "sort"],
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
        fields: ["id", "render_view_id", "key", "z_index", "sort", "blend_mode", "opacity"],
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
          color_palette_id: { _in: paletteIds }
        },
        fields: ["id", "color_palette_id", "name", "hex", "sort"],
        sort: ["sort", "id"]
      })
    : [];

  const colorAreaRows = renderViewIds.length || layerIds.length
    ? await readMany("color_areas", {
        filter: {
          _or: [{ render_view_id: { _in: renderViewIds } }, { layer_id: { _in: layerIds } }]
        },
        fields: ["id", "layer_id", "render_view_id", "key", "name", "mask_file", "default_color_id", "sort"],
        sort: ["sort", "id"]
      })
    : [];

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
    fields: ["id", "model_version_id", "scope", "priority", "enabled", "rule_json"],
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
      code: asString(row.code),
      label: asString(row.label) ?? asString(row.code) ?? id,
      description: asString(row.description),
      price_msrp: asDecimal(row.price_msrp),
      price_dealer: asDecimal(row.price_dealer),
      price_mode: asString(row.price_mode),
      media_mode: asString(row.media_mode),
      is_default: asBoolean(row.is_default),
      is_available: asBoolean(row.is_available),
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
    const groupId = asString(row.option_group_id);
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
      is_required: asBoolean(row.is_required),
      default_value: asString(row.default_value),
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

    const key = asString(row.key) ?? asString(row.title) ?? id;
    const label = asString(row.label) ?? asString(row.title) ?? key;

    optionGroups.push({
      id,
      model_version_id: asString(row.model_version_id) ?? versionId,
      key,
      label,
      sort: asNumber(row.sort),
      questions: questionsByGroupId.get(id) ?? []
    });
  }
  optionGroups.sort(bySortThenId);

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
      option_id: asString(row.option_id),
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
      z_index: asNumber(row.z_index),
      sort: asNumber(row.sort),
      blend_mode: asString(row.blend_mode),
      opacity: asNumber(row.opacity),
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
      question_id: questionId,
      allowed_palette_id: paletteId,
      sort: asNumber(row.sort),
      option: questionId ? { id: questionId, key: questionId, label: questionId } : null,
      color: paletteId ? { id: paletteId, name: paletteId, hex: "" } : null
    });
    colorSelectionsByAreaId.set(areaId, selections);
  }
  for (const selections of colorSelectionsByAreaId.values()) {
    selections.sort(bySortThenId);
  }

  const colorAreasByLayerId = new Map<string, ColorAreaRecord[]>();
  const colorAreasByRenderViewId = new Map<string, ColorAreaRecord[]>();
  for (const row of colorAreaRows) {
    const id = asString(row.id);
    if (!id) {
      continue;
    }

    const key = asString(row.key) ?? asString(row.name) ?? id;
    const area: ColorAreaRecord = {
      id,
      layer_id: asString(row.layer_id),
      render_view_id: asString(row.render_view_id),
      key,
      sort: asNumber(row.sort),
      mask_file: asString(row.mask_file),
      default_color_id: asString(row.default_color_id),
      color_selections: colorSelectionsByAreaId.get(id) ?? []
    };

    const layerId = asString(row.layer_id);
    if (layerId) {
      const areas = colorAreasByLayerId.get(layerId) ?? [];
      areas.push(area);
      colorAreasByLayerId.set(layerId, areas);
    }

    const renderViewId = asString(row.render_view_id);
    if (renderViewId) {
      const areas = colorAreasByRenderViewId.get(renderViewId) ?? [];
      areas.push(area);
      colorAreasByRenderViewId.set(renderViewId, areas);
    }
  }
  for (const areas of colorAreasByLayerId.values()) {
    areas.sort(bySortThenId);
  }
  for (const areas of colorAreasByRenderViewId.values()) {
    areas.sort(bySortThenId);
  }

  for (const layers of layersByRenderViewId.values()) {
    for (const layer of layers) {
      layer.color_areas = colorAreasByLayerId.get(layer.id) ?? [];
    }
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
      base_image: asString(row.base_image),
      sort: asNumber(row.sort),
      layers: layersByRenderViewId.get(id) ?? [],
      color_areas: colorAreasByRenderViewId.get(id) ?? []
    });
  }
  renderViews.sort(bySortThenId);

  const colorsByPaletteId = new Map<string, ColorRecord[]>();
  for (const row of colorRows) {
    const id = asString(row.id);
    const paletteId = asString(row.color_palette_id);
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
  colorPalettes.sort(bySortThenId);

  const rules: RuleRecord[] = [];
  for (const row of ruleRows) {
    const id = asString(row.id);
    if (!id) {
      continue;
    }

    rules.push({
      id,
      model_version_id: asString(row.model_version_id) ?? versionId,
      scope: asString(row.scope),
      priority: asNumber(row.priority),
      enabled: asBoolean(row.enabled),
      rule_json: (row.rule_json as Record<string, unknown> | null | undefined) ?? null
    });
  }
  rules.sort((a, b) => {
    const aPriority = a.priority ?? Number.MAX_SAFE_INTEGER;
    const bPriority = b.priority ?? Number.MAX_SAFE_INTEGER;
    if (aPriority !== bPriority) {
      return aPriority - bPriority;
    }
    return a.id.localeCompare(b.id);
  });

  return {
    id: versionId,
    model_id: asString(versionRow.model_id) ?? "",
    model_year: asNumber(versionRow.model_year),
    version_label: asString(versionRow.version_label) ?? versionId,
    status: "published",
    published_at: asString(versionRow.published_at),
    compiled_hash: asString(versionRow.compiled_hash),
    compiled_at: asString(versionRow.compiled_at),
    option_groups: optionGroups,
    render_views: renderViews as unknown as RenderViewRecord[],
    color_palettes: colorPalettes,
    rules
  };
}
