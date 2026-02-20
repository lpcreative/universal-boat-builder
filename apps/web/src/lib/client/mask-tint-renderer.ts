import type { ConfigRenderLayerView, ConfigRenderView } from "../configurator-shared";

interface RenderClientViewInput {
  renderView: ConfigRenderView;
  layers: ConfigRenderLayerView[];
  colorByAreaKey: Record<string, string>;
  assetUrlResolver: (assetId: string) => string;
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

function normalizeBlendMode(blendMode: ConfigRenderLayerView["blendMode"]): GlobalCompositeOperation {
  if (blendMode === "multiply" || blendMode === "overlay" || blendMode === "screen") {
    return blendMode;
  }
  return "source-over";
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

async function resolveCanvasSize(layers: ConfigRenderLayerView[]): Promise<{ width: number; height: number } | null> {
  const firstAssetLayer = layers.find((layer) => layer.layerType === "image" || layer.layerType === "decal");
  if (!firstAssetLayer) {
    return null;
  }

  const image = await loadImage(firstAssetLayer.assetUrl);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  if (!width || !height) {
    return null;
  }

  return { width, height };
}

function applyImageLayer(args: {
  context: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  layer: ConfigRenderLayerView;
  image: CanvasImageSource;
}): void {
  args.context.save();
  args.context.globalCompositeOperation = normalizeBlendMode(args.layer.blendMode);
  args.context.globalAlpha = normalizeOpacity(args.layer.opacity);
  args.context.drawImage(args.image, 0, 0, args.canvas.width, args.canvas.height);
  args.context.restore();
}

async function drawTintLayer(args: {
  context: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  layer: ConfigRenderLayerView;
  colorByAreaKey: Record<string, string>;
  assetUrlResolver: (assetId: string) => string;
}): Promise<void> {
  const areaKey = args.layer.colorAreaKey;
  const selectedColor = areaKey ? args.colorByAreaKey[areaKey] : null;
  const maskAssetId = args.layer.maskAssetId;
  if (!selectedColor || !maskAssetId) {
    return;
  }

  const maskUrl = args.layer.maskAssetUrl ?? args.assetUrlResolver(maskAssetId);
  if (!maskUrl) {
    return;
  }

  const maskImage = await loadImage(maskUrl);
  const tintCanvas = createCanvas(args.canvas.width, args.canvas.height);
  const tintContext = getContext2d(tintCanvas);

  tintContext.clearRect(0, 0, tintCanvas.width, tintCanvas.height);
  tintContext.globalCompositeOperation = "source-over";
  tintContext.fillStyle = selectedColor;
  tintContext.fillRect(0, 0, tintCanvas.width, tintCanvas.height);
  tintContext.globalCompositeOperation = "destination-in";
  tintContext.drawImage(maskImage, 0, 0, tintCanvas.width, tintCanvas.height);

  applyImageLayer({
    context: args.context,
    canvas: args.canvas,
    layer: args.layer,
    image: tintCanvas
  });
}

export async function renderMaskTintPreviewDataUrl(input: RenderClientViewInput): Promise<string | null> {
  const sortedLayers = input.layers
    .filter((layer) => layer.renderViewId === input.renderView.id)
    .sort(bySortThenId);

  if (sortedLayers.length === 0) {
    return null;
  }

  const canvasSize = await resolveCanvasSize(sortedLayers);
  if (!canvasSize) {
    return null;
  }

  const canvas = createCanvas(canvasSize.width, canvasSize.height);
  const context = getContext2d(canvas);
  context.clearRect(0, 0, canvas.width, canvas.height);

  for (const layer of sortedLayers) {
    if (layer.layerType === "tint") {
      await drawTintLayer({
        context,
        canvas,
        layer,
        colorByAreaKey: input.colorByAreaKey,
        assetUrlResolver: input.assetUrlResolver
      });
      continue;
    }

    if (layer.layerType !== "image" && layer.layerType !== "decal") {
      continue;
    }

    const assetUrl = layer.assetUrl || input.assetUrlResolver(layer.assetId);
    if (!assetUrl) {
      continue;
    }

    const image = await loadImage(assetUrl);
    applyImageLayer({
      context,
      canvas,
      layer,
      image
    });
  }

  return canvas.toDataURL("image/png");
}
