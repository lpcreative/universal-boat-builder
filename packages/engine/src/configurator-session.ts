import type {
  ColorPaletteItemRecord,
  GroupOptionRecord,
  ModelVersionBundle,
  SelectionGroupRecord,
  VersionItemRecord
} from "@ubb/cms-adapter-directus";
import { buildColorByAreaKey } from "@ubb/compiler";

type SelectionValue = string | string[] | boolean | number | null;
export type SelectionState = Record<string, SelectionValue>;

export interface ConfiguratorSession {
  modelVersionId: string;
  bundle: ModelVersionBundle;
  selections: SelectionState;
  colorByAreaKey: Record<string, string>;
  renders: Array<{ viewKey: string; dataUrl: string }>;
  warnings: string[];
}

export interface CreateConfiguratorSessionInput {
  modelVersionId: string;
  audience?: string;
}

export interface CreateConfiguratorSessionFromBundleInput {
  bundle: ModelVersionBundle;
  audience?: string;
}

function bySortThenId<T extends { sort?: number | null; id: string }>(a: T, b: T): number {
  const aSort = a.sort ?? Number.MAX_SAFE_INTEGER;
  const bSort = b.sort ?? Number.MAX_SAFE_INTEGER;
  if (aSort !== bSort) {
    return aSort - bSort;
  }
  return a.id.localeCompare(b.id);
}

function readEnv(name: string): string | undefined {
  const processLike = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  return processLike?.env?.[name];
}

function selectionStateKey(group: Pick<SelectionGroupRecord, "id" | "key">): string {
  return group.key || group.id;
}

function isAvailable(versionItem: VersionItemRecord | null | undefined): boolean {
  return versionItem?.is_available === true;
}

function isDefault(versionItem: VersionItemRecord | null | undefined): boolean {
  return versionItem?.is_default === true;
}

function hasColorHex(versionItem: VersionItemRecord | null | undefined): boolean {
  return typeof versionItem?.item_detail?.color_hex === "string" && versionItem.item_detail.color_hex.length > 0;
}

function groupOptionsByGroupId(bundle: ModelVersionBundle): Map<string, GroupOptionRecord[]> {
  const map = new Map<string, GroupOptionRecord[]>();
  const sorted = [...bundle.group_options].sort(bySortThenId);
  for (const option of sorted) {
    const list = map.get(option.selection_group) ?? [];
    list.push(option);
    map.set(option.selection_group, list);
  }
  return map;
}

function versionItemById(bundle: ModelVersionBundle): Map<string, VersionItemRecord> {
  return new Map(bundle.version_items.map((item) => [item.id, item]));
}

function availableVersionItemsByItemId(bundle: ModelVersionBundle): Map<string, VersionItemRecord[]> {
  const map = new Map<string, VersionItemRecord[]>();
  const sorted = [...bundle.version_items].sort(bySortThenId);
  for (const versionItem of sorted) {
    if (!isAvailable(versionItem)) {
      continue;
    }
    const list = map.get(versionItem.item) ?? [];
    list.push(versionItem);
    map.set(versionItem.item, list);
  }
  return map;
}

function paletteItemsByPaletteId(bundle: ModelVersionBundle): Map<string, ColorPaletteItemRecord[]> {
  const map = new Map<string, ColorPaletteItemRecord[]>();
  const sorted = [...bundle.color_palette_items].sort(bySortThenId);
  for (const paletteItem of sorted) {
    const list = map.get(paletteItem.color_palette) ?? [];
    list.push(paletteItem);
    map.set(paletteItem.color_palette, list);
  }
  return map;
}

function pickSingleDefaultOption(
  groupOptions: GroupOptionRecord[],
  versionItemsById: Map<string, VersionItemRecord>
): string | null {
  for (const option of groupOptions) {
    const versionItem = versionItemsById.get(option.version_item);
    if (!versionItem) {
      continue;
    }
    if (isAvailable(versionItem) && isDefault(versionItem)) {
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
    if (!versionItem) {
      continue;
    }
    if (isAvailable(versionItem)) {
      return versionItem.id;
    }
  }
  return null;
}

function pickFromColorPalette(args: {
  group: SelectionGroupRecord;
  paletteItemsById: Map<string, ColorPaletteItemRecord[]>;
  availableVersionItemsByItem: Map<string, VersionItemRecord[]>;
}): string | null {
  const paletteId = args.group.color_palette;
  if (!paletteId) {
    return null;
  }

  const paletteItems = args.paletteItemsById.get(paletteId) ?? [];
  for (const paletteItem of paletteItems) {
    const candidates = args.availableVersionItemsByItem.get(paletteItem.item) ?? [];
    const withColor = candidates.find((candidate) => hasColorHex(candidate));
    if (withColor) {
      return withColor.id;
    }
  }
  return null;
}

function hasResolvablePaletteOption(args: {
  group: SelectionGroupRecord;
  paletteItemsById: Map<string, ColorPaletteItemRecord[]>;
  availableVersionItemsByItem: Map<string, VersionItemRecord[]>;
}): boolean {
  return Boolean(pickFromColorPalette(args));
}

export function createDeterministicSelectionState(bundle: ModelVersionBundle): {
  selections: SelectionState;
  warnings: string[];
} {
  const warnings: string[] = [];
  const selections: SelectionState = {};
  const sortedGroups = [...bundle.selection_groups].sort(bySortThenId);
  const optionsByGroupId = groupOptionsByGroupId(bundle);
  const versionItemsById = versionItemById(bundle);
  const availableByItemId = availableVersionItemsByItemId(bundle);
  const paletteById = paletteItemsByPaletteId(bundle);

  for (const group of sortedGroups) {
    const key = selectionStateKey(group);
    const groupOptions = optionsByGroupId.get(group.id) ?? [];

    if (group.selection_mode === "single") {
      if (
        group.color_area &&
        group.color_palette &&
        !hasResolvablePaletteOption({
          group,
          paletteItemsById: paletteById,
          availableVersionItemsByItem: availableByItemId
        })
      ) {
        warnings.push(
          `color group "${selectionStateKey(group)}" has palette "${group.color_palette}" but no available palette item resolved to a version item with color_hex`
        );
      }

      const preferredDefault = pickSingleDefaultOption(groupOptions, versionItemsById);
      if (preferredDefault) {
        selections[key] = preferredDefault;
        continue;
      }

      const paletteDefault = pickFromColorPalette({
        group,
        paletteItemsById: paletteById,
        availableVersionItemsByItem: availableByItemId
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
        if (!versionItem) {
          continue;
        }
        if (isAvailable(versionItem) && isDefault(versionItem)) {
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
        if (isAvailable(versionItem) && isDefault(versionItem)) {
          quantity += 1;
        }
      }
      selections[key] = quantity;
    }
  }

  return { selections, warnings };
}

export function collectTintLayerWarnings(bundle: ModelVersionBundle): string[] {
  const warnings: string[] = [];
  const colorGroupAreaIds = new Set(
    bundle.selection_groups
      .map((group) => group.color_area ?? null)
      .filter((value): value is string => typeof value === "string" && value.length > 0)
  );

  const sortedLayers = [...bundle.render_layers].sort(bySortThenId);
  for (const layer of sortedLayers) {
    if (layer.layer_type !== "tint" || !layer.color_area) {
      continue;
    }

    if (!colorGroupAreaIds.has(layer.color_area)) {
      warnings.push(`tint layer "${layer.key}" references color_area "${layer.color_area}" with no matching color selection group`);
    }
  }

  return warnings;
}

export function createDirectusAssetUrlResolver(
  apiBaseUrl = readEnv("DIRECTUS_API_URL") ?? readEnv("DIRECTUS_URL")
): (fileId: string) => string {
  if (!apiBaseUrl) {
    throw new Error("DIRECTUS_API_URL (or DIRECTUS_URL) is required to resolve render asset URLs.");
  }

  const base = apiBaseUrl.replace(/\/$/, "");
  return (fileId: string) => `${base}/assets/${fileId}`;
}

export async function createConfiguratorSession(
  input: CreateConfiguratorSessionInput
): Promise<ConfiguratorSession> {
  const { modelVersionId, audience } = input;
  const { getModelVersionBundle } = await import("@ubb/cms-adapter-directus");
  const bundle = await getModelVersionBundle(modelVersionId);
  if (!bundle) {
    throw new Error(`No published model version bundle found for "${modelVersionId}".`);
  }
  return createConfiguratorSessionFromBundle({
    bundle,
    audience
  });
}

export async function createConfiguratorSessionFromBundle(
  input: CreateConfiguratorSessionFromBundleInput
): Promise<ConfiguratorSession> {
  const { bundle, audience } = input;
  void audience;
  const { selections, warnings } = createDeterministicSelectionState(bundle);
  warnings.push(...collectTintLayerWarnings(bundle));

  const colorByAreaKey = buildColorByAreaKey(bundle, selections, (message: unknown) => warnings.push(String(message)));
  const renders: Array<{ viewKey: string; dataUrl: string }> = [];
  if (bundle.render_views.length > 0) {
    warnings.push("server-side preview rendering is disabled; use client compositor or dedicated render endpoint");
  }

  return {
    modelVersionId: bundle.id,
    bundle,
    selections,
    colorByAreaKey,
    renders,
    warnings
  };
}
