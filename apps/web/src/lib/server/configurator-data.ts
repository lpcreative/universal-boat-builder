import "server-only";

import { getModelVersionBundle } from "@ubb/cms-adapter-directus";
import type {
  ColorPaletteItemRecord,
  GroupOptionRecord,
  ModelVersionBundle,
  PublishedModel,
  RenderLayerRecord,
  SelectionGroupRecord,
  VersionItemRecord
} from "@ubb/cms-adapter-directus";
import { buildColorByAreaKey, createDirectusAssetUrlResolver } from "@ubb/engine";
import {
  bySortThenId,
  type ConfigFlowSectionView,
  type ConfigFlowStepView,
  type ConfigOptionView,
  type ConfigRenderLayerView,
  type ConfigRenderView,
  type ConfigSelectionGroupView,
  type ConfiguratorClientData,
  type SelectionState
} from "../configurator-shared";

export interface PublishedModelVersionChoice {
  modelName: string;
  modelVersionId: string;
  label: string;
}

interface RawModelVersion {
  model: PublishedModel;
  version: PublishedModel["model_versions"][number];
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
      msrp: item?.msrp ?? null,
      dealer: item?.dealer_price ?? null,
      overrideMsrp: option.override_msrp ?? null,
      overrideDealer: option.override_dealer_price ?? null,
      colorHex: item?.item_detail?.color_hex ?? null,
      category: item?.item_detail?.item_category ?? null,
      vendorCode: item?.item_detail?.vendor_code ?? null,
      internalCode: item?.item_detail?.internal_code ?? null,
      isIncluded: item?.is_included === true,
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
    sectionId: group.section,
    key: selectionStateKey(group),
    title: group.title,
    selectionMode: group.selection_mode,
    helpText: group.help_text ?? null,
    colorAreaKey: group.color_area_detail?.key ?? null,
    sort: group.sort ?? null,
    options: toOptions({
      groupOptions: groupOptionsByGroupId.get(group.id) ?? [],
      versionItemsById
    })
  }));
}

function toFlowStepsView(bundle: ModelVersionBundle): ConfigFlowStepView[] {
  const groups = toGroupsView(bundle);
  const groupsBySectionId = new Map<string, ConfigSelectionGroupView[]>();
  for (const group of groups) {
    const row = groupsBySectionId.get(group.sectionId) ?? [];
    row.push(group);
    groupsBySectionId.set(group.sectionId, row);
  }

  const sortedFlows = [...bundle.flows].sort(bySortThenId);
  const selectedFlow = sortedFlows[0] ?? null;
  const selectedFlowSteps = [...bundle.flow_steps]
    .filter((step) => (selectedFlow ? step.flow === selectedFlow.id : true))
    .sort(bySortThenId);

  const sectionsByStepId = new Map<string, ConfigFlowSectionView[]>();
  const sortedSections = [...bundle.flow_sections]
    .filter((section) => selectedFlowSteps.some((step) => step.id === section.step))
    .sort(bySortThenId);

  for (const section of sortedSections) {
    const row = sectionsByStepId.get(section.step) ?? [];
    row.push({
      id: section.id,
      stepId: section.step,
      title: section.title,
      sort: section.sort ?? null,
      groups: [...(groupsBySectionId.get(section.id) ?? [])].sort(bySortThenId)
    });
    sectionsByStepId.set(section.step, row);
  }

  const steps = selectedFlowSteps.map((step) => ({
    id: step.id,
    key: step.key,
    title: step.title,
    helpText: step.help_text ?? null,
    sort: step.sort ?? null,
    sections: [...(sectionsByStepId.get(step.id) ?? [])].sort(bySortThenId)
  }));

  if (steps.length > 0) {
    return steps;
  }

  const fallbackSection: ConfigFlowSectionView = {
    id: "fallback-section",
    stepId: "fallback-step",
    title: "Configuration",
    sort: null,
    groups: groups
  };

  return [
    {
      id: "fallback-step",
      key: "configuration",
      title: "Configuration",
      helpText: null,
      sort: null,
      sections: [fallbackSection]
    }
  ];
}

function toRenderViews(args: { bundle: ModelVersionBundle; apiUrl: string }): ConfigRenderView[] {
  const fileUrlForId = createDirectusAssetUrlResolver(args.apiUrl);
  const sortedViews = [...args.bundle.render_views].sort(bySortThenId);
  const sortedLayers = [...args.bundle.render_layers].sort(bySortThenId);

  const layersByViewId = new Map<string, ConfigRenderLayerView[]>();
  for (const layer of sortedLayers) {
    const row = layersByViewId.get(layer.render_view) ?? [];
    row.push(toRenderLayerView(layer, fileUrlForId));
    layersByViewId.set(layer.render_view, row);
  }

  return sortedViews.map((view) => ({
    id: view.id,
    key: view.key,
    title: view.title,
    sort: view.sort ?? null,
    layers: [...(layersByViewId.get(view.id) ?? [])].sort(bySortThenId)
  }));
}

function toRenderLayerView(layer: RenderLayerRecord, fileUrlForId: (fileId: string) => string): ConfigRenderLayerView {
  return {
    id: layer.id,
    renderViewId: layer.render_view,
    key: layer.key,
    layerType: layer.layer_type,
    assetId: layer.asset,
    assetUrl: fileUrlForId(layer.asset),
    maskAssetId: layer.mask_asset ?? null,
    maskAssetUrl: layer.mask_asset ? fileUrlForId(layer.mask_asset) : null,
    colorAreaKey: layer.color_area_detail?.key ?? null,
    blendMode: layer.blend_mode ?? null,
    opacity: layer.opacity ?? null,
    sort: layer.sort ?? null
  };
}

export async function listPublishedModelVersionChoices(): Promise<PublishedModelVersionChoice[]> {
  const { getPublishedModels } = await import("@ubb/cms-adapter-directus");
  const models = await getPublishedModels();
  const rows: RawModelVersion[] = [];

  for (const model of models) {
    const versions = model.model_versions.filter((version) => version.status === "published");
    for (const version of versions) {
      rows.push({ model, version });
    }
  }

  return rows.map(({ model, version }) => ({
    modelName: model.name,
    modelVersionId: version.id,
    label: `${model.name} - ${versionText(version)}`
  }));
}

export async function pickModelVersion(args: {
  selectedModelVersionId: string | null;
}): Promise<{
  modelVersionId: string | null;
  source: "env" | "single" | "selected" | "none";
  choices: PublishedModelVersionChoice[];
}> {
  const envModelVersionId = readModelVersionIdFromEnv();
  const choices = await listPublishedModelVersionChoices();

  if (envModelVersionId) {
    return {
      modelVersionId: envModelVersionId,
      source: "env",
      choices
    };
  }

  if (choices.length === 0) {
    return {
      modelVersionId: null,
      source: "none",
      choices
    };
  }

  if (choices.length === 1) {
    return {
      modelVersionId: choices[0].modelVersionId,
      source: "single",
      choices
    };
  }

  if (args.selectedModelVersionId && choices.some((choice) => choice.modelVersionId === args.selectedModelVersionId)) {
    return {
      modelVersionId: args.selectedModelVersionId,
      source: "selected",
      choices
    };
  }

  return {
    modelVersionId: null,
    source: "none",
    choices
  };
}

export async function createInitialConfiguratorData(args: {
  modelVersionId: string;
  apiUrl: string;
}): Promise<ConfiguratorClientData> {
  const bundle = await getModelVersionBundle(args.modelVersionId);
  if (!bundle) {
    throw new Error(`No published model version bundle found for "${args.modelVersionId}".`);
  }
  const selections = createDeterministicSelections(bundle);
  const colorByAreaKey = buildColorByAreaKey(bundle, selections);
  const renderViews = toRenderViews({ bundle, apiUrl: args.apiUrl });

  return {
    modelVersionId: bundle.id,
    bundle,
    steps: toFlowStepsView(bundle),
    renderViews,
    initialRenderViewId: renderViews[0]?.id ?? null,
    selections,
    colorByAreaKey
  };
}
