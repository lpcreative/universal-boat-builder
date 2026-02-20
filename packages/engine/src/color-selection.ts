import type {
  ColorPaletteItemRecord,
  GroupOptionRecord,
  ModelVersionBundle,
  VersionItemRecord
} from "@ubb/cms-adapter-directus";

type SelectionObject = Record<string, unknown>;

export type ColorSelectionState = Record<string, unknown>;

type Logger = (message: string) => void;

function bySortThenId<T extends { sort?: number | null; id: string }>(a: T, b: T): number {
  const aSort = a.sort ?? Number.MAX_SAFE_INTEGER;
  const bSort = b.sort ?? Number.MAX_SAFE_INTEGER;
  if (aSort !== bSort) {
    return aSort - bSort;
  }
  return a.id.localeCompare(b.id);
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function pickFromObject(value: SelectionObject, keys: string[]): string | null {
  for (const key of keys) {
    const resolved = readString(value[key]);
    if (resolved) {
      return resolved;
    }
  }
  return null;
}

function normalizeSelectionCandidates(value: unknown): string[] {
  if (typeof value === "string" && value.length > 0) {
    return [value];
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return [String(value)];
  }

  if (Array.isArray(value)) {
    const result: string[] = [];
    for (const item of value) {
      result.push(...normalizeSelectionCandidates(item));
    }
    return result;
  }

  if (typeof value === "object" && value !== null) {
    const objectValue = value as SelectionObject;
    const direct = pickFromObject(objectValue, [
      "item",
      "item_id",
      "itemId",
      "version_item",
      "version_item_id",
      "versionItem",
      "versionItemId",
      "option",
      "option_id",
      "optionId",
      "group_option",
      "group_option_id",
      "groupOption",
      "groupOptionId",
      "id",
      "value"
    ]);
    return direct ? [direct] : [];
  }

  return [];
}

function firstDefaultGroupOption(groupOptions: GroupOptionRecord[]): GroupOptionRecord | null {
  const sorted = [...groupOptions].sort(bySortThenId);
  const selected = sorted.find((option) => option.default_state === "selected");
  return selected ?? null;
}

function resolveSelectedColorItemId(args: {
  selectionValue: unknown;
  groupOptions: GroupOptionRecord[];
  versionItemById: Map<string, VersionItemRecord>;
  groupOptionById: Map<string, GroupOptionRecord>;
  colorItemIds: Set<string>;
}): string | null {
  const candidates = normalizeSelectionCandidates(args.selectionValue);

  for (const candidate of candidates) {
    if (args.colorItemIds.has(candidate)) {
      return candidate;
    }

    const versionItem = args.versionItemById.get(candidate);
    if (versionItem && args.colorItemIds.has(versionItem.item)) {
      return versionItem.item;
    }

    const groupOption = args.groupOptionById.get(candidate);
    if (groupOption) {
      const optionVersionItem = args.versionItemById.get(groupOption.version_item);
      if (optionVersionItem && args.colorItemIds.has(optionVersionItem.item)) {
        return optionVersionItem.item;
      }
    }
  }

  const fallbackDefault = firstDefaultGroupOption(args.groupOptions);
  if (fallbackDefault) {
    const fallbackVersionItem = args.versionItemById.get(fallbackDefault.version_item);
    if (fallbackVersionItem && args.colorItemIds.has(fallbackVersionItem.item)) {
      return fallbackVersionItem.item;
    }
  }

  return null;
}

function paletteItemIdsByPalette(
  colorPaletteItems: ColorPaletteItemRecord[]
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const paletteItem of colorPaletteItems) {
    const list = result.get(paletteItem.color_palette) ?? new Set<string>();
    list.add(paletteItem.item);
    result.set(paletteItem.color_palette, list);
  }
  return result;
}

function itemColorHexByItemId(
  versionItems: VersionItemRecord[],
  colorPaletteItems: ColorPaletteItemRecord[]
): Map<string, string> {
  const result = new Map<string, string>();

  for (const versionItem of versionItems) {
    const colorHex = readString(versionItem.item_detail?.color_hex);
    if (colorHex) {
      result.set(versionItem.item, colorHex);
    }
  }

  for (const paletteItem of colorPaletteItems) {
    const colorHex = readString(paletteItem.item_detail?.color_hex);
    if (colorHex) {
      result.set(paletteItem.item, colorHex);
    }
  }

  return result;
}

export function buildColorByAreaKey(
  bundle: Pick<
    ModelVersionBundle,
    "selection_groups" | "group_options" | "version_items" | "color_palette_items"
  >,
  selections: ColorSelectionState,
  logger: Logger = (message) => console.warn(message)
): Record<string, string> {
  const colorByAreaKey: Record<string, string> = {};
  const versionItemById = new Map(
    bundle.version_items.map((item: VersionItemRecord): [string, VersionItemRecord] => [item.id, item])
  );
  const groupOptionById = new Map(
    bundle.group_options.map((option: GroupOptionRecord): [string, GroupOptionRecord] => [option.id, option])
  );
  const groupOptionsByGroupId = new Map<string, GroupOptionRecord[]>();
  const sortedGroupOptions = [...bundle.group_options].sort(bySortThenId);
  const colorHexByItemId = itemColorHexByItemId(bundle.version_items, bundle.color_palette_items);
  const colorItemIds = new Set<string>(Array.from(colorHexByItemId.keys()));
  const paletteItems = paletteItemIdsByPalette(bundle.color_palette_items);

  for (const groupOption of sortedGroupOptions) {
    const list = groupOptionsByGroupId.get(groupOption.selection_group) ?? [];
    list.push(groupOption);
    groupOptionsByGroupId.set(groupOption.selection_group, list);
  }

  const sortedGroups = [...bundle.selection_groups].sort(bySortThenId);
  for (const group of sortedGroups) {
    const areaKey = readString(group.color_area_detail?.key);
    if (!areaKey) {
      continue;
    }

    const selectedItemId = resolveSelectedColorItemId({
      selectionValue: selections[group.key],
      groupOptions: groupOptionsByGroupId.get(group.id) ?? [],
      versionItemById,
      groupOptionById,
      colorItemIds
    });
    if (!selectedItemId) {
      continue;
    }

    const paletteId = readString(group.color_palette);
    if (paletteId) {
      const allowedItems = paletteItems.get(paletteId);
      if (allowedItems && !allowedItems.has(selectedItemId)) {
        logger(
          `color selection mismatch for group "${group.key}": item "${selectedItemId}" is not in palette "${paletteId}"`
        );
      }
    }

    const selectedHex = colorHexByItemId.get(selectedItemId);
    if (!selectedHex) {
      continue;
    }
    colorByAreaKey[areaKey] = selectedHex;
  }

  return colorByAreaKey;
}
