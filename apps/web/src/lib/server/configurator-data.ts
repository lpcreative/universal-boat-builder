import "server-only";

import { getModelVersionBundle, getPublishedModels } from "@ubb/cms-adapter-directus";
import { buildColorByAreaKey, render_view_to_data_url } from "@ubb/compiler";
import { createDirectusAssetUrlResolver } from "@ubb/engine";
import type {
  ColorPaletteItemRecord,
  GroupOptionRecord,
  ModelVersionBundle,
  SelectionGroupRecord,
  VersionItemRecord
} from "@ubb/cms-adapter-directus";
import { bySortThenId, type ConfigOptionView, type ConfigSelectionGroupView, type SelectionState } from "../configurator-shared";

export interface PublishedModelVersionChoice {
  modelName: string;
  modelVersionId: string;
  label: string;
}

export interface InitialConfiguratorData {
  modelVersionId: string;
  selectionGroups: ConfigSelectionGroupView[];
  selections: SelectionState;
  initialDataUrl: string | null;
  colorByAreaKey: Record<string, string>;
  hasRenderView: boolean;
}

function readModelVersionIdFromEnv(): string | null {
  const value = process.env.MODEL_VERSION_ID?.trim();
  return value && value.length > 0 ? value : null;
}

function versionText(version: { year?: number | null; trim?: string | null }): string {
  const parts = [version.year ? String(version.year) : null, version.trim ?? null].filter(
    (part): part is string => Boolean(part)
  );
  return parts.length > 0 ? parts.join(" ") : "Unknown version";
}

function selectionStateKey(group: { id: string; key: string }): string {
  return group.key || group.id;
}

function createVersionItemMap(bundle: ModelVersionBundle): Map<string, VersionItemRecord> {
  return new Map(bundle.version_items.map((item) => [item.id, item]));
}

function createGroupOptionsMap(bundle: ModelVersionBundle): Map<string, GroupOptionRecord[]> {
  const map = new Map<string, GroupOptionRecord[]>();
  const sortedOptions = [...bundle.group_options].sort(bySortThenId);

  for (const option of sortedOptions) {
    const row = map.get(option.selection_group) ?? [];
    row.push(option);
    map.set(option.selection_group, row);
  }

  return map;
}

function isAvailable(versionItem: VersionItemRecord | null | undefined): boolean {
  return versionItem?.is_available === true;
}

function isDefault(versionItem: VersionItemRecord | null | undefined): boolean {
  return versionItem?.is_default === true;
}

function createAvailableVersionItemsByItemId(bundle: ModelVersionBundle): Map<string, VersionItemRecord[]> {
  const map = new Map<string, VersionItemRecord[]>();
  const sortedVersionItems = [...bundle.version_items].sort(bySortThenId);
  for (const versionItem of sortedVersionItems) {
    if (!isAvailable(versionItem)) {
      continue;
    }
    const row = map.get(versionItem.item) ?? [];
    row.push(versionItem);
    map.set(versionItem.item, row);
  }
  return map;
}

function createPaletteItemsByPaletteId(bundle: ModelVersionBundle): Map<string, ColorPaletteItemRecord[]> {
  const map = new Map<string, ColorPaletteItemRecord[]>();
  const sortedPaletteItems = [...bundle.color_palette_items].sort(bySortThenId);
  for (const paletteItem of sortedPaletteItems) {
    const row = map.get(paletteItem.color_palette) ?? [];
    row.push(paletteItem);
    map.set(paletteItem.color_palette, row);
  }
  return map;
}

function hasColorHex(versionItem: VersionItemRecord | null | undefined): boolean {
  return typeof versionItem?.item_detail?.color_hex === "string" && versionItem.item_detail.color_hex.length > 0;
}

function pickSingleDefaultOption(
  groupOptions: GroupOptionRecord[],
  versionItemsById: Map<string, VersionItemRecord>
): string | null {
  for (const option of groupOptions) {
    const versionItem = versionItemsById.get(option.version_item);
    if (versionItem && isAvailable(versionItem) && isDefault(versionItem)) {
      return versionItem.id;
    }
  }
  return null;
}

function pickFirstAvailableOption(
  groupOptions: GroupOptionRecord[],
  versionItemsById: Map<string, VersionItemRecord>
): string | null {
  for (const option of groupOptions) {
    const versionItem = versionItemsById.get(option.version_item);
    if (versionItem && isAvailable(versionItem)) {
      return versionItem.id;
    }
  }
  return null;
}

function pickFromColorPalette(args: {
  group: SelectionGroupRecord;
  paletteItemsById: Map<string, ColorPaletteItemRecord[]>;
  availableVersionItemsByItemId: Map<string, VersionItemRecord[]>;
}): string | null {
  const paletteId = args.group.color_palette;
  if (!paletteId) {
    return null;
  }

  const paletteItems = args.paletteItemsById.get(paletteId) ?? [];
  for (const paletteItem of paletteItems) {
    const candidates = args.availableVersionItemsByItemId.get(paletteItem.item) ?? [];
    const withColor = candidates.find((candidate) => hasColorHex(candidate));
    if (withColor) {
      return withColor.id;
    }
  }

  return null;
}

function createDeterministicSelections(bundle: ModelVersionBundle): SelectionState {
  const selections: SelectionState = {};
  const sortedGroups = [...bundle.selection_groups].sort(bySortThenId);
  const optionsByGroupId = createGroupOptionsMap(bundle);
  const versionItemsById = createVersionItemMap(bundle);
  const availableVersionItemsByItemId = createAvailableVersionItemsByItemId(bundle);
  const paletteItemsById = createPaletteItemsByPaletteId(bundle);

  for (const group of sortedGroups) {
    const key = selectionStateKey(group);
    const groupOptions = optionsByGroupId.get(group.id) ?? [];

    if (group.selection_mode === "single") {
      const preferredDefault = pickSingleDefaultOption(groupOptions, versionItemsById);
      if (preferredDefault) {
        selections[key] = preferredDefault;
        continue;
      }

      const paletteDefault = pickFromColorPalette({
        group,
        paletteItemsById,
        availableVersionItemsByItemId
      });
      if (paletteDefault) {
        selections[key] = paletteDefault;
        continue;
      }

      const firstAvailable = pickFirstAvailableOption(groupOptions, versionItemsById);
      if (firstAvailable) {
        selections[key] = firstAvailable;
      }
      continue;
    }

    if (group.selection_mode === "boolean") {
      const defaultOption = groupOptions.find((option) => option.default_state === "selected");
      selections[key] = Boolean(defaultOption);
      continue;
    }

    if (group.selection_mode === "multi") {
      const selected: string[] = [];
      for (const option of groupOptions) {
        const versionItem = versionItemsById.get(option.version_item);
        if (versionItem && isAvailable(versionItem) && isDefault(versionItem)) {
          selected.push(versionItem.id);
        }
      }
      selections[key] = selected;
      continue;
    }

    if (group.selection_mode === "quantity") {
      let quantity = 0;
      for (const option of groupOptions) {
        const versionItem = versionItemsById.get(option.version_item);
        if (versionItem && isAvailable(versionItem) && isDefault(versionItem)) {
          quantity += 1;
        }
      }
      selections[key] = quantity;
    }
  }

  return selections;
}

function optionLabel(option: GroupOptionRecord, item: VersionItemRecord | undefined): string {
  return option.label_override ?? item?.label_override ?? item?.item_detail?.label_default ?? item?.id ?? option.id;
}

function toOptions(args: {
  groupOptions: GroupOptionRecord[];
  versionItemsById: Map<string, VersionItemRecord>;
}): ConfigOptionView[] {
  return args.groupOptions.map((option) => {
    const item = args.versionItemsById.get(option.version_item);
    return {
      id: option.id,
      versionItemId: option.version_item,
      label: optionLabel(option, item),
      sort: option.sort ?? null
    };
  });
}

function toGroupsView(bundle: ModelVersionBundle): ConfigSelectionGroupView[] {
  const sortedGroups = [...bundle.selection_groups].sort(bySortThenId);
  const versionItemsById = createVersionItemMap(bundle);
  const groupOptionsByGroupId = createGroupOptionsMap(bundle);

  return sortedGroups.map((group) => ({
    id: group.id,
    key: selectionStateKey(group),
    title: group.title,
    selectionMode: group.selection_mode,
    sort: group.sort ?? null,
    options: toOptions({
      groupOptions: groupOptionsByGroupId.get(group.id) ?? [],
      versionItemsById
    })
  }));
}

export async function listPublishedModelVersionChoices(): Promise<PublishedModelVersionChoice[]> {
  const models = await getPublishedModels();
  const choices: PublishedModelVersionChoice[] = models.flatMap((model) =>
    model.model_versions.map((version) => ({
      modelName: model.name,
      modelVersionId: version.id,
      label: `${model.name} - ${versionText(version)}`
    }))
  );

  if (process.env.NODE_ENV !== "production") {
    console.info(
      `[configurator] discovery models=${models.length} versions=${choices.length} firstVersion=${
        choices[0]?.modelVersionId ?? "none"
      }`
    );
  }
  return choices;
}

export async function pickModelVersion(args: {
  selectedModelVersionId: string | null;
}): Promise<{
  modelVersionId: string | null;
  source: "env" | "single" | "selected" | "first" | "invalid_selected" | "none";
  reason: string;
  choices: PublishedModelVersionChoice[];
}> {
  const envModelVersionId = readModelVersionIdFromEnv();
  const choices = await listPublishedModelVersionChoices();

  if (envModelVersionId) {
    return {
      modelVersionId: envModelVersionId,
      source: "env",
      reason: "env_model_version_id",
      choices
    };
  }

  if (choices.length === 0) {
    return {
      modelVersionId: null,
      source: "none",
      reason: "no_published_versions_discovered",
      choices
    };
  }

  if (args.selectedModelVersionId) {
    if (choices.some((choice) => choice.modelVersionId === args.selectedModelVersionId)) {
      return {
        modelVersionId: args.selectedModelVersionId,
        source: "selected",
        reason: "query_selected_model_version",
        choices
      };
    }
    return {
      modelVersionId: null,
      source: "invalid_selected",
      reason: "query_selected_model_version_not_found",
      choices
    };
  }

  if (choices.length === 1) {
    return {
      modelVersionId: choices[0].modelVersionId,
      source: "single",
      reason: "single_published_version",
      choices
    };
  }

  return {
    modelVersionId: choices[0]?.modelVersionId ?? null,
    source: "first",
    reason: "default_first_published_version",
    choices
  };
}

export async function createInitialConfiguratorData(args: {
  modelVersionId: string;
}): Promise<InitialConfiguratorData> {
  const bundle = await getModelVersionBundle(args.modelVersionId);
  if (!bundle) {
    throw new Error(`No published model version bundle found for "${args.modelVersionId}".`);
  }
  const selections = createDeterministicSelections(bundle);
  const colorByAreaKey = buildColorByAreaKey(bundle, selections);

  const initialDataUrl = bundle.render_views[0]
    ? await render_view_to_data_url({
        view: bundle.render_views[0],
        layers: bundle.render_layers,
        selections,
        colorByAreaKey,
        fileUrlForId: createDirectusAssetUrlResolver()
      })
    : null;

  return {
    modelVersionId: bundle.id,
    selectionGroups: toGroupsView(bundle),
    selections,
    initialDataUrl,
    colorByAreaKey,
    hasRenderView: bundle.render_views.length > 0
  };
}
