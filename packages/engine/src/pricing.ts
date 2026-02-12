import type {
  BuilderValue,
  ConditionExpr,
  ModelConfig,
  PriceBooks,
} from "./model-config.js";

export interface PricingLineItem {
  id: string;
  label: string;
  code?: string;
  category?: string;
  quantity: number;
  msrp: number;
  dealer: number;
}

export interface PricingManualAdjustments {
  freight?: number | PriceBooks;
  otherCharges?: number | PriceBooks;
}

export interface ComputePricingLineItemsInput {
  config: ModelConfig;
  state: Record<string, BuilderValue | undefined>;
  trimId?: string;
  selectedPackageIds?: string[];
  manualAdjustments?: PricingManualAdjustments;
}

export interface PricingComputation {
  lineItems: PricingLineItem[];
  totals: PriceBooks;
}

export function computePricingLineItems(input: ComputePricingLineItemsInput): PricingComputation {
  const lineItems: PricingLineItem[] = [];
  const state = input.state;
  const packageIdSet = collectSelectedPackageIds(input.config, state, input.selectedPackageIds);
  const includedOptionKeys = buildIncludedOptionKeySet(input.config, packageIdSet);

  const basePrice = getBasePrice(input.config, input.trimId);
  lineItems.push(toPricingLineItem("base-price", "Base Price", basePrice, 1));

  for (const step of input.config.form.steps) {
    for (const section of step.sections) {
      for (const field of section.fields) {
        if (!field.options || field.options.length === 0) {
          continue;
        }

        for (const option of field.options) {
          if (!option.price || !isOptionSelected(state[field.id], option.id)) {
            continue;
          }

          const optionKey = makeOptionKey(field.id, option.id);
          if (includedOptionKeys.has(optionKey)) {
            continue;
          }

          lineItems.push(
            toPricingLineItem(
              `option:${field.id}:${option.id}`,
              option.label,
              option.price,
              1,
              option.code,
            ),
          );
        }
      }
    }
  }

  if (input.config.pricing.packages) {
    for (const pkg of input.config.pricing.packages) {
      if (!pkg.price || !packageIdSet.has(pkg.id)) {
        continue;
      }

      lineItems.push(toPricingLineItem(`package:${pkg.id}`, pkg.label, pkg.price, 1, pkg.code));
    }
  }

  if (input.config.pricing.lineItemRules) {
    const sortedRules = [...input.config.pricing.lineItemRules].sort((left, right) => {
      if (left.priority !== right.priority) {
        return right.priority - left.priority;
      }
      return left.id.localeCompare(right.id);
    });

    for (const rule of sortedRules) {
      if (!evaluateCondition(rule.when, state)) {
        continue;
      }

      for (const item of rule.addLineItems) {
        lineItems.push(
          toPricingLineItem(
            `rule:${rule.id}:${item.id}`,
            item.label,
            item.amount,
            item.quantity ?? 1,
            item.code,
            item.category,
          ),
        );
      }
    }
  }

  if (input.manualAdjustments) {
    if (input.manualAdjustments.freight !== undefined) {
      lineItems.push(
        toPricingLineItem(
          "manual:freight",
          "Freight",
          normalizeManualAdjustment(input.manualAdjustments.freight),
          1,
        ),
      );
    }

    if (input.manualAdjustments.otherCharges !== undefined) {
      lineItems.push(
        toPricingLineItem(
          "manual:other-charges",
          "Other Charges",
          normalizeManualAdjustment(input.manualAdjustments.otherCharges),
          1,
        ),
      );
    }
  }

  const totals = lineItems.reduce<PriceBooks>(
    (acc, lineItem) => ({
      msrp: acc.msrp + lineItem.msrp,
      dealer: acc.dealer + lineItem.dealer,
    }),
    { msrp: 0, dealer: 0 },
  );

  return { lineItems, totals };
}

function toPricingLineItem(
  id: string,
  label: string,
  amount: PriceBooks,
  quantity: number,
  code?: string,
  category?: string,
): PricingLineItem {
  return {
    id,
    label,
    code,
    category,
    quantity,
    msrp: amount.msrp * quantity,
    dealer: amount.dealer * quantity,
  };
}

function getBasePrice(config: ModelConfig, trimId?: string): PriceBooks {
  if (trimId && config.pricing.trimBasePrices?.[trimId]) {
    return config.pricing.trimBasePrices[trimId];
  }
  return config.pricing.basePrice;
}

function collectSelectedPackageIds(
  config: ModelConfig,
  state: Record<string, BuilderValue | undefined>,
  selectedPackageIds: string[] | undefined,
): Set<string> {
  const packageIds = new Set(selectedPackageIds ?? []);
  for (const step of config.form.steps) {
    for (const section of step.sections) {
      for (const field of section.fields) {
        if (field.type !== "package_select") {
          continue;
        }

        for (const value of asStringArray(state[field.id])) {
          packageIds.add(value);
        }
      }
    }
  }
  return packageIds;
}

function buildIncludedOptionKeySet(config: ModelConfig, selectedPackageIds: Set<string>): Set<string> {
  const includedOptionKeys = new Set<string>();
  if (!config.pricing.packages || selectedPackageIds.size === 0) {
    return includedOptionKeys;
  }

  for (const pkg of config.pricing.packages) {
    if (!selectedPackageIds.has(pkg.id) || !pkg.includes) {
      continue;
    }

    for (const included of pkg.includes) {
      includedOptionKeys.add(makeOptionKey(included.fieldId, included.optionId));
    }
  }

  return includedOptionKeys;
}

function makeOptionKey(fieldId: string, optionId: string): string {
  return `${fieldId}:${optionId}`;
}

function isOptionSelected(value: BuilderValue | undefined, optionId: string): boolean {
  if (typeof value === "string") {
    return value === optionId;
  }
  if (Array.isArray(value)) {
    return value.includes(optionId);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value) === optionId;
  }
  return false;
}

function asStringArray(value: BuilderValue | undefined): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }
  return [];
}

function normalizeManualAdjustment(value: number | PriceBooks): PriceBooks {
  if (typeof value === "number") {
    return { msrp: value, dealer: value };
  }
  return value;
}

function evaluateCondition(
  expr: ConditionExpr,
  state: Record<string, BuilderValue | undefined>,
): boolean {
  if ("all" in expr) {
    return expr.all.every((condition) => evaluateCondition(condition, state));
  }
  if ("any" in expr) {
    return expr.any.some((condition) => evaluateCondition(condition, state));
  }
  if ("not" in expr) {
    return !evaluateCondition(expr.not, state);
  }
  if ("eq" in expr) {
    const [fieldId, value] = expr.eq;
    return state[fieldId] === value;
  }
  if ("neq" in expr) {
    const [fieldId, value] = expr.neq;
    return state[fieldId] !== value;
  }
  if ("in" in expr) {
    const [fieldId, values] = expr.in;
    return values.includes(state[fieldId] ?? null);
  }
  if ("contains" in expr) {
    const [fieldId, value] = expr.contains;
    const stateValue = state[fieldId];
    if (Array.isArray(stateValue)) {
      return typeof value === "string" && stateValue.includes(value);
    }
    if (typeof stateValue === "string" && typeof value === "string") {
      return stateValue.includes(value);
    }
    return false;
  }
  if ("gt" in expr) {
    const [fieldId, value] = expr.gt;
    const stateValue = state[fieldId];
    return typeof stateValue === "number" && stateValue > value;
  }
  const [fieldId, value] = expr.lt;
  const stateValue = state[fieldId];
  return typeof stateValue === "number" && stateValue < value;
}
