import type { BuilderValue, FieldDef, LineItemDef, ModelConfig } from "./model-config.js";

export interface ComputedRuleResults {
  addedLineItems?: LineItemDef[];
  surchargeLineItems?: LineItemDef[];
  removedLineItemIds?: string[];
  actions?: Array<
    | { action: "addLineItem"; lineItem: LineItemDef }
    | { action: "removeLineItem"; lineItemId: string }
  >;
}

export interface PricingLineItem {
  id: string;
  label: string;
  code?: string;
  category?: string;
  quantity: number;
  included?: boolean;
  includedByPackageId?: string;
  source: "base" | "option" | "package" | "manual_adjustment" | "rule_surcharge";
  unitAmounts: {
    msrp: number;
    dealer: number;
  };
  totals: {
    msrp: number;
    dealer: number;
  };
}

export interface ComputePricingLineItemsInput {
  modelConfig: ModelConfig;
  normalizedState: Record<string, unknown>;
  computedRuleResults?: ComputedRuleResults;
}

export interface PricingResult {
  lineItems: PricingLineItem[];
  totals: {
    msrp: number;
    dealer: number;
  };
}

interface SelectedOption {
  optionId: string;
  quantity: number;
}

interface IncludedOption {
  packageId: string;
}

const BASE_LINE_ITEM_ID = "base_price";

export function computePricingLineItems(input: ComputePricingLineItemsInput): PricingResult {
  const { modelConfig, normalizedState, computedRuleResults } = input;

  const lineItems: PricingLineItem[] = [];

  const baseAmounts = resolveMoney(modelConfig, modelConfig.pricing.basePrice.amount);
  lineItems.push(
    createLineItem({
      id: BASE_LINE_ITEM_ID,
      label: "Base Price",
      quantity: 1,
      source: "base",
      unitMsrp: baseAmounts.msrp,
      unitDealer: baseAmounts.dealer
    })
  );

  const selectedPackages = getSelectedPackageIds(modelConfig, normalizedState);
  const includedByOptionKey = collectIncludedOptions(modelConfig, selectedPackages);

  for (const packageId of selectedPackages) {
    const packageDef = modelConfig.pricing.packages?.find((pkg) => pkg.id === packageId);
    if (!packageDef || !packageDef.price) {
      continue;
    }

    const packageAmounts = resolveMoney(modelConfig, packageDef.price.amount);
    lineItems.push(
      createLineItem({
        id: `package:${packageDef.id}`,
        label: packageDef.label,
        code: packageDef.code,
        quantity: 1,
        source: "package",
        unitMsrp: packageAmounts.msrp,
        unitDealer: packageAmounts.dealer
      })
    );
  }

  for (const field of sortFields(modelConfig.form.steps)) {
    if (!field.options || field.options.length === 0) {
      continue;
    }

    const userSelections = getSelectedOptions(field, normalizedState[field.id]);
    const selectionByOptionId = new Map<string, SelectedOption>();
    for (const selection of userSelections) {
      selectionByOptionId.set(selection.optionId, selection);
    }

    for (const option of field.options) {
      const included = includedByOptionKey.get(makeOptionKey(field.id, option.id));
      if (included && !selectionByOptionId.has(option.id)) {
        selectionByOptionId.set(option.id, { optionId: option.id, quantity: 1 });
      }
    }

    const selections = [...selectionByOptionId.values()].sort((a, b) => a.optionId.localeCompare(b.optionId));
    if (selections.length === 0) {
      continue;
    }

    for (const selection of selections) {
      const option = field.options.find((candidate) => candidate.id === selection.optionId);
      if (!option) {
        continue;
      }

      const included = includedByOptionKey.get(makeOptionKey(field.id, option.id));
      const quantity = selection.quantity;

      let unitMsrp = 0;
      let unitDealer = 0;

      if (!included) {
        const optionAmount = option.price?.amount ?? 0;
        const optionAmounts = resolveMoney(modelConfig, optionAmount);
        unitMsrp = optionAmounts.msrp;
        unitDealer = optionAmounts.dealer;
      }

      lineItems.push(
        createLineItem({
          id: `option:${field.id}:${option.id}`,
          label: `${field.label}: ${option.label}`,
          code: option.code,
          quantity,
          category: "option",
          source: "option",
          included: Boolean(included),
          includedByPackageId: included?.packageId,
          unitMsrp,
          unitDealer
        })
      );
    }
  }

  const freight = toFiniteNumber(normalizedState.freight);
  if (freight !== null && freight !== 0) {
    const freightAmounts = resolveMoney(modelConfig, freight);
    lineItems.push(
      createLineItem({
        id: "manual:freight",
        label: "Freight",
        quantity: 1,
        source: "manual_adjustment",
        category: "manual",
        unitMsrp: freightAmounts.msrp,
        unitDealer: freightAmounts.dealer
      })
    );
  }

  const otherCharges = toFiniteNumber(normalizedState.otherCharges);
  if (otherCharges !== null && otherCharges !== 0) {
    const otherChargeAmounts = resolveMoney(modelConfig, otherCharges);
    lineItems.push(
      createLineItem({
        id: "manual:otherCharges",
        label: "Other Charges",
        quantity: 1,
        source: "manual_adjustment",
        category: "manual",
        unitMsrp: otherChargeAmounts.msrp,
        unitDealer: otherChargeAmounts.dealer
      })
    );
  }

  const ruleItems = collectRuleLineItems(computedRuleResults);
  for (const ruleItem of ruleItems) {
    const amounts = resolveMoney(modelConfig, ruleItem.amount.amount);
    lineItems.push(
      createLineItem({
        id: `rule:${ruleItem.id}`,
        label: ruleItem.label,
        code: ruleItem.code,
        quantity: toQuantity(ruleItem.quantity),
        source: "rule_surcharge",
        category: ruleItem.category,
        unitMsrp: amounts.msrp,
        unitDealer: amounts.dealer
      })
    );
  }

  const removedLineItemIds = new Set(computedRuleResults?.removedLineItemIds ?? []);
  for (const action of computedRuleResults?.actions ?? []) {
    if (action.action === "removeLineItem") {
      removedLineItemIds.add(action.lineItemId);
    }
  }

  const filteredLineItems = lineItems.filter((lineItem) => {
    const canonicalId = lineItem.id.startsWith("rule:") ? lineItem.id.slice("rule:".length) : lineItem.id;
    return !removedLineItemIds.has(lineItem.id) && !removedLineItemIds.has(canonicalId);
  });

  const totals = filteredLineItems.reduce(
    (acc, lineItem) => {
      acc.msrp = roundCurrency(acc.msrp + lineItem.totals.msrp);
      acc.dealer = roundCurrency(acc.dealer + lineItem.totals.dealer);
      return acc;
    },
    { msrp: 0, dealer: 0 }
  );

  return {
    lineItems: filteredLineItems,
    totals
  };
}

function collectRuleLineItems(computedRuleResults: ComputedRuleResults | undefined): LineItemDef[] {
  const fromActions = (computedRuleResults?.actions ?? [])
    .filter((action): action is { action: "addLineItem"; lineItem: LineItemDef } => action.action === "addLineItem")
    .map((action) => action.lineItem);

  const items = [
    ...(computedRuleResults?.addedLineItems ?? []),
    ...(computedRuleResults?.surchargeLineItems ?? []),
    ...fromActions
  ];

  return items.sort((a, b) => a.id.localeCompare(b.id));
}

function resolveMoney(modelConfig: ModelConfig, amount: number): { msrp: number; dealer: number } {
  const normalized = roundCurrency(amount);

  if (modelConfig.pricing.mode === "msrp") {
    return { msrp: normalized, dealer: normalized };
  }

  if (modelConfig.pricing.mode === "dealer") {
    return { msrp: normalized, dealer: normalized };
  }

  return { msrp: normalized, dealer: normalized };
}

function sortFields(steps: ModelConfig["form"]["steps"]): FieldDef[] {
  const withPath: Array<{
    field: FieldDef;
    stepOrder: number;
    stepId: string;
    sectionOrder: number;
    sectionId: string;
  }> = [];

  for (const step of steps) {
    for (const section of step.sections) {
      for (const field of section.fields) {
        withPath.push({
          field,
          stepOrder: step.order,
          stepId: step.id,
          sectionOrder: section.order,
          sectionId: section.id
        });
      }
    }
  }

  withPath.sort((a, b) => {
    if (a.stepOrder !== b.stepOrder) {
      return a.stepOrder - b.stepOrder;
    }

    if (a.stepId !== b.stepId) {
      return a.stepId.localeCompare(b.stepId);
    }

    if (a.sectionOrder !== b.sectionOrder) {
      return a.sectionOrder - b.sectionOrder;
    }

    if (a.sectionId !== b.sectionId) {
      return a.sectionId.localeCompare(b.sectionId);
    }

    if (a.field.order !== b.field.order) {
      return a.field.order - b.field.order;
    }

    return a.field.id.localeCompare(b.field.id);
  });

  return withPath.map((entry) => entry.field);
}

function getSelectedPackageIds(modelConfig: ModelConfig, normalizedState: Record<string, unknown>): string[] {
  const packageFieldIds = new Set<string>();

  for (const field of sortFields(modelConfig.form.steps)) {
    if (field.type === "package_select") {
      packageFieldIds.add(field.id);
    }
  }

  const selected = new Set<string>();

  for (const fieldId of packageFieldIds) {
    const value = normalizedState[fieldId] as BuilderValue | undefined;
    if (typeof value === "string" && value.length > 0) {
      selected.add(value);
    }

    if (Array.isArray(value)) {
      for (const maybeId of value) {
        if (typeof maybeId === "string" && maybeId.length > 0) {
          selected.add(maybeId);
        }
      }
    }
  }

  return Array.from(selected).sort((a, b) => a.localeCompare(b));
}

function collectIncludedOptions(modelConfig: ModelConfig, selectedPackages: string[]): Map<string, IncludedOption> {
  const includedByOptionKey = new Map<string, IncludedOption>();

  for (const packageId of selectedPackages) {
    const packageDef = modelConfig.pricing.packages?.find((candidate) => candidate.id === packageId);
    if (!packageDef?.includes) {
      continue;
    }

    const sortedIncludes = [...packageDef.includes].sort((a, b) => {
      if (a.fieldId !== b.fieldId) {
        return a.fieldId.localeCompare(b.fieldId);
      }

      return a.optionId.localeCompare(b.optionId);
    });

    for (const include of sortedIncludes) {
      const key = makeOptionKey(include.fieldId, include.optionId);
      if (!includedByOptionKey.has(key)) {
        includedByOptionKey.set(key, { packageId: packageDef.id });
      }
    }
  }

  return includedByOptionKey;
}

function getSelectedOptions(field: FieldDef, rawValue: unknown): SelectedOption[] {
  if (typeof rawValue === "string" && rawValue.length > 0) {
    return [{ optionId: rawValue, quantity: 1 }];
  }

  if (Array.isArray(rawValue)) {
    return rawValue
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .map((value) => ({ optionId: value, quantity: 1 }));
  }

  if (typeof rawValue === "boolean") {
    if (field.type === "toggle" && rawValue && field.options?.[0]) {
      return [{ optionId: field.options[0].id, quantity: 1 }];
    }

    return [];
  }

  if (typeof rawValue === "number") {
    if (field.options?.length === 1 && rawValue > 0) {
      return [{ optionId: field.options[0].id, quantity: toQuantity(rawValue) }];
    }

    return [];
  }

  if (rawValue && typeof rawValue === "object") {
    const asSingle = rawValue as { optionId?: unknown; quantity?: unknown };
    if (typeof asSingle.optionId === "string") {
      return [{ optionId: asSingle.optionId, quantity: toQuantity(asSingle.quantity) }];
    }

    const entries: SelectedOption[] = [];
    for (const [optionId, value] of Object.entries(rawValue as Record<string, unknown>)) {
      if (typeof value === "number" && value > 0) {
        entries.push({ optionId, quantity: toQuantity(value) });
        continue;
      }

      if (value === true) {
        entries.push({ optionId, quantity: 1 });
      }
    }

    entries.sort((a, b) => a.optionId.localeCompare(b.optionId));
    return entries;
  }

  return [];
}

function createLineItem(input: {
  id: string;
  label: string;
  code?: string;
  category?: string;
  quantity: number;
  included?: boolean;
  includedByPackageId?: string;
  source: PricingLineItem["source"];
  unitMsrp: number;
  unitDealer: number;
}): PricingLineItem {
  const quantity = toQuantity(input.quantity);
  const unitAmounts = {
    msrp: roundCurrency(input.unitMsrp),
    dealer: roundCurrency(input.unitDealer)
  };

  return {
    id: input.id,
    label: input.label,
    code: input.code,
    category: input.category,
    quantity,
    included: input.included,
    includedByPackageId: input.includedByPackageId,
    source: input.source,
    unitAmounts,
    totals: {
      msrp: roundCurrency(unitAmounts.msrp * quantity),
      dealer: roundCurrency(unitAmounts.dealer * quantity)
    }
  };
}

function toQuantity(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 1;
  }

  if (value <= 0) {
    return 1;
  }

  return Math.floor(value);
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  return null;
}

function makeOptionKey(fieldId: string, optionId: string): string {
  return `${fieldId}:${optionId}`;
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
