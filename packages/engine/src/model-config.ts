// packages/engine/src/model-config.ts

export type ViewId = 'profile' | 'overhead' | 'detail';
export type FieldType =
  | 'single_select'
  | 'multi_select'
  | 'toggle'
  | 'number'
  | 'text'
  | 'package_select'
  | 'computed';

export type PriceMode = 'msrp' | 'dealer' | 'both';

export interface ModelConfig {
  meta: {
    clientId: string;
    clientSlug: string;
    modelId: string;
    modelSlug: string;
    modelVersionId: string;
    versionLabel: string; // e.g., '2026 MSRP v1'
    publishedAtISO: string; // ISO string
    locale?: string; // default 'en-US'
    currency?: string; // default 'USD'
  };

  branding: {
    logoUrl?: string;
    primaryColorHex?: string;
    disclaimerText?: string;
    contactEmail?: string;
    contactPhone?: string;
  };

  form: {
    steps: StepDef[];
    // Optional lookup for UI convenience. Engine should not require this.
    fieldsById?: Record<string, FieldDef>;
  };

  rules: {
    // A compiled list of rules already merged across scopes (client/model/version).
    // priority resolves conflicts: higher priority wins.
    rules: RuleDef[];
  };

  derived?: {
    derivedFields?: DerivedFieldDef[];
    mappings?: Record<string, Record<string, unknown>>; // compatibility/mapping tables
  };

  pricing: {
    mode: PriceMode;
    basePrice: Money;
    // Optional: trim-level base prices (if model has trims)
    trimBasePrices?: Record<string, Money>;

    // Packages can auto-include options and/or add their own price.
    packages?: PackageDef[];

    // Rule-driven conditional line items (rigging surcharges, etc.)
    lineItemRules?: PricingRuleDef[];

    // Notes for PDFs/build sheet
    notes?: string;
  };

  rendering: {
    views: ViewDef[];
    layerGroups?: LayerGroupDef[];
    galleries?: GalleryDef[];
  };

  validation?: {
    // Optional: global constraints (e.g., max total selections in a group)
    constraints?: ConstraintDef[];
  };
}

export interface StepDef {
  id: string;
  title: string;
  description?: string;
  order: number;
  sections: SectionDef[];
}

export interface SectionDef {
  id: string;
  title: string;
  description?: string;
  order: number;
  fields: FieldDef[];
}

export interface FieldDef {
  id: string;
  type: FieldType;
  label: string;
  helpText?: string;
  order: number;

  // UI behavior
  requiredByDefault?: boolean; // rules can override
  defaultValue?: BuilderValue;
  visibleByDefault?: boolean; // rules can override

  // Value constraints
  min?: number;
  max?: number;
  step?: number;

  // Options for select-like fields
  options?: OptionDef[];

  // Optional: grouping / analytics
  tags?: string[];
}

export interface OptionDef {
  id: string;
  label: string;
  code?: string; // build code/SKU

  // Pricing delta when selected (may be 0)
  price?: Money;

  // Optional: display helpers
  swatchHex?: string;
  thumbnailUrl?: string;

  // Optional: preview behavior (does not necessarily affect layered rendering)
  preview?: {
    mode: 'none' | 'gallery' | 'tooltip_image';
    galleryId?: string;
    tooltipImageUrl?: string;
  };

  // Optional: compatibility tags (can drive mappings)
  tags?: string[];
}

export type BuilderValue = string | number | boolean | null | string[];

export interface Money {
  amount: number; // store as decimal in DB; number in JS at runtime
  currency: string; // 'USD'
}

// ----------------------
// Rules DSL (compiled)
// ----------------------

export interface RuleDef {
  id: string;
  description?: string;
  priority: number; // higher wins
  when: ConditionExpr;
  then: ActionDef[];
  else?: ActionDef[];
  origin?: {
    scope: 'client' | 'model' | 'version' | 'system';
    sourceId?: string; // id of the entity that generated this rule
  };
}

export type ConditionExpr =
  | { all: ConditionExpr[] }
  | { any: ConditionExpr[] }
  | { not: ConditionExpr }
  | { eq: [fieldId: string, value: BuilderValue] }
  | { neq: [fieldId: string, value: BuilderValue] }
  | { in: [fieldId: string, values: BuilderValue[]] }
  | { contains: [fieldId: string, value: BuilderValue] }
  | { gt: [fieldId: string, value: number] }
  | { lt: [fieldId: string, value: number] };

export type ActionDef =
  | { action: 'showStep'; stepId: string }
  | { action: 'hideStep'; stepId: string }
  | { action: 'showSection'; sectionId: string }
  | { action: 'hideSection'; sectionId: string }
  | { action: 'showField'; fieldId: string }
  | { action: 'hideField'; fieldId: string }
  | { action: 'enableOption'; fieldId: string; optionId: string }
  | { action: 'disableOption'; fieldId: string; optionId: string }
  | { action: 'requireField'; fieldId: string }
  | { action: 'unrequireField'; fieldId: string }
  | { action: 'setValue'; fieldId: string; value: BuilderValue }
  | { action: 'clearValue'; fieldId: string }
  | { action: 'addLineItem'; lineItem: LineItemDef }
  | { action: 'removeLineItem'; lineItemId: string };

export interface DerivedFieldDef {
  fieldId: string;
  // Minimal v0: map-based derivation (can expand later)
  derivesFromFieldId: string;
  mapping?: Record<string, BuilderValue>; // input optionId -> output value
}

export interface PackageDef {
  id: string;
  label: string;
  code?: string;
  price?: Money; // package price add-on
  includes?: Array<{ fieldId: string; optionId: string }>;
}

export interface PricingRuleDef {
  id: string;
  priority: number;
  when: ConditionExpr;
  addLineItems: LineItemDef[];
}

export interface LineItemDef {
  id: string;
  label: string;
  code?: string;
  amount: Money;
  quantity?: number; // default 1
  category?: string; // e.g., 'rigging', 'engine', 'electronics'
}

export interface ViewDef {
  id: ViewId;
  label: string;
  width: number;
  height: number;
  layers: LayerDef[];
}

export interface LayerDef {
  id: string;
  viewId: ViewId;
  groupId?: string; // optional for admin grouping
  z: number;
  assetUrl: string; // PNG/WebP with transparency
  when: ConditionExpr;
}

export interface LayerGroupDef {
  id: string;
  label: string;
  viewId?: ViewId; // optional: group scoped to a view
}

export interface GalleryDef {
  id: string;
  label: string;
  media: Array<{ url: string; caption?: string }>;
}

export interface ConstraintDef {
  id: string;
  description?: string;
  // v0 placeholder. Implement as needed.
}

