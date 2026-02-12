import type { BuilderValue, ConditionExpr, FieldDef, ModelConfig, RuleDef } from "./model-config.js";

export interface EvaluateRulesOptions {
  maxIterations?: number;
}

export interface ComputedUiState {
  hidden: {
    stepIds: string[];
    sectionIds: string[];
    fieldIds: string[];
  };
  disabled: {
    optionIdsByFieldId: Record<string, string[]>;
  };
  required: {
    fieldIds: string[];
  };
}

export interface EvaluateRulesResult {
  state: Record<string, BuilderValue>;
  computedUi: ComputedUiState;
  mutations: Array<{ action: "setValue"; fieldId: string; value: BuilderValue } | { action: "clearValue"; fieldId: string }>;
  iterations: number;
  stable: boolean;
}

interface UiAccumulator {
  hiddenStepIds: Set<string>;
  hiddenSectionIds: Set<string>;
  hiddenFieldIds: Set<string>;
  disabledOptionIdsByFieldId: Map<string, Set<string>>;
  requiredFieldIds: Set<string>;
}

const DEFAULT_MAX_ITERATIONS = 8;

export function evaluateRules(
  modelConfig: Pick<ModelConfig, "form" | "rules">,
  state: Record<string, BuilderValue>,
  options: EvaluateRulesOptions = {},
): EvaluateRulesResult {
  const fieldsById = collectFieldsById(modelConfig.form.steps);
  const sectionByFieldId = collectSectionByFieldId(modelConfig.form.steps);
  const stepBySectionId = collectStepBySectionId(modelConfig.form.steps);
  const fieldOptionIds = collectFieldOptionIds(fieldsById);
  const sortedRules = sortRules(modelConfig.rules.rules);
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS;

  const nextState: Record<string, BuilderValue> = { ...state };
  const mutations: EvaluateRulesResult["mutations"] = [];

  let finalUi = buildUiAccumulator(fieldsById);
  let stable = false;
  let iterations = 0;

  for (let i = 0; i < maxIterations; i += 1) {
    iterations = i + 1;
    const loopStartState = snapshotState(nextState);

    const ui = buildUiAccumulator(fieldsById);
    applyUiActions(sortedRules, nextState, ui);
    applyInvalidSelectionCorrections(nextState, ui, fieldsById, fieldOptionIds, sectionByFieldId, stepBySectionId, mutations);
    applyMutationActions(sortedRules, nextState, mutations);

    finalUi = ui;

    if (snapshotState(nextState) === loopStartState) {
      stable = true;
      break;
    }
  }

  return {
    state: nextState,
    computedUi: materializeUiState(finalUi),
    mutations,
    iterations,
    stable,
  };
}

function collectFieldsById(steps: ModelConfig["form"]["steps"]): Record<string, FieldDef> {
  const result: Record<string, FieldDef> = {};
  for (const step of steps) {
    for (const section of step.sections) {
      for (const field of section.fields) {
        result[field.id] = field;
      }
    }
  }
  return result;
}

function collectSectionByFieldId(steps: ModelConfig["form"]["steps"]): Map<string, string> {
  const result = new Map<string, string>();
  for (const step of steps) {
    for (const section of step.sections) {
      for (const field of section.fields) {
        result.set(field.id, section.id);
      }
    }
  }
  return result;
}

function collectStepBySectionId(steps: ModelConfig["form"]["steps"]): Map<string, string> {
  const result = new Map<string, string>();
  for (const step of steps) {
    for (const section of step.sections) {
      result.set(section.id, step.id);
    }
  }
  return result;
}

function collectFieldOptionIds(fieldsById: Record<string, FieldDef>): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>();
  for (const [fieldId, field] of Object.entries(fieldsById)) {
    result.set(
      fieldId,
      new Set((field.options ?? []).map((option) => option.id)),
    );
  }
  return result;
}

function buildUiAccumulator(fieldsById: Record<string, FieldDef>): UiAccumulator {
  const requiredFieldIds = new Set<string>();
  const hiddenFieldIds = new Set<string>();

  for (const [fieldId, field] of Object.entries(fieldsById)) {
    if (field.requiredByDefault) {
      requiredFieldIds.add(fieldId);
    }
    if (field.visibleByDefault === false) {
      hiddenFieldIds.add(fieldId);
    }
  }

  return {
    hiddenStepIds: new Set<string>(),
    hiddenSectionIds: new Set<string>(),
    hiddenFieldIds,
    disabledOptionIdsByFieldId: new Map<string, Set<string>>(),
    requiredFieldIds,
  };
}

function applyUiActions(rules: RuleDef[], state: Record<string, BuilderValue>, ui: UiAccumulator): void {
  for (const rule of rules) {
    const matches = evaluateCondition(rule.when, state);
    const actions = matches ? rule.then : rule.else ?? [];
    for (const action of actions) {
      switch (action.action) {
        case "showStep":
          ui.hiddenStepIds.delete(action.stepId);
          break;
        case "hideStep":
          ui.hiddenStepIds.add(action.stepId);
          break;
        case "showSection":
          ui.hiddenSectionIds.delete(action.sectionId);
          break;
        case "hideSection":
          ui.hiddenSectionIds.add(action.sectionId);
          break;
        case "showField":
          ui.hiddenFieldIds.delete(action.fieldId);
          break;
        case "hideField":
          ui.hiddenFieldIds.add(action.fieldId);
          break;
        case "enableOption":
          ui.disabledOptionIdsByFieldId.get(action.fieldId)?.delete(action.optionId);
          break;
        case "disableOption": {
          let set = ui.disabledOptionIdsByFieldId.get(action.fieldId);
          if (!set) {
            set = new Set<string>();
            ui.disabledOptionIdsByFieldId.set(action.fieldId, set);
          }
          set.add(action.optionId);
          break;
        }
        case "requireField":
          ui.requiredFieldIds.add(action.fieldId);
          break;
        case "unrequireField":
          ui.requiredFieldIds.delete(action.fieldId);
          break;
        default:
          break;
      }
    }
  }
}

function applyMutationActions(
  rules: RuleDef[],
  state: Record<string, BuilderValue>,
  mutations: EvaluateRulesResult["mutations"],
): void {
  for (const rule of rules) {
    const matches = evaluateCondition(rule.when, state);
    const actions = matches ? rule.then : rule.else ?? [];
    for (const action of actions) {
      if (action.action === "setValue") {
        applySetValue(state, action.fieldId, action.value, mutations);
      } else if (action.action === "clearValue") {
        applyClearValue(state, action.fieldId, mutations);
      }
    }
  }
}

function applyInvalidSelectionCorrections(
  state: Record<string, BuilderValue>,
  ui: UiAccumulator,
  fieldsById: Record<string, FieldDef>,
  fieldOptionIds: Map<string, Set<string>>,
  sectionByFieldId: Map<string, string>,
  stepBySectionId: Map<string, string>,
  mutations: EvaluateRulesResult["mutations"],
): void {
  for (const [fieldId, field] of Object.entries(fieldsById)) {
    const hiddenByField = ui.hiddenFieldIds.has(fieldId);
    const sectionId = sectionByFieldId.get(fieldId);
    const stepId = sectionId ? stepBySectionId.get(sectionId) : undefined;
    const hiddenByAncestor = (sectionId ? ui.hiddenSectionIds.has(sectionId) : false) || (stepId ? ui.hiddenStepIds.has(stepId) : false);

    if (hiddenByField || hiddenByAncestor) {
      applyClearValue(state, fieldId, mutations);
      continue;
    }

    const current = state[fieldId];
    if (current === undefined || current === null || field.options === undefined) {
      continue;
    }

    const knownOptions = fieldOptionIds.get(fieldId) ?? new Set<string>();
    const disabledOptions = ui.disabledOptionIdsByFieldId.get(fieldId) ?? new Set<string>();

    if (field.type === "multi_select") {
      if (!Array.isArray(current)) {
        continue;
      }
      const filtered = current.filter((value): value is string => {
        if (typeof value !== "string") {
          return false;
        }
        return knownOptions.has(value) && !disabledOptions.has(value);
      });

      if (filtered.length === current.length) {
        continue;
      }
      if (filtered.length === 0) {
        applyClearValue(state, fieldId, mutations);
      } else {
        applySetValue(state, fieldId, filtered, mutations);
      }
      continue;
    }

    if (typeof current !== "string") {
      continue;
    }

    if (!knownOptions.has(current) || disabledOptions.has(current)) {
      applyClearValue(state, fieldId, mutations);
    }
  }
}

function evaluateCondition(condition: ConditionExpr, state: Record<string, BuilderValue>): boolean {
  if ("all" in condition) {
    return condition.all.every((node) => evaluateCondition(node, state));
  }
  if ("any" in condition) {
    return condition.any.some((node) => evaluateCondition(node, state));
  }
  if ("not" in condition) {
    return !evaluateCondition(condition.not, state);
  }
  if ("eq" in condition) {
    const [fieldId, value] = condition.eq;
    return areValuesEqual(state[fieldId], value);
  }
  if ("neq" in condition) {
    const [fieldId, value] = condition.neq;
    return !areValuesEqual(state[fieldId], value);
  }
  if ("in" in condition) {
    const [fieldId, values] = condition.in;
    return values.some((value) => areValuesEqual(state[fieldId], value));
  }
  if ("contains" in condition) {
    const [fieldId, value] = condition.contains;
    const current = state[fieldId];
    return Array.isArray(current) && current.some((entry) => areValuesEqual(entry, value));
  }
  if ("gt" in condition) {
    const [fieldId, value] = condition.gt;
    return typeof state[fieldId] === "number" && (state[fieldId] as number) > value;
  }
  if ("lt" in condition) {
    const [fieldId, value] = condition.lt;
    return typeof state[fieldId] === "number" && (state[fieldId] as number) < value;
  }
  return false;
}

function areValuesEqual(left: BuilderValue | undefined, right: BuilderValue): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      return false;
    }
    if (left.length !== right.length) {
      return false;
    }
    for (let i = 0; i < left.length; i += 1) {
      if (left[i] !== right[i]) {
        return false;
      }
    }
    return true;
  }
  return left === right;
}

function applySetValue(
  state: Record<string, BuilderValue>,
  fieldId: string,
  value: BuilderValue,
  mutations: EvaluateRulesResult["mutations"],
): void {
  if (areValuesEqual(state[fieldId], value)) {
    return;
  }
  state[fieldId] = cloneBuilderValue(value);
  mutations.push({ action: "setValue", fieldId, value: cloneBuilderValue(value) });
}

function applyClearValue(
  state: Record<string, BuilderValue>,
  fieldId: string,
  mutations: EvaluateRulesResult["mutations"],
): void {
  if (!(fieldId in state) || state[fieldId] === null) {
    return;
  }
  state[fieldId] = null;
  mutations.push({ action: "clearValue", fieldId });
}

function cloneBuilderValue(value: BuilderValue): BuilderValue {
  if (Array.isArray(value)) {
    return [...value];
  }
  return value;
}

function materializeUiState(ui: UiAccumulator): ComputedUiState {
  const optionIdsByFieldId: Record<string, string[]> = {};
  for (const [fieldId, optionIds] of ui.disabledOptionIdsByFieldId.entries()) {
    optionIdsByFieldId[fieldId] = [...optionIds].sort();
  }

  return {
    hidden: {
      stepIds: [...ui.hiddenStepIds].sort(),
      sectionIds: [...ui.hiddenSectionIds].sort(),
      fieldIds: [...ui.hiddenFieldIds].sort(),
    },
    disabled: {
      optionIdsByFieldId,
    },
    required: {
      fieldIds: [...ui.requiredFieldIds].sort(),
    },
  };
}

function sortRules(rules: RuleDef[]): RuleDef[] {
  return [...rules].sort((left, right) => {
    if (left.priority !== right.priority) {
      return left.priority - right.priority;
    }
    return left.id.localeCompare(right.id);
  });
}

function snapshotState(state: Record<string, BuilderValue>): string {
  const sortedEntries = Object.entries(state).sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify(sortedEntries);
}
