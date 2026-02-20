import type { ModelVersionBundle } from "@ubb/cms-adapter-directus";
import type { SelectionState } from "@ubb/engine";

export type { SelectionState };

export interface ConfigOptionView {
  id: string;
  versionItemId: string;
  label: string;
  msrp: number | null;
  dealer: number | null;
  overrideMsrp: number | null;
  overrideDealer: number | null;
  colorHex: string | null;
  category: string | null;
  vendorCode: string | null;
  internalCode: string | null;
  isIncluded: boolean;
  sort: number | null;
}

export interface ConfigSelectionGroupView {
  id: string;
  sectionId: string;
  key: string;
  title: string;
  selectionMode: "single" | "multi" | "boolean" | "quantity";
  helpText: string | null;
  colorAreaKey: string | null;
  sort: number | null;
  options: ConfigOptionView[];
}

export interface ConfigFlowSectionView {
  id: string;
  stepId: string;
  title: string;
  sort: number | null;
  groups: ConfigSelectionGroupView[];
}

export interface ConfigFlowStepView {
  id: string;
  key: string;
  title: string;
  helpText: string | null;
  sort: number | null;
  sections: ConfigFlowSectionView[];
}

export interface ConfigRenderLayerView {
  id: string;
  renderViewId: string;
  key: string;
  layerType: "image" | "mask" | "tint" | "decal";
  assetId: string;
  assetUrl: string;
  maskAssetId: string | null;
  maskAssetUrl: string | null;
  colorAreaKey: string | null;
  blendMode: "multiply" | "overlay" | "screen" | "normal" | null;
  opacity: number | null;
  sort: number | null;
}

export interface ConfigRenderView {
  id: string;
  key: string;
  title: string;
  sort: number | null;
  layers: ConfigRenderLayerView[];
}

export interface ConfiguratorClientData {
  modelVersionId: string;
  bundle: ModelVersionBundle;
  steps: ConfigFlowStepView[];
  renderViews: ConfigRenderView[];
  initialRenderViewId: string | null;
  selections: SelectionState;
  colorByAreaKey: Record<string, string>;
}

export function bySortThenId<T extends { sort?: number | null; id: string }>(a: T, b: T): number {
  const aSort = a.sort ?? Number.MAX_SAFE_INTEGER;
  const bSort = b.sort ?? Number.MAX_SAFE_INTEGER;
  if (aSort !== bSort) {
    return aSort - bSort;
  }
  return a.id.localeCompare(b.id);
}

export function sanitizeSelectionState(input: unknown): SelectionState {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  const result: SelectionState = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value === "string" || typeof value === "boolean") {
      result[key] = value;
      continue;
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      result[key] = value;
      continue;
    }

    if (value === null) {
      result[key] = null;
      continue;
    }

    if (Array.isArray(value)) {
      result[key] = value.filter((entry): entry is string => typeof entry === "string");
    }
  }

  return result;
}
