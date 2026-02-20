"use client";

// Client-only: do not import @ubb/compiler or node:* modules
import type {
  ColorPaletteItemRecord,
  GroupOptionRecord,
  RenderLayerRecord,
  RenderViewRecord,
  VersionItemRecord
} from "@ubb/cms-adapter-directus";
import {
  bySortThenId,
  type ClientColorSelectionBundle,
  type ClientRenderConfig,
  type SelectionState
} from "../configurator-shared";

export interface ClientRenderResult {
  dataUrl: string | null;
  colorByAreaKey: Record<string, string>;
  warnings: string[];
}

type Logger = (message: string) => void;
type SelectionObject = Record<string, unknown>;

const imageCache = new Map<string, Promise<HTMLImageElement>>();

function readString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function directusAssetUrl(args: { assetBaseUrl: string; fileId: string; assetToken: string | null }): string {
  const fileId = args.fileId.trim();
  if (fileId.length === 0) {
    throw new Error("Render layer has an empty file id. Check render_layers.asset/mask_asset.");
  }

  const base = args.assetBaseUrl.replace(/\/$/, "");
  const url = new URL(`${base}/assets/${encodeURIComponent(fileId)}`);
  if (args.assetToken && args.assetToken.length > 0) {
    url.searchParams.set("access_token", args.assetToken);
  }
  return url.toString();
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

function buildColorByAreaKey(
  bundle: ClientColorSelectionBundle,
  selections: SelectionState,
  logger: Logger
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

function normalizeOpacity(opacity: number | null | undefined): number {
  if (typeof opacity !== "number" || !Number.isFinite(opacity)) {
    return 1;
  }
  if (opacity < 0) {
    return 0;
  }
  if (opacity > 1) {
    return 1;
  }
  return opacity;
}

function normalizeBlendMode(
  blendMode: RenderLayerRecord["blend_mode"]
): GlobalCompositeOperation {
  if (blendMode === "overlay" || blendMode === "screen") {
    return blendMode;
  }
  if (blendMode === "normal") {
    return "source-over";
  }
  return "multiply";
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function getContext2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("2d canvas context is not available");
  }
  return context;
}

async function fetchImageBlob(url: string): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(url, { method: "GET" });
  } catch {
    throw new Error(`Failed to fetch render asset ${url}. Check Directus CORS and connectivity.`);
  }

  if (!response.ok) {
    if (response.status === 403 || response.status === 404) {
      throw new Error(
        `Failed to fetch render asset ${url} (${response.status}). ` +
          "Verify app-reader token and read access to directus_files."
      );
    }
    throw new Error(`Failed to fetch render asset ${url} (${response.status}).`);
  }

  return response.blob();
}

function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(url);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    const blob = await fetchImageBlob(url);
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const blobUrl = URL.createObjectURL(blob);
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(blobUrl);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(blobUrl);
        reject(new Error(`Failed to decode render asset image ${url}.`));
      };
      image.src = blobUrl;
    });
  })();

  imageCache.set(url, promise);
  return promise;
}

function resolveMaskAssetForTint(
  tintLayer: RenderLayerRecord,
  maskLayers: RenderLayerRecord[]
): string | null {
  if (tintLayer.mask_asset) {
    return tintLayer.mask_asset;
  }

  if (tintLayer.color_area) {
    const byColorArea = maskLayers.find((maskLayer) => maskLayer.color_area === tintLayer.color_area);
    if (byColorArea?.asset) {
      return byColorArea.asset;
    }
  }

  const byKey = maskLayers.find((maskLayer) => maskLayer.key === tintLayer.key);
  if (byKey?.asset) {
    return byKey.asset;
  }

  return maskLayers[0]?.asset ?? null;
}

export async function renderFirstViewToDataUrl(args: {
  renderViews: RenderViewRecord[];
  renderLayers: RenderLayerRecord[];
  assetBaseUrl: string;
  assetToken: string | null;
  colorByAreaKey: Record<string, string>;
}): Promise<string | null> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("renderFirstViewToDataUrl requires a browser runtime");
  }

  const firstView = [...args.renderViews].sort(bySortThenId)[0] ?? null;
  if (!firstView) {
    return null;
  }

  const sortedLayers = args.renderLayers
    .filter((layer) => layer.render_view === firstView.id)
    .sort(bySortThenId);
  const imageLayers = sortedLayers.filter((layer) => layer.layer_type === "image" && layer.asset);
  const tintLayers = sortedLayers.filter((layer) => layer.layer_type === "tint");
  const decalLayers = sortedLayers.filter((layer) => layer.layer_type === "decal" && layer.asset);
  const maskLayers = sortedLayers.filter((layer) => layer.layer_type === "mask" && layer.asset);
  const firstImageLayer = imageLayers[0] ?? null;

  if (!firstImageLayer?.asset) {
    throw new Error(`render view "${firstView.key}" has no base image layer`);
  }

  const baseImage = await loadImage(
    directusAssetUrl({
      assetBaseUrl: args.assetBaseUrl,
      fileId: firstImageLayer.asset,
      assetToken: args.assetToken
    })
  );
  const canvas = createCanvas(baseImage.naturalWidth || baseImage.width, baseImage.naturalHeight || baseImage.height);
  const context = getContext2d(canvas);

  context.clearRect(0, 0, canvas.width, canvas.height);

  for (const layer of imageLayers) {
    const image = await loadImage(
      directusAssetUrl({
        assetBaseUrl: args.assetBaseUrl,
        fileId: layer.asset,
        assetToken: args.assetToken
      })
    );
    context.save();
    context.globalCompositeOperation = normalizeBlendMode(layer.blend_mode);
    context.globalAlpha = normalizeOpacity(layer.opacity);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    context.restore();
  }

  for (const layer of tintLayers) {
    const areaKey = layer.color_area_detail?.key;
    const selectedColor = areaKey ? args.colorByAreaKey[areaKey] : null;
    if (!selectedColor) {
      continue;
    }

    const maskAsset = resolveMaskAssetForTint(layer, maskLayers);
    if (!maskAsset) {
      continue;
    }

    const maskImage = await loadImage(
      directusAssetUrl({
        assetBaseUrl: args.assetBaseUrl,
        fileId: maskAsset,
        assetToken: args.assetToken
      })
    );
    const offscreen = createCanvas(canvas.width, canvas.height);
    const offscreenContext = getContext2d(offscreen);

    offscreenContext.clearRect(0, 0, offscreen.width, offscreen.height);
    offscreenContext.globalCompositeOperation = "source-over";
    offscreenContext.fillStyle = selectedColor;
    offscreenContext.fillRect(0, 0, offscreen.width, offscreen.height);
    offscreenContext.globalCompositeOperation = "destination-in";
    offscreenContext.drawImage(maskImage, 0, 0, offscreen.width, offscreen.height);

    context.save();
    context.globalCompositeOperation = normalizeBlendMode(layer.blend_mode);
    context.globalAlpha = normalizeOpacity(layer.opacity);
    context.drawImage(offscreen, 0, 0, canvas.width, canvas.height);
    context.restore();
  }

  for (const layer of decalLayers) {
    const image = await loadImage(
      directusAssetUrl({
        assetBaseUrl: args.assetBaseUrl,
        fileId: layer.asset,
        assetToken: args.assetToken
      })
    );
    context.save();
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = normalizeOpacity(layer.opacity);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    context.restore();
  }

  return canvas.toDataURL("image/png");
}

export async function renderMaskTintPreview(args: {
  renderConfig: ClientRenderConfig;
  selections: SelectionState;
}): Promise<ClientRenderResult> {
  const warnings: string[] = [];
  const colorByAreaKey = buildColorByAreaKey(
    args.renderConfig.colorSelectionBundle,
    args.selections,
    (message: string) => warnings.push(message)
  );
  const dataUrl = await renderFirstViewToDataUrl({
    renderViews: args.renderConfig.renderViews,
    renderLayers: args.renderConfig.renderLayers,
    assetBaseUrl: args.renderConfig.assetBaseUrl,
    assetToken: args.renderConfig.assetToken,
    colorByAreaKey
  });

  return {
    dataUrl,
    colorByAreaKey,
    warnings
  };
}
