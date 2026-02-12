import type { BuilderValue, ConditionExpr, LayerDef, ModelConfig, ViewId } from "../model-config.js";

export type NormalizedState = Record<string, BuilderValue>;

export interface ComputedRuleResults {
  valueOverrides?: Record<string, BuilderValue>;
  derivedValues?: Record<string, BuilderValue>;
}

export interface LayerSelectionInput {
  modelConfig: ModelConfig;
  normalizedState: NormalizedState;
  computedRuleResults?: ComputedRuleResults;
  viewIds?: ViewId[];
}

export type ActiveLayersByView = Partial<Record<ViewId, LayerDef[]>>;

export function selectActiveLayersByView({
  modelConfig,
  normalizedState,
  computedRuleResults,
  viewIds,
}: LayerSelectionInput): ActiveLayersByView {
  const selectedViewIds = new Set<ViewId>(viewIds ?? modelConfig.rendering.views.map((view) => view.id));
  const effectiveState = buildEffectiveState(normalizedState, computedRuleResults);
  const activeLayersByView: ActiveLayersByView = {};

  for (const view of modelConfig.rendering.views) {
    if (!selectedViewIds.has(view.id)) {
      continue;
    }

    activeLayersByView[view.id] = view.layers
      .filter((layer) => evaluateCondition(layer.when, effectiveState))
      .sort((left, right) => {
        if (left.z !== right.z) {
          return left.z - right.z;
        }
        return left.id.localeCompare(right.id);
      });
  }

  return activeLayersByView;
}

function buildEffectiveState(
  normalizedState: NormalizedState,
  computedRuleResults?: ComputedRuleResults,
): NormalizedState {
  return {
    ...normalizedState,
    ...(computedRuleResults?.valueOverrides ?? {}),
    ...(computedRuleResults?.derivedValues ?? {}),
  };
}

function evaluateCondition(condition: ConditionExpr, state: NormalizedState): boolean {
  if ("all" in condition) {
    return condition.all.every((item) => evaluateCondition(item, state));
  }

  if ("any" in condition) {
    return condition.any.some((item) => evaluateCondition(item, state));
  }

  if ("not" in condition) {
    return !evaluateCondition(condition.not, state);
  }

  if ("eq" in condition) {
    const [fieldId, expectedValue] = condition.eq;
    return isEqualBuilderValue(state[fieldId], expectedValue);
  }

  if ("neq" in condition) {
    const [fieldId, expectedValue] = condition.neq;
    return !isEqualBuilderValue(state[fieldId], expectedValue);
  }

  if ("in" in condition) {
    const [fieldId, values] = condition.in;
    const fieldValue = state[fieldId];
    return values.some((value) => isEqualBuilderValue(fieldValue, value));
  }

  if ("contains" in condition) {
    const [fieldId, expectedValue] = condition.contains;
    const fieldValue = state[fieldId];

    if (Array.isArray(fieldValue)) {
      return fieldValue.some((value) => isEqualBuilderValue(value, expectedValue));
    }

    if (typeof fieldValue === "string" && typeof expectedValue === "string") {
      return fieldValue.includes(expectedValue);
    }

    return false;
  }

  if ("gt" in condition) {
    const [fieldId, threshold] = condition.gt;
    const fieldValue = state[fieldId];
    return typeof fieldValue === "number" && fieldValue > threshold;
  }

  const [fieldId, threshold] = condition.lt;
  const fieldValue = state[fieldId];
  return typeof fieldValue === "number" && fieldValue < threshold;
}

function isEqualBuilderValue(left: BuilderValue | undefined, right: BuilderValue): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }

    return left.every((value, index) => value === right[index]);
  }

  return left === right;
}
