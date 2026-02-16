import type { RenderLayerRecord, RenderViewRecord } from "@ubb/cms-adapter-directus";

export interface RenderMaskTintInput {
  view: RenderViewRecord;
  layers: RenderLayerRecord[];
  selections?: Record<string, unknown>;
  colorByAreaKey: Record<string, string>;
  fileUrlForId: (fileId: string) => string;
}

const imageCache = new Map<string, Promise<HTMLImageElement>>();

function bySortThenId<T extends { sort?: number | null; id: string }>(a: T, b: T): number {
  const aSort = a.sort ?? Number.MAX_SAFE_INTEGER;
  const bSort = b.sort ?? Number.MAX_SAFE_INTEGER;
  if (aSort !== bSort) {
    return aSort - bSort;
  }
  return a.id.localeCompare(b.id);
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

function loadImage(url: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(url);
  if (cached) {
    return cached;
  }

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`failed to load image: ${url}`));
    image.src = url;
  });

  imageCache.set(url, promise);
  return promise;
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof document === "undefined") {
    throw new Error("render_view_to_canvas requires a browser-like runtime with document");
  }

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

export async function render_view_to_canvas(input: RenderMaskTintInput): Promise<HTMLCanvasElement> {
  const sortedLayers = input.layers
    .filter((layer) => layer.render_view === input.view.id)
    .sort(bySortThenId);

  const baseLayer = sortedLayers.find((layer) => layer.layer_type === "image");
  if (!baseLayer?.asset) {
    throw new Error(`render view "${input.view.key}" has no base image layer`);
  }

  const baseImage = await loadImage(input.fileUrlForId(baseLayer.asset));
  const canvas = createCanvas(baseImage.naturalWidth || baseImage.width, baseImage.naturalHeight || baseImage.height);
  const context = getContext2d(canvas);

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = "source-over";
  context.globalAlpha = 1;
  context.drawImage(baseImage, 0, 0, canvas.width, canvas.height);

  for (const layer of sortedLayers) {
    if (layer.layer_type !== "tint") {
      continue;
    }

    const areaKey = layer.color_area_detail?.key;
    const selectedColor = areaKey ? input.colorByAreaKey[areaKey] : null;
    const maskAsset = layer.mask_asset ?? null;
    if (!selectedColor || !maskAsset) {
      continue;
    }

    const maskImage = await loadImage(input.fileUrlForId(maskAsset));
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

  for (const layer of sortedLayers) {
    if (layer.layer_type !== "decal" || !layer.asset) {
      continue;
    }

    const decalImage = await loadImage(input.fileUrlForId(layer.asset));
    context.save();
    context.globalCompositeOperation = "source-over";
    context.globalAlpha = 1;
    context.drawImage(decalImage, 0, 0, canvas.width, canvas.height);
    context.restore();
  }

  return canvas;
}

export async function render_view_to_data_url(input: RenderMaskTintInput): Promise<string> {
  const canvas = await render_view_to_canvas(input);
  return canvas.toDataURL("image/png");
}
