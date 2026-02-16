export type DirectusStatus = "draft" | "published" | "archived";
export type RenderLayerType = "image" | "mask" | "tint" | "decal";
export type RenderBlendMode = "multiply" | "overlay" | "screen" | "normal";

export interface ModelSeriesRecord {
  id: string;
  key?: string | null;
  name?: string | null;
  description?: string | null;
  default_flow_template_key?: string | null;
  sort?: number | null;
}

export interface BoatModelRecord {
  id: string;
  model_code?: string | null;
  name: string;
  series?: string | null;
  default_flow_template_key?: string | null;
  sort?: number | null;
}

export interface ModelVersionRecord {
  id: string;
  boat_model: string;
  year?: number | null;
  trim?: string | null;
  notes?: string | null;
  published_revision?: string | null;
  sort?: number | null;
  status: DirectusStatus;
}

export interface VersionRevisionRecord {
  id: string;
  model_version: string;
  revision_number?: number | null;
  effective_date?: string | null;
  change_log?: string | null;
  sort?: number | null;
  status: DirectusStatus;
}

export interface ItemRecord {
  id: string;
  key?: string | null;
  label_default: string;
  description?: string | null;
  internal_code?: string | null;
  vendor_code?: string | null;
  fulfillment?: string | null;
  item_category?: string | null;
  color_hex?: string | null;
  is_color?: boolean | null;
  sort?: number | null;
}

export interface VersionItemRecord {
  id: string;
  revision: string;
  item: string;
  label_override?: string | null;
  msrp?: number | null;
  dealer_price?: number | null;
  is_available?: boolean | null;
  is_included?: boolean | null;
  is_default?: boolean | null;
  source_ref?: string | null;
  notes?: string | null;
  build_notes?: string | null;
  sort_hint?: number | null;
  sort?: number | null;
  item_detail?: ItemRecord | null;
}

export interface FlowRecord {
  id: string;
  revision: string;
  template_key: string;
  title: string;
  audience?: string | null;
  sort?: number | null;
}

export interface FlowStepRecord {
  id: string;
  flow: string;
  key: string;
  title: string;
  help_text?: string | null;
  sort?: number | null;
}

export interface FlowSectionRecord {
  id: string;
  step: string;
  title: string;
  sort?: number | null;
}

export type SelectionMode = "single" | "multi" | "boolean" | "quantity";

export interface SelectionGroupRecord {
  id: string;
  section: string;
  key: string;
  title: string;
  selection_mode: SelectionMode;
  min_select?: number | null;
  max_select?: number | null;
  is_required?: boolean | null;
  help_text?: string | null;
  color_area?: string | null;
  color_palette?: string | null;
  color_area_detail?: ColorAreaRecord | null;
  color_palette_detail?: ColorPaletteRecord | null;
  sort?: number | null;
}

export interface GroupOptionRecord {
  id: string;
  selection_group: string;
  version_item: string;
  label_override?: string | null;
  default_state?: string | null;
  override_msrp?: number | null;
  override_dealer_price?: number | null;
  sort?: number | null;
}

export interface ColorAreaRecord {
  id: string;
  key: string;
  title: string;
  sort?: number | null;
}

export interface ColorPaletteRecord {
  id: string;
  revision: string;
  key: string;
  title: string;
  sort?: number | null;
}

export interface ColorPaletteItemRecord {
  id: string;
  color_palette: string;
  item: string;
  sort?: number | null;
  item_detail?: ItemRecord | null;
}

export interface RenderViewRecord {
  id: string;
  revision: string;
  key: string;
  title: string;
  sort?: number | null;
}

export interface RenderLayerRecord {
  id: string;
  render_view: string;
  key: string;
  layer_type: RenderLayerType;
  asset: string;
  mask_asset?: string | null;
  color_area?: string | null;
  color_area_detail?: ColorAreaRecord | null;
  blend_mode?: RenderBlendMode | null;
  opacity?: number | null;
  sort?: number | null;
}

export interface PublishedModelVersionRecord extends ModelVersionRecord {
  version_label: string;
  published_at: string | null;
}

export interface DirectusSchema {
  model_series: ModelSeriesRecord[];
  boat_models: BoatModelRecord[];
  model_versions: ModelVersionRecord[];
  version_revisions: VersionRevisionRecord[];
  items: ItemRecord[];
  version_items: VersionItemRecord[];
  flows: FlowRecord[];
  flow_steps: FlowStepRecord[];
  flow_sections: FlowSectionRecord[];
  selection_groups: SelectionGroupRecord[];
  group_options: GroupOptionRecord[];
  color_areas: ColorAreaRecord[];
  color_palettes: ColorPaletteRecord[];
  color_palette_items: ColorPaletteItemRecord[];
  render_views: RenderViewRecord[];
  render_layers: RenderLayerRecord[];
}

export interface PublishedModel extends BoatModelRecord {
  slug: string;
  model_versions: PublishedModelVersionRecord[];
}

export interface ModelVersionBundle extends ModelVersionRecord {
  model_year: number | null;
  version_label: string;
  published_at: string | null;
  current_revision: VersionRevisionRecord | null;
  version_revisions: VersionRevisionRecord[];
  version_items: VersionItemRecord[];
  flows: FlowRecord[];
  flow_steps: FlowStepRecord[];
  flow_sections: FlowSectionRecord[];
  selection_groups: SelectionGroupRecord[];
  group_options: GroupOptionRecord[];
  color_areas: ColorAreaRecord[];
  color_palettes: ColorPaletteRecord[];
  color_palette_items: ColorPaletteItemRecord[];
  render_views: RenderViewRecord[];
  render_layers: RenderLayerRecord[];
}
