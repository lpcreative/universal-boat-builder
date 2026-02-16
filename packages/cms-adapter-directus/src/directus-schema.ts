export interface ManufacturerRecord {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
}

export interface ModelSeriesRecord {
  id: string;
  manufacturer_id?: string | null;
  slug?: string | null;
  name?: string | null;
  sort?: number | null;
}

export interface ColorRecord {
  id: string;
  name: string;
  hex: string;
  color_palette_id?: string | null;
  sort?: number | null;
}

export interface OptionRecord {
  id: string;
  question_id?: string | null;
  key: string;
  code?: string | null;
  label: string;
  description?: string | null;
  price_msrp?: number | null;
  price_dealer?: number | null;
  price_mode?: string | null;
  media_mode?: string | null;
  is_default?: boolean | null;
  is_available?: boolean | null;
  sort?: number | null;
}

export interface QuestionRecord {
  id: string;
  option_group_id?: string | null;
  key: string;
  label: string;
  input_type?: string | null;
  is_required?: boolean | null;
  default_value?: string | null;
  sort?: number | null;
  options?: OptionRecord[];
}

export interface OptionGroupRecord {
  id: string;
  model_version_id?: string | null;
  key: string;
  label: string;
  sort?: number | null;
  questions?: QuestionRecord[];
}

export interface LayerAssetRecord {
  id: string;
  layer_id?: string | null;
  option_id?: string | null;
  asset_role?: string | null;
  sort?: number | null;
  file?: string | null;
}

export interface ColorSelectionRecord {
  id: string;
  color_area_id?: string | null;
  question_id?: string | null;
  allowed_palette_id?: string | null;
  sort?: number | null;
  color?: ColorRecord | null;
  option?: OptionRecord | null;
}

export interface ColorAreaRecord {
  id: string;
  layer_id?: string | null;
  render_view_id?: string | null;
  key: string;
  sort?: number | null;
  mask_file?: string | null;
  default_color_id?: string | null;
  color_selections?: ColorSelectionRecord[];
}

export interface LayerRecord {
  id: string;
  render_view_id?: string | null;
  key: string;
  z_index?: number | null;
  sort?: number | null;
  blend_mode?: string | null;
  opacity?: number | null;
  layer_assets?: LayerAssetRecord[];
  color_areas?: ColorAreaRecord[];
}

export interface RenderViewRecord {
  id: string;
  model_version_id?: string | null;
  key: string;
  label: string;
  base_image?: string | null;
  sort?: number | null;
  layers?: LayerRecord[];
}

export interface ColorPaletteRecord {
  id: string;
  model_version_id?: string | null;
  key: string;
  label: string;
  sort?: number | null;
  colors?: ColorRecord[];
}

export interface RuleRecord {
  id: string;
  model_version_id?: string | null;
  scope?: string | null;
  priority?: number | null;
  enabled?: boolean | null;
  rule_json?: Record<string, unknown> | null;
}

export interface ModelVersionRecord {
  id: string;
  manufacturer_id?: string | null;
  model_id: string;
  model_slug?: string | null;
  model_year?: number | null;
  version_label: string;
  status: "draft" | "published" | "archived";
  published_at: string | null;
  compiled_hash?: string | null;
  compiled_at?: string | null;
  option_groups?: OptionGroupRecord[];
  render_views?: RenderViewRecord[];
  color_palettes?: ColorPaletteRecord[];
  rules?: RuleRecord[];
}

export interface BoatModelRecord {
  id: string;
  manufacturer_id?: string | null;
  slug: string;
  name: string;
  is_active: boolean;
  model_versions?: ModelVersionRecord[];
}

export interface DirectusFileRecord {
  id: string;
  title?: string | null;
  filename_download?: string | null;
  type?: string | null;
}

export interface DirectusSchema {
  manufacturers: ManufacturerRecord[];
  model_series: ModelSeriesRecord[];
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
  directus_files: DirectusFileRecord[];
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
