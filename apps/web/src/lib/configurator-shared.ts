import type { ModelVersionBundle } from "@ubb/cms-adapter-directus";

export type SelectionValue = string | string[] | boolean | number | null;
export type SelectionState = Record<string, SelectionValue>;

export interface ConfigOptionView {
  id: string;
  versionItemId: string;
  label: string;
  sort: number | null;
}

export interface ConfigSelectionGroupView {
  id: string;
  key: string;
  title: string;
  selectionMode: "single" | "multi" | "boolean" | "quantity";
  sort: number | null;
  options: ConfigOptionView[];
}

export type ClientColorSelectionBundle = Pick<
  ModelVersionBundle,
  "selection_groups" | "group_options" | "version_items" | "color_palette_items"
>;

export interface ClientRenderConfig {
  assetBaseUrl: string;
  renderViews: ModelVersionBundle["render_views"];
  renderLayers: ModelVersionBundle["render_layers"];
  colorSelectionBundle: ClientColorSelectionBundle;
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
