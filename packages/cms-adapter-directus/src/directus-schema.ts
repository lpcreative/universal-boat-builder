export type ModelVersionStatus = "draft" | "published" | "archived";

export interface ColorRecord {
  id: string;
  name: string;
  hex: string;
  sort?: number | null;
}

export interface OptionRecord {
  id: string;
  key: string;
  label: string;
  sort?: number | null;
}

export interface QuestionRecord {
  id: string;
  key: string;
  label: string;
  input_type?: string | null;
  sort?: number | null;
  options?: OptionRecord[];
}

export interface OptionGroupRecord {
  id: string;
  key: string;
  label: string;
  sort?: number | null;
  questions?: QuestionRecord[];
}

export interface LayerAssetRecord {
  id: string;
  asset_role?: string | null;
  sort?: number | null;
  file?: string | null;
}

export interface ColorSelectionRecord {
  id: string;
  sort?: number | null;
  color?: ColorRecord | null;
  option?: OptionRecord | null;
}

export interface ColorAreaRecord {
  id: string;
  key: string;
  sort?: number | null;
  mask_file?: string | null;
  color_selections?: ColorSelectionRecord[];
}

export interface LayerRecord {
  id: string;
  key: string;
  sort?: number | null;
  blend_mode?: string | null;
  opacity?: number | null;
  layer_assets?: LayerAssetRecord[];
  color_areas?: ColorAreaRecord[];
}

export interface RenderViewRecord {
  id: string;
  key: string;
  label: string;
  sort?: number | null;
  layers?: LayerRecord[];
}

export interface ColorPaletteRecord {
  id: string;
  key: string;
  label: string;
  sort?: number | null;
  colors?: ColorRecord[];
}

export interface RuleRecord {
  id: string;
  scope?: string | null;
  priority?: number | null;
  enabled?: boolean | null;
  rule_json?: Record<string, unknown> | null;
}

export interface ModelVersionRecord {
  id: string;
  model_id: string;
  version_label: string;
  status: ModelVersionStatus;
  published_at: string | null;
  option_groups?: OptionGroupRecord[];
  render_views?: RenderViewRecord[];
  color_palettes?: ColorPaletteRecord[];
  rules?: RuleRecord[];
}

export interface BoatModelRecord {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  model_versions?: ModelVersionRecord[];
}

export interface DirectusSchema {
  boat_models: BoatModelRecord[];
  model_versions: ModelVersionRecord[];
  option_groups: OptionGroupRecord[];
  questions: QuestionRecord[];
  options: OptionRecord[];
  render_views: RenderViewRecord[];
  layers: LayerRecord[];
  layer_assets: LayerAssetRecord[];
  color_palettes: ColorPaletteRecord[];
  colors: ColorRecord[];
  color_areas: ColorAreaRecord[];
  color_selections: ColorSelectionRecord[];
  rules: RuleRecord[];
}

export interface PublishedModel extends BoatModelRecord {
  model_versions: ModelVersionRecord[];
}

export interface ModelVersionBundle extends ModelVersionRecord {
  option_groups: OptionGroupRecord[];
  render_views: RenderViewRecord[];
  color_palettes: ColorPaletteRecord[];
  rules: RuleRecord[];
}
