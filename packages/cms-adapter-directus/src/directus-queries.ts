import { readItems } from "@directus/sdk";
import { getDirectusClient } from "./directus-client.js";
import type {
  BoatModelRecord,
  ColorAreaRecord,
  ColorPaletteItemRecord,
  ColorPaletteRecord,
  FlowRecord,
  GroupOptionRecord,
  FlowSectionRecord,
  FlowStepRecord,
  ItemRecord,
  ModelVersionBundle,
  ModelVersionRecord,
  PublishedModel,
  PublishedModelVersionRecord,
  RenderLayerRecord,
  RenderLayerType,
  RenderViewRecord,
  SelectionGroupRecord,
  VersionItemRecord,
  VersionRevisionRecord
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

function byRevisionPriority(a: VersionRevisionRecord, b: VersionRevisionRecord): number {
  const aRevision = a.revision_number ?? Number.MIN_SAFE_INTEGER;
  const bRevision = b.revision_number ?? Number.MIN_SAFE_INTEGER;
  if (aRevision !== bRevision) {
    return bRevision - aRevision;
  }

  const aEffective = a.effective_date ?? "";
  const bEffective = b.effective_date ?? "";
  if (aEffective !== bEffective) {
    return bEffective.localeCompare(aEffective);
  }

  const aSort = a.sort ?? Number.MAX_SAFE_INTEGER;
  const bSort = b.sort ?? Number.MAX_SAFE_INTEGER;
  if (aSort !== bSort) {
    return aSort - bSort;
  }

  return a.id.localeCompare(b.id);
}

function byPublishedVersionOrder(a: PublishedModelVersionRecord, b: PublishedModelVersionRecord): number {
  const aPublished = a.published_at ?? "";
  const bPublished = b.published_at ?? "";
  if (aPublished !== bPublished) {
    return bPublished.localeCompare(aPublished);
  }

  const aYear = a.year ?? Number.MIN_SAFE_INTEGER;
  const bYear = b.year ?? Number.MIN_SAFE_INTEGER;
  if (aYear !== bYear) {
    return bYear - aYear;
  }

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

function asStatus(value: unknown): "draft" | "published" | "archived" {
  if (value === "published" || value === "archived") {
    return value;
  }
  return "draft";
}

function asRawRecord(value: unknown): RawRecord | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as RawRecord;
}

function asRelationId(value: unknown): string | null {
  const directValue = asString(value);
  if (directValue) {
    return directValue;
  }

  const relationRecord = asRawRecord(value);
  return asString(relationRecord?.id);
}

function asLayerType(value: unknown): RenderLayerType {
  if (value === "mask" || value === "tint" || value === "decal") {
    return value;
  }
  return "image";
}

function asBlendMode(value: unknown): RenderLayerRecord["blend_mode"] {
  if (value === "multiply" || value === "overlay" || value === "screen" || value === "normal") {
    return value;
  }
  return null;
}

function toVersionLabel(year: number | null, trim: string | null, fallback: string): string {
  const parts = [year ? String(year) : null, trim].filter((part): part is string => Boolean(part));
  if (parts.length > 0) {
    return parts.join(" ");
  }
  return fallback;
}

async function readMany(collection: string, query: RawRecord): Promise<RawRecord[]> {
  return (await getDirectusClient().request(readItems(collection as never, query as never) as never)) as RawRecord[];
}

function toVersionRevisionRecord(row: RawRecord): VersionRevisionRecord | null {
  const id = asString(row.id);
  const modelVersion = asString(row.model_version);
  if (!id || !modelVersion) {
    return null;
  }

  return {
    id,
    model_version: modelVersion,
    revision_number: asNumber(row.revision_number),
    effective_date: asString(row.effective_date),
    change_log: asString(row.change_log),
    sort: asNumber(row.sort),
    status: asStatus(row.status)
  };
}

function toItemRecord(row: RawRecord): ItemRecord | null {
  const id = asString(row.id);
  const labelDefault = asString(row.label_default);
  if (!id || !labelDefault) {
    return null;
  }

  return {
    id,
    key: asString(row.key),
    label_default: labelDefault,
    description: asString(row.description),
    internal_code: asString(row.internal_code),
    vendor_code: asString(row.vendor_code),
    fulfillment: asString(row.fulfillment),
    item_category: asString(row.item_category),
    color_hex: asString(row.color_hex),
    is_color: asBoolean(row.is_color),
    sort: asNumber(row.sort)
  };
}

function toColorAreaRecord(row: RawRecord): ColorAreaRecord | null {
  const id = asString(row.id);
  const key = asString(row.key);
  const title = asString(row.title);
  if (!id || !key || !title) {
    return null;
  }

  return {
    id,
    key,
    title,
    sort: asNumber(row.sort)
  };
}

function toColorPaletteRecord(row: RawRecord): ColorPaletteRecord | null {
  const id = asString(row.id);
  const revision = asString(row.revision);
  const key = asString(row.key);
  const title = asString(row.title);
  if (!id || !revision || !key || !title) {
    return null;
  }

  return {
    id,
    revision,
    key,
    title,
    sort: asNumber(row.sort)
  };
}

function toPublishedModelVersionRecord(
  row: RawRecord,
  publishedAt: string | null
): PublishedModelVersionRecord | null {
  const id = asString(row.id);
  const boatModel = asString(row.boat_model);
  if (!id || !boatModel) {
    return null;
  }

  const year = asNumber(row.year);
  const trim = asString(row.trim);

  return {
    id,
    boat_model: boatModel,
    year,
    trim,
    notes: asString(row.notes),
    published_revision: asString(row.published_revision),
    sort: asNumber(row.sort),
    status: asStatus(row.status),
    version_label: toVersionLabel(year, trim, id),
    published_at: publishedAt
  };
}

function pickCurrentRevision(
  modelVersion: ModelVersionRecord,
  revisions: VersionRevisionRecord[]
): VersionRevisionRecord | null {
  if (revisions.length === 0) {
    return null;
  }

  const sorted = [...revisions].sort(byRevisionPriority);

  if (modelVersion.published_revision) {
    const byPublishedRef = sorted.find((revision) => revision.id === modelVersion.published_revision);
    if (byPublishedRef) {
      return byPublishedRef;
    }
  }

  const firstPublished = sorted.find((revision) => revision.status === "published");
  return firstPublished ?? sorted[0] ?? null;
}

export async function getPublishedModels(): Promise<PublishedModel[]> {
  const versionRows = await readMany("model_versions", {
    filter: {
      status: { _eq: "published" },
      published_revision: { _nnull: true }
    },
    fields: ["id", "boat_model", "year", "trim", "notes", "published_revision", "sort", "status"],
    sort: ["sort", "id"]
  });

  if (versionRows.length === 0) {
    return [];
  }

  const publishedRevisionIds = versionRows
    .map((row) => asString(row.published_revision))
    .filter((id): id is string => Boolean(id));

  const revisionRows = publishedRevisionIds.length
    ? await readMany("version_revisions", {
        filter: {
          id: { _in: publishedRevisionIds },
          status: { _eq: "published" }
        },
        fields: ["id", "effective_date", "status", "sort", "revision_number", "model_version"],
        sort: ["sort", "id"]
      })
    : [];

  const revisionById = new Map<string, RawRecord>();
  for (const row of revisionRows) {
    const id = asString(row.id);
    if (!id) {
      continue;
    }
    revisionById.set(id, row);
  }

  const versionsByModelId = new Map<string, PublishedModelVersionRecord[]>();
  for (const row of versionRows) {
    const modelId = asString(row.boat_model);
    if (!modelId) {
      continue;
    }

    const publishedRevisionId = asString(row.published_revision);
    if (!publishedRevisionId) {
      continue;
    }

    const publishedRevision = revisionById.get(publishedRevisionId);
    if (!publishedRevision) {
      continue;
    }

    const publishedRevisionModelVersionId = asString(publishedRevision.model_version);
    if (publishedRevisionModelVersionId !== asString(row.id)) {
      continue;
    }

    const publishedAt = asString(publishedRevision.effective_date);
    const version = toPublishedModelVersionRecord(row, publishedAt);
    if (!version) {
      continue;
    }

    const modelVersions = versionsByModelId.get(modelId) ?? [];
    modelVersions.push(version);
    versionsByModelId.set(modelId, modelVersions);
  }

  const modelIds = Array.from(versionsByModelId.keys());
  if (modelIds.length === 0) {
    return [];
  }

  const modelRows = await readMany("boat_models", {
    filter: {
      id: { _in: modelIds }
    },
    fields: ["id", "model_code", "name", "series", "default_flow_template_key", "sort"],
    sort: ["sort", "id"]
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

    modelVersions.sort(byPublishedVersionOrder);

    const modelCode = asString(row.model_code);
    const name = asString(row.name) ?? modelCode ?? id;

    models.push({
      id,
      model_code: modelCode,
      name,
      series: asString(row.series),
      default_flow_template_key: asString(row.default_flow_template_key),
      sort: asNumber(row.sort),
      slug: modelCode ?? id,
      model_versions: modelVersions
    });
  }

  models.sort((a, b) => {
    const sortBySort = bySortThenId(a, b);
    if (sortBySort !== 0) {
      return sortBySort;
    }

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
      status: { _eq: "published" },
      published_revision: { _nnull: true }
    },
    limit: 1,
    fields: ["id", "boat_model", "year", "trim", "notes", "published_revision", "sort", "status"]
  });

  const versionRow = versionRows[0];
  const versionId = asString(versionRow?.id);
  const boatModelId = asString(versionRow?.boat_model);

  if (!versionId || !boatModelId) {
    return null;
  }

  const versionRecord: ModelVersionRecord = {
    id: versionId,
    boat_model: boatModelId,
    year: asNumber(versionRow.year),
    trim: asString(versionRow.trim),
    notes: asString(versionRow.notes),
    published_revision: asString(versionRow.published_revision),
    sort: asNumber(versionRow.sort),
    status: asStatus(versionRow.status)
  };

  const publishedRevisionId = versionRecord.published_revision;
  const revisionRows = await readMany("version_revisions", {
    filter: publishedRevisionId
      ? {
          _or: [{ model_version: { _eq: versionId } }, { id: { _eq: publishedRevisionId } }]
        }
      : {
          model_version: { _eq: versionId }
        },
    fields: [
      "id",
      "model_version",
      "revision_number",
      "effective_date",
      "change_log",
      "sort",
      "status"
    ],
    sort: ["-revision_number", "-effective_date", "sort", "id"]
  });

  const versionRevisions = revisionRows
    .map((row) => toVersionRevisionRecord(row))
    .filter((revision): revision is VersionRevisionRecord => Boolean(revision));
  versionRevisions.sort(byRevisionPriority);

  // Snapshot relation path:
  // model_versions.published_revision -> version_revisions.id -> render_views.revision -> render_layers.render_view
  const currentRevision =
    (publishedRevisionId
      ? versionRevisions.find(
          (revision) => revision.id === publishedRevisionId && revision.model_version === versionId
        ) ?? null
      : null) ?? pickCurrentRevision(versionRecord, versionRevisions);
  const currentRevisionId = currentRevision?.id ?? null;

  const versionItemRows = currentRevisionId
    ? await readMany("version_items", {
        filter: {
          revision: { _eq: currentRevisionId }
        },
        fields: [
          "id",
          "revision",
          "item",
          "label_override",
          "msrp",
          "dealer_price",
          "is_available",
          "is_included",
          "is_default",
          "source_ref",
          "notes",
          "build_notes",
          "sort_hint",
          "sort"
        ],
        sort: ["sort", "sort_hint", "id"]
      })
    : [];

  const itemIds = versionItemRows
    .map((row) => asString(row.item))
    .filter((id): id is string => Boolean(id));

  const itemRows = itemIds.length
    ? await readMany("items", {
        filter: {
          id: { _in: itemIds }
        },
        fields: [
          "id",
          "key",
          "label_default",
          "description",
          "internal_code",
          "vendor_code",
          "fulfillment",
          "item_category",
          "color_hex",
          "is_color",
          "sort"
        ],
        sort: ["sort", "id"]
      })
    : [];

  const itemsById = new Map<string, ItemRecord>();
  for (const row of itemRows) {
    const itemRecord = toItemRecord(row);
    if (itemRecord) {
      itemsById.set(itemRecord.id, itemRecord);
    }
  }

  const versionItems: VersionItemRecord[] = [];
  for (const row of versionItemRows) {
    const id = asString(row.id);
    const revisionId = asString(row.revision);
    const itemId = asString(row.item);
    if (!id || !revisionId || !itemId) {
      continue;
    }

    versionItems.push({
      id,
      revision: revisionId,
      item: itemId,
      label_override: asString(row.label_override),
      msrp: asDecimal(row.msrp),
      dealer_price: asDecimal(row.dealer_price),
      is_available: asBoolean(row.is_available),
      is_included: asBoolean(row.is_included),
      is_default: asBoolean(row.is_default),
      source_ref: asString(row.source_ref),
      notes: asString(row.notes),
      build_notes: asString(row.build_notes),
      sort_hint: asNumber(row.sort_hint),
      sort: asNumber(row.sort),
      item_detail: itemsById.get(itemId) ?? null
    });
  }
  versionItems.sort(bySortThenId);

  const flowRows = currentRevisionId
    ? await readMany("flows", {
        filter: {
          revision: { _eq: currentRevisionId }
        },
        fields: ["id", "revision", "template_key", "title", "audience", "sort"],
        sort: ["sort", "id"]
      })
    : [];

  const flows: FlowRecord[] = [];
  const flowIds: string[] = [];
  for (const row of flowRows) {
    const id = asString(row.id);
    const revision = asString(row.revision);
    const templateKey = asString(row.template_key);
    const title = asString(row.title);
    if (!id || !revision || !templateKey || !title) {
      continue;
    }

    flowIds.push(id);
    flows.push({
      id,
      revision,
      template_key: templateKey,
      title,
      audience: asString(row.audience),
      sort: asNumber(row.sort)
    });
  }
  flows.sort(bySortThenId);

  const flowStepRows = flowIds.length
    ? await readMany("flow_steps", {
        filter: {
          flow: { _in: flowIds }
        },
        fields: ["id", "flow", "key", "title", "help_text", "sort"],
        sort: ["sort", "id"]
      })
    : [];

  const flowSteps: FlowStepRecord[] = [];
  const flowStepIds: string[] = [];
  for (const row of flowStepRows) {
    const id = asString(row.id);
    const flow = asString(row.flow);
    const key = asString(row.key);
    const title = asString(row.title);
    if (!id || !flow || !key || !title) {
      continue;
    }

    flowStepIds.push(id);
    flowSteps.push({
      id,
      flow,
      key,
      title,
      help_text: asString(row.help_text),
      sort: asNumber(row.sort)
    });
  }
  flowSteps.sort(bySortThenId);

  const flowSectionRows = flowStepIds.length
    ? await readMany("flow_sections", {
        filter: {
          step: { _in: flowStepIds }
        },
        fields: ["id", "step", "title", "sort"],
        sort: ["sort", "id"]
      })
    : [];

  const flowSections: FlowSectionRecord[] = [];
  const flowSectionIds: string[] = [];
  for (const row of flowSectionRows) {
    const id = asString(row.id);
    const step = asString(row.step);
    const title = asString(row.title);
    if (!id || !step || !title) {
      continue;
    }

    flowSectionIds.push(id);
    flowSections.push({
      id,
      step,
      title,
      sort: asNumber(row.sort)
    });
  }
  flowSections.sort(bySortThenId);

  const selectionGroupRows = flowSectionIds.length
    ? await readMany("selection_groups", {
        filter: {
          section: { _in: flowSectionIds }
        },
        fields: [
          "id",
          "section",
          "key",
          "title",
          "selection_mode",
          "min_select",
          "max_select",
          "is_required",
          "help_text",
          "color_area",
          "color_area.id",
          "color_area.key",
          "color_area.title",
          "color_area.sort",
          "color_palette",
          "color_palette.id",
          "color_palette.revision",
          "color_palette.key",
          "color_palette.title",
          "color_palette.sort",
          "sort"
        ],
        sort: ["sort", "id"]
      })
    : [];

  const selectionGroups: SelectionGroupRecord[] = [];
  for (const row of selectionGroupRows) {
    const id = asString(row.id);
    const section = asString(row.section);
    const key = asString(row.key);
    const title = asString(row.title);
    const mode = asString(row.selection_mode);
    if (!id || !section || !key || !title) {
      continue;
    }

    if (mode !== "single" && mode !== "multi" && mode !== "boolean" && mode !== "quantity") {
      continue;
    }

    const colorAreaRow = asRawRecord(row.color_area);
    const colorPaletteRow = asRawRecord(row.color_palette);

    selectionGroups.push({
      id,
      section,
      key,
      title,
      selection_mode: mode,
      min_select: asNumber(row.min_select),
      max_select: asNumber(row.max_select),
      is_required: asBoolean(row.is_required),
      help_text: asString(row.help_text),
      color_area: asRelationId(row.color_area),
      color_palette: asRelationId(row.color_palette),
      color_area_detail: colorAreaRow ? toColorAreaRecord(colorAreaRow) : null,
      color_palette_detail: colorPaletteRow ? toColorPaletteRecord(colorPaletteRow) : null,
      sort: asNumber(row.sort)
    });
  }
  selectionGroups.sort(bySortThenId);

  const selectionGroupIds = selectionGroups.map((group) => group.id);
  const groupOptionRows = selectionGroupIds.length
    ? await readMany("group_options", {
        filter: {
          selection_group: { _in: selectionGroupIds }
        },
        fields: [
          "id",
          "selection_group",
          "version_item",
          "label_override",
          "default_state",
          "override_msrp",
          "override_dealer_price",
          "sort"
        ],
        sort: ["sort", "id"]
      })
    : [];

  const groupOptions: GroupOptionRecord[] = [];
  for (const row of groupOptionRows) {
    const id = asString(row.id);
    const selectionGroup = asRelationId(row.selection_group);
    const versionItem = asRelationId(row.version_item);
    if (!id || !selectionGroup || !versionItem) {
      continue;
    }

    groupOptions.push({
      id,
      selection_group: selectionGroup,
      version_item: versionItem,
      label_override: asString(row.label_override),
      default_state: asString(row.default_state),
      override_msrp: asDecimal(row.override_msrp),
      override_dealer_price: asDecimal(row.override_dealer_price),
      sort: asNumber(row.sort)
    });
  }
  groupOptions.sort(bySortThenId);

  const colorAreaRows = await readMany("color_areas", {
    fields: ["id", "key", "title", "sort"],
    sort: ["sort", "id"]
  });
  const colorAreas = colorAreaRows
    .map((row) => toColorAreaRecord(row))
    .filter((row): row is ColorAreaRecord => Boolean(row));
  colorAreas.sort(bySortThenId);

  const colorPaletteRows = currentRevisionId
    ? await readMany("color_palettes", {
        filter: {
          revision: { _eq: currentRevisionId }
        },
        fields: ["id", "revision", "key", "title", "sort"],
        sort: ["sort", "id"]
      })
    : [];

  const colorPalettes = colorPaletteRows
    .map((row) => toColorPaletteRecord(row))
    .filter((row): row is ColorPaletteRecord => Boolean(row));
  colorPalettes.sort(bySortThenId);

  const colorPaletteIds = colorPalettes.map((palette) => palette.id);
  const colorPaletteItemRows = colorPaletteIds.length
    ? await readMany("color_palette_items", {
        filter: {
          color_palette: { _in: colorPaletteIds }
        },
        fields: [
          "id",
          "color_palette",
          "item",
          "sort",
          "item.id",
          "item.key",
          "item.label_default",
          "item.description",
          "item.internal_code",
          "item.vendor_code",
          "item.fulfillment",
          "item.item_category",
          "item.color_hex",
          "item.is_color",
          "item.sort"
        ],
        sort: ["sort", "id"]
      })
    : [];

  const colorPaletteItems: ColorPaletteItemRecord[] = [];
  for (const row of colorPaletteItemRows) {
    const id = asString(row.id);
    const colorPalette = asRelationId(row.color_palette);
    const item = asRelationId(row.item);
    if (!id || !colorPalette || !item) {
      continue;
    }

    const itemDetail = toItemRecord(asRawRecord(row.item) ?? {});
    if (itemDetail) {
      itemsById.set(itemDetail.id, itemDetail);
    }

    colorPaletteItems.push({
      id,
      color_palette: colorPalette,
      item,
      sort: asNumber(row.sort),
      item_detail: itemDetail
    });
  }
  colorPaletteItems.sort(bySortThenId);

  const renderViewRows = currentRevisionId
    ? await readMany("render_views", {
        filter: {
          revision: { _eq: currentRevisionId }
        },
        fields: ["id", "revision", "key", "title", "sort"],
        sort: ["sort", "id"]
      })
    : [];

  const renderViews: RenderViewRecord[] = [];
  const renderViewIds: string[] = [];
  for (const row of renderViewRows) {
    const id = asString(row.id);
    const revision = asString(row.revision);
    const key = asString(row.key);
    const title = asString(row.title);
    if (!id || !revision || !key || !title) {
      continue;
    }

    renderViewIds.push(id);
    renderViews.push({
      id,
      revision,
      key,
      title,
      sort: asNumber(row.sort)
    });
  }
  renderViews.sort(bySortThenId);

  const renderLayerRows = renderViewIds.length
    ? await readMany("render_layers", {
        filter: {
          render_view: { _in: renderViewIds }
        },
        fields: [
          "id",
          "render_view",
          "key",
          "layer_type",
          "asset",
          "mask_asset",
          "color_area",
          "color_area.id",
          "color_area.key",
          "color_area.title",
          "color_area.sort",
          "blend_mode",
          "opacity",
          "sort"
        ],
        sort: ["sort", "id"]
      })
    : [];

  const renderLayers: RenderLayerRecord[] = [];
  for (const row of renderLayerRows) {
    const id = asString(row.id);
    const renderView = asRelationId(row.render_view);
    const key = asString(row.key);
    const asset = asRelationId(row.asset);
    if (!id || !renderView || !key || !asset) {
      continue;
    }

    const maskAsset = asRelationId(row.mask_asset);
    const colorAreaRow = asRawRecord(row.color_area);

    renderLayers.push({
      id,
      render_view: renderView,
      key,
      layer_type: asLayerType(row.layer_type),
      asset,
      mask_asset: maskAsset,
      color_area: asRelationId(row.color_area),
      color_area_detail: colorAreaRow ? toColorAreaRecord(colorAreaRow) : null,
      blend_mode: asBlendMode(row.blend_mode),
      opacity: asDecimal(row.opacity),
      sort: asNumber(row.sort)
    });
  }
  renderLayers.sort(bySortThenId);

  const modelYear = versionRecord.year ?? null;
  const versionLabel = toVersionLabel(modelYear, versionRecord.trim ?? null, versionId);

  return {
    ...versionRecord,
    model_year: modelYear,
    version_label: versionLabel,
    published_at: currentRevision?.effective_date ?? null,
    current_revision: currentRevision,
    version_revisions: versionRevisions,
    version_items: versionItems,
    flows,
    flow_steps: flowSteps,
    flow_sections: flowSections,
    selection_groups: selectionGroups,
    group_options: groupOptions,
    color_areas: colorAreas,
    color_palettes: colorPalettes,
    color_palette_items: colorPaletteItems,
    render_views: renderViews,
    render_layers: renderLayers
  };
}
