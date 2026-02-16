import type { ModelVersionBundle } from "@ubb/cms-adapter-directus";

export interface ValidationError {
  code: string;
  path: string;
  message: string;
}

export type ValidateBundleResult = { ok: true } | { ok: false; errors: ValidationError[] };

export interface CompiledQuestion {
  id: string;
  key: string;
  label: string;
  group_id: string;
  group_key: string;
  input_type: string | null;
  required: boolean | null;
  default_value: string | null;
  option_ids: string[];
}

export interface CompiledOption {
  id: string;
  question_id: string;
  question_key: string;
  code: string | null;
  label: string;
  description: string | null;
  prices: {
    msrp: number | null;
    dealer: number | null;
    mode: string | null;
  };
  media_mode: string | null;
  is_default: boolean | null;
  render_mappings: Array<{
    view_key: string;
    layer_key: string;
    layer_id: string;
    asset_ids: string[];
  }>;
}

export interface CompiledLayerAsset {
  id: string;
  file: string | null;
  sort: number | null;
  option_id: string | null;
}

export interface CompiledLayer {
  id: string;
  key: string;
  z_index: number | null;
  assets_by_option_ref: Record<string, CompiledLayerAsset[]>;
}

export interface CompiledRenderView {
  id: string;
  key: string;
  label: string;
  base_image: string | null;
  layer_ids: string[];
  layers: Record<string, CompiledLayer>;
}

export interface CompiledPalette {
  id: string;
  key: string;
  label: string;
  color_ids: string[];
}

export interface CompiledColor {
  id: string;
  palette_id: string;
  name: string;
  hex: string;
}

export interface CompiledColorArea {
  id: string;
  key: string;
  view_key: string;
  mask_file: string | null;
  default_color_id: string | null;
}

export interface CompiledColorSelection {
  area_key: string;
  allowed_palette_id: string | null;
}

export interface CompiledRule {
  id: string;
  scope: string | null;
  priority: number | null;
  rule_json: Record<string, unknown>;
}

export interface CompiledModelConfig {
  metadata: {
    contract_version: "v0";
    model_version_id: string;
    model_year: number | null;
    version_label: string;
    compiled_at: string | null;
    compiled_hash: string;
  };
  questions_by_key: Record<string, CompiledQuestion>;
  options_by_id: Record<string, CompiledOption>;
  options_by_question_and_code: Record<string, string>;
  render: {
    view_keys: string[];
    views: Record<string, CompiledRenderView>;
  };
  colors: {
    palette_ids: string[];
    palettes_by_id: Record<string, CompiledPalette>;
    colors_by_id: Record<string, CompiledColor>;
    area_keys: string[];
    areas_by_key: Record<string, CompiledColorArea>;
    selections_by_question_key: Record<string, CompiledColorSelection[]>;
  };
  rules: CompiledRule[];
}

export interface CompileInput {
  bundle: ModelVersionBundle;
}
