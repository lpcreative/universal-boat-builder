import type { ValidationIssue, ValidationReport } from "./compiler.js";
import type { ActionDef, ConditionExpr, ModelConfig } from "./model-config.js";

interface FieldIndexEntry {
  options: Set<string>;
}

interface ConditionReference {
  fieldId: string;
  pointer: string;
}

interface GalleryReference {
  galleryId: string;
  pointer: string;
}

export function validateModelConfig(modelConfig: ModelConfig): ValidationReport {
  const issues: ValidationIssue[] = [];

  const stepPointers = new Map<string, string>();
  const sectionPointers = new Map<string, string>();
  const fieldPointers = new Map<string, string>();
  const optionPointers = new Map<string, string>();
  const layerPointers = new Map<string, string>();
  const galleryPointers = new Map<string, string>();
  const layerGroupPointers = new Map<string, string>();
  const viewPointers = new Map<string, string>();

  const fieldIndex = new Map<string, FieldIndexEntry>();
  const optionToField = new Map<string, string>();

  const conditionReferences: ConditionReference[] = [];
  const galleryReferences: GalleryReference[] = [];

  for (const [stepIndex, step] of modelConfig.form.steps.entries()) {
    const stepPath = `form.steps[${stepIndex}]`;
    registerUniqueId(stepPointers, "step", step.id, `${stepPath}.id`, issues);

    for (const [sectionIndex, section] of step.sections.entries()) {
      const sectionPath = `${stepPath}.sections[${sectionIndex}]`;
      registerUniqueId(sectionPointers, "section", section.id, `${sectionPath}.id`, issues);

      for (const [fieldIndexInSection, field] of section.fields.entries()) {
        const fieldPath = `${sectionPath}.fields[${fieldIndexInSection}]`;
        registerUniqueId(fieldPointers, "field", field.id, `${fieldPath}.id`, issues);

        const optionIds = new Set<string>();
        for (const [optionIndex, option] of (field.options ?? []).entries()) {
          const optionPath = `${fieldPath}.options[${optionIndex}]`;
          registerUniqueId(optionPointers, "option", option.id, `${optionPath}.id`, issues);
          optionIds.add(option.id);
          optionToField.set(option.id, field.id);

          const galleryId = option.preview?.galleryId;
          if (galleryId !== undefined && galleryId !== "") {
            galleryReferences.push({ galleryId, pointer: `${optionPath}.preview.galleryId` });
          }
        }

        fieldIndex.set(field.id, { options: optionIds });
      }
    }
  }

  for (const [viewIndex, view] of modelConfig.rendering.views.entries()) {
    const viewPath = `rendering.views[${viewIndex}]`;
    registerUniqueId(viewPointers, "view", view.id, `${viewPath}.id`, issues);

    for (const [layerIndex, layer] of view.layers.entries()) {
      const layerPath = `${viewPath}.layers[${layerIndex}]`;
      registerUniqueId(layerPointers, "layer", layer.id, `${layerPath}.id`, issues);
      collectConditionFieldReferences(layer.when, `${layerPath}.when`, conditionReferences);
    }
  }

  for (const [groupIndex, layerGroup] of (modelConfig.rendering.layerGroups ?? []).entries()) {
    const groupPath = `rendering.layerGroups[${groupIndex}]`;
    registerUniqueId(layerGroupPointers, "layerGroup", layerGroup.id, `${groupPath}.id`, issues);
  }

  for (const [galleryIndex, gallery] of (modelConfig.rendering.galleries ?? []).entries()) {
    const galleryPath = `rendering.galleries[${galleryIndex}]`;
    registerUniqueId(galleryPointers, "gallery", gallery.id, `${galleryPath}.id`, issues);
  }

  for (const [ruleIndex, rule] of modelConfig.rules.rules.entries()) {
    const rulePath = `rules.rules[${ruleIndex}]`;
    collectConditionFieldReferences(rule.when, `${rulePath}.when`, conditionReferences);

    for (const [actionIndex, action] of rule.then.entries()) {
      validateActionReferences(
        action,
        `${rulePath}.then[${actionIndex}]`,
        stepPointers,
        sectionPointers,
        fieldPointers,
        fieldIndex,
        optionToField,
        issues,
      );
    }

    for (const [actionIndex, action] of (rule.else ?? []).entries()) {
      validateActionReferences(
        action,
        `${rulePath}.else[${actionIndex}]`,
        stepPointers,
        sectionPointers,
        fieldPointers,
        fieldIndex,
        optionToField,
        issues,
      );
    }
  }

  for (const [derivedIndex, derivedField] of (modelConfig.derived?.derivedFields ?? []).entries()) {
    const derivedPath = `derived.derivedFields[${derivedIndex}]`;
    ensureExists(fieldPointers, "field", derivedField.fieldId, `${derivedPath}.fieldId`, issues);
    ensureExists(
      fieldPointers,
      "field",
      derivedField.derivesFromFieldId,
      `${derivedPath}.derivesFromFieldId`,
      issues,
    );
  }

  for (const [packageIndex, pkg] of (modelConfig.pricing.packages ?? []).entries()) {
    const packagePath = `pricing.packages[${packageIndex}]`;
    for (const [includeIndex, include] of (pkg.includes ?? []).entries()) {
      const includePath = `${packagePath}.includes[${includeIndex}]`;
      ensureExists(fieldPointers, "field", include.fieldId, `${includePath}.fieldId`, issues);
      ensureFieldOptionPair(
        include.fieldId,
        include.optionId,
        `${includePath}.optionId`,
        fieldIndex,
        optionToField,
        issues,
      );
    }
  }

  for (const [pricingRuleIndex, pricingRule] of (modelConfig.pricing.lineItemRules ?? []).entries()) {
    const pricingRulePath = `pricing.lineItemRules[${pricingRuleIndex}]`;
    collectConditionFieldReferences(pricingRule.when, `${pricingRulePath}.when`, conditionReferences);
  }

  for (const [viewIndex, view] of modelConfig.rendering.views.entries()) {
    const viewPath = `rendering.views[${viewIndex}]`;
    for (const [layerIndex, layer] of view.layers.entries()) {
      const layerPath = `${viewPath}.layers[${layerIndex}]`;
      if (!viewPointers.has(layer.viewId)) {
        pushError(
          issues,
          `${layerPath}.viewId`,
          `layer references missing view "${layer.viewId}"`,
          { type: "view", id: layer.viewId },
        );
      }

      if (layer.groupId !== undefined && layer.groupId !== "") {
        ensureExists(layerGroupPointers, "layerGroup", layer.groupId, `${layerPath}.groupId`, issues);
      }
    }
  }

  for (const [groupIndex, layerGroup] of (modelConfig.rendering.layerGroups ?? []).entries()) {
    if (layerGroup.viewId !== undefined) {
      ensureExists(
        viewPointers,
        "view",
        layerGroup.viewId,
        `rendering.layerGroups[${groupIndex}].viewId`,
        issues,
      );
    }
  }

  if (modelConfig.form.fieldsById !== undefined) {
    for (const [mappedFieldId, mappedField] of Object.entries(modelConfig.form.fieldsById)) {
      const mappingPath = `form.fieldsById.${mappedFieldId}`;
      if (!fieldPointers.has(mappedFieldId)) {
        pushError(
          issues,
          mappingPath,
          `fieldsById references field "${mappedFieldId}" that is not present in form.steps[].sections[].fields[]`,
          { type: "field", id: mappedFieldId },
        );
      }

      if (mappedField.id !== mappedFieldId) {
        pushError(
          issues,
          `${mappingPath}.id`,
          `fieldsById key "${mappedFieldId}" does not match field.id "${mappedField.id}"`,
          { type: "field", id: mappedFieldId },
        );
      }
    }
  }

  for (const reference of conditionReferences) {
    ensureExists(fieldPointers, "field", reference.fieldId, reference.pointer, issues);
  }

  for (const reference of galleryReferences) {
    ensureExists(galleryPointers, "gallery", reference.galleryId, reference.pointer, issues);
  }

  const sortedIssues = issues.sort((left, right) => {
    const leftPointer = left.pointer ?? "";
    const rightPointer = right.pointer ?? "";
    if (leftPointer !== rightPointer) {
      return leftPointer.localeCompare(rightPointer);
    }
    return left.message.localeCompare(right.message);
  });

  const errors = sortedIssues.filter((issue) => issue.severity === "error").length;
  const warnings = sortedIssues.filter((issue) => issue.severity === "warning").length;

  return {
    ok: errors === 0,
    issues: sortedIssues,
    summary: {
      errors,
      warnings,
    },
  };
}

function collectConditionFieldReferences(
  expression: ConditionExpr,
  pointer: string,
  references: ConditionReference[],
): void {
  if ("all" in expression) {
    for (const [index, nested] of expression.all.entries()) {
      collectConditionFieldReferences(nested, `${pointer}.all[${index}]`, references);
    }
    return;
  }

  if ("any" in expression) {
    for (const [index, nested] of expression.any.entries()) {
      collectConditionFieldReferences(nested, `${pointer}.any[${index}]`, references);
    }
    return;
  }

  if ("not" in expression) {
    collectConditionFieldReferences(expression.not, `${pointer}.not`, references);
    return;
  }

  if ("eq" in expression) {
    references.push({ fieldId: expression.eq[0], pointer: `${pointer}.eq[0]` });
    return;
  }

  if ("neq" in expression) {
    references.push({ fieldId: expression.neq[0], pointer: `${pointer}.neq[0]` });
    return;
  }

  if ("in" in expression) {
    references.push({ fieldId: expression.in[0], pointer: `${pointer}.in[0]` });
    return;
  }

  if ("contains" in expression) {
    references.push({ fieldId: expression.contains[0], pointer: `${pointer}.contains[0]` });
    return;
  }

  if ("gt" in expression) {
    references.push({ fieldId: expression.gt[0], pointer: `${pointer}.gt[0]` });
    return;
  }

  references.push({ fieldId: expression.lt[0], pointer: `${pointer}.lt[0]` });
}

function validateActionReferences(
  action: ActionDef,
  pointer: string,
  stepPointers: Map<string, string>,
  sectionPointers: Map<string, string>,
  fieldPointers: Map<string, string>,
  fieldIndex: Map<string, FieldIndexEntry>,
  optionToField: Map<string, string>,
  issues: ValidationIssue[],
): void {
  switch (action.action) {
    case "showStep":
    case "hideStep":
      ensureExists(stepPointers, "step", action.stepId, `${pointer}.stepId`, issues);
      return;
    case "showSection":
    case "hideSection":
      ensureExists(sectionPointers, "section", action.sectionId, `${pointer}.sectionId`, issues);
      return;
    case "showField":
    case "hideField":
    case "requireField":
    case "unrequireField":
    case "setValue":
    case "clearValue":
      ensureExists(fieldPointers, "field", action.fieldId, `${pointer}.fieldId`, issues);
      return;
    case "enableOption":
    case "disableOption":
      ensureExists(fieldPointers, "field", action.fieldId, `${pointer}.fieldId`, issues);
      ensureFieldOptionPair(
        action.fieldId,
        action.optionId,
        `${pointer}.optionId`,
        fieldIndex,
        optionToField,
        issues,
      );
      return;
    case "addLineItem":
    case "removeLineItem":
      return;
  }
}

function registerUniqueId(
  index: Map<string, string>,
  entityType: string,
  id: string,
  pointer: string,
  issues: ValidationIssue[],
): void {
  const firstPointer = index.get(id);
  if (firstPointer !== undefined) {
    pushError(
      issues,
      pointer,
      `duplicate ${entityType} id "${id}" (first defined at ${firstPointer})`,
      { type: entityType, id },
    );
    return;
  }
  index.set(id, pointer);
}

function ensureExists(
  index: Map<string, string>,
  entityType: string,
  id: string,
  pointer: string,
  issues: ValidationIssue[],
): void {
  if (!index.has(id)) {
    pushError(issues, pointer, `missing referenced ${entityType} "${id}"`, { type: entityType, id });
  }
}

function ensureFieldOptionPair(
  fieldId: string,
  optionId: string,
  pointer: string,
  fieldIndex: Map<string, FieldIndexEntry>,
  optionToField: Map<string, string>,
  issues: ValidationIssue[],
): void {
  const field = fieldIndex.get(fieldId);
  if (field === undefined) {
    return;
  }

  if (field.options.has(optionId)) {
    return;
  }

  const optionOwnerFieldId = optionToField.get(optionId);
  if (optionOwnerFieldId !== undefined) {
    pushError(
      issues,
      pointer,
      `option "${optionId}" belongs to field "${optionOwnerFieldId}" not "${fieldId}"`,
      { type: "option", id: optionId },
    );
    return;
  }

  pushError(
    issues,
    pointer,
    `missing referenced option "${optionId}" for field "${fieldId}"`,
    { type: "option", id: optionId },
  );
}

function pushError(
  issues: ValidationIssue[],
  pointer: string,
  message: string,
  entity?: { type: string; id: string },
): void {
  issues.push({
    severity: "error",
    message,
    pointer,
    entity,
  });
}
