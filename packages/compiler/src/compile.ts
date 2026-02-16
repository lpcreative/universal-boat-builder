import type { ModelVersionBundle, RenderLayerRecord, RenderViewRecord, SelectionGroupRecord, VersionItemRecord } from "@ubb/cms-adapter-directus";
import type { CompiledModelConfig, ValidateBundleResult, ValidationError } from "./types.js";

type RecordWithSort = { id: string; sort?: number | null };

function bySortThenId<T extends RecordWithSort>(a: T, b: T): number {
  const aSort = a.sort ?? Number.MAX_SAFE_INTEGER;
  const bSort = b.sort ?? Number.MAX_SAFE_INTEGER;
  if (aSort !== bSort) {
    return aSort - bSort;
  }
  return a.id.localeCompare(b.id);
}

function sorted<T>(items: T[], comparator: (a: T, b: T) => number): T[] {
  return [...items].sort(comparator);
}

function pushValidationError(errors: ValidationError[], code: string, path: string, message: string): void {
  errors.push({ code, path, message });
}

function validateBundleInternal(bundle: ModelVersionBundle): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!bundle.id) {
    pushValidationError(errors, "missing_id", "id", "model_version id is required");
  }
  if (!bundle.version_label) {
    pushValidationError(errors, "missing_version_label", "version_label", "version_label is required");
  }

  const groupKeys = new Set<string>();
  sorted(bundle.selection_groups ?? [], bySortThenId).forEach((group, index) => {
    if (!group.id) {
      pushValidationError(errors, "missing_selection_group_id", `selection_groups[${index}].id`, "selection_group id is required");
    }
    if (!group.key) {
      pushValidationError(errors, "missing_selection_group_key", `selection_groups[${index}].key`, "selection_group key is required");
    } else if (groupKeys.has(group.key)) {
      pushValidationError(
        errors,
        "duplicate_selection_group_key",
        `selection_groups[${index}].key`,
        `selection_group key \"${group.key}\" is duplicated`
      );
    } else {
      groupKeys.add(group.key);
    }
  });

  const itemIds = new Set<string>();
  sorted(bundle.version_items ?? [], bySortThenId).forEach((item, index) => {
    if (!item.id) {
      pushValidationError(errors, "missing_version_item_id", `version_items[${index}].id`, "version_item id is required");
      return;
    }
    if (itemIds.has(item.id)) {
      pushValidationError(errors, "duplicate_version_item_id", `version_items[${index}].id`, `version_item id \"${item.id}\" is duplicated`);
      return;
    }
    itemIds.add(item.id);
  });

  return errors;
}

export function validateBundle(bundle: ModelVersionBundle): ValidateBundleResult {
  const errors = validateBundleInternal(bundle);
  if (errors.length === 0) {
    return { ok: true };
  }
  return {
    ok: false,
    errors: errors.sort((a, b) => a.path.localeCompare(b.path))
  };
}

function resolveItemCode(item: VersionItemRecord): string | null {
  return item.item_detail?.key ?? item.source_ref ?? null;
}

function resolveItemLabel(item: VersionItemRecord): string {
  return item.label_override ?? item.item_detail?.label_default ?? item.id;
}

function buildSyntheticQuestions(selectionGroups: SelectionGroupRecord[]): Array<{
  id: string;
  key: string;
  label: string;
  inputType: string | null;
  required: boolean | null;
}> {
  if (selectionGroups.length > 0) {
    return selectionGroups.map((group) => ({
      id: group.id,
      key: group.key,
      label: group.title,
      inputType: group.selection_mode,
      required: group.is_required ?? null
    }));
  }

  return [
    {
      id: "__version_items__",
      key: "version_items",
      label: "Version Items",
      inputType: "multi",
      required: null
    }
  ];
}

function buildRender(
  renderViews: RenderViewRecord[],
  renderLayers: RenderLayerRecord[]
): CompiledModelConfig["render"] {
  const views = sorted(renderViews, bySortThenId);
  const layersByView = new Map<string, RenderLayerRecord[]>();

  for (const layer of renderLayers) {
    const list = layersByView.get(layer.render_view) ?? [];
    list.push(layer);
    layersByView.set(layer.render_view, list);
  }

  const compiledViews: Record<string, CompiledModelConfig["render"]["views"][string]> = {};
  const viewKeys: string[] = [];

  for (const view of views) {
    const viewLayers = sorted(layersByView.get(view.id) ?? [], bySortThenId);
    const layerIds: string[] = [];
    const layerMap: Record<string, CompiledModelConfig["render"]["views"][string]["layers"][string]> = {};

    for (const layer of viewLayers) {
      layerIds.push(layer.id);
      layerMap[layer.id] = {
        id: layer.id,
        key: layer.key,
        z_index: null,
        assets_by_option_ref: {
          default: [
            {
              id: layer.id,
              file: layer.asset ?? null,
              sort: layer.sort ?? null,
              option_id: null
            }
          ]
        }
      };
    }

    viewKeys.push(view.key);
    compiledViews[view.key] = {
      id: view.id,
      key: view.key,
      label: view.title,
      base_image: null,
      layer_ids: layerIds,
      layers: layerMap
    };
  }

  return {
    view_keys: viewKeys,
    views: compiledViews
  };
}

export function compileModelVersionBundle(bundle: ModelVersionBundle): CompiledModelConfig {
  const selectionGroups = sorted(bundle.selection_groups ?? [], bySortThenId);
  const versionItems = sorted(bundle.version_items ?? [], bySortThenId);
  const syntheticQuestions = buildSyntheticQuestions(selectionGroups);

  const questionsByKey: CompiledModelConfig["questions_by_key"] = {};
  const optionsById: CompiledModelConfig["options_by_id"] = {};
  const optionsByQuestionAndCode: CompiledModelConfig["options_by_question_and_code"] = {};

  for (const question of syntheticQuestions) {
    questionsByKey[question.key] = {
      id: question.id,
      key: question.key,
      label: question.label,
      group_id: question.id,
      group_key: question.key,
      input_type: question.inputType,
      required: question.required,
      default_value: null,
      option_ids: []
    };
  }

  const fallbackQuestion = syntheticQuestions[0];

  for (const item of versionItems) {
    const code = resolveItemCode(item);
    const question = fallbackQuestion;
    questionsByKey[question.key].option_ids.push(item.id);

    optionsById[item.id] = {
      id: item.id,
      question_id: question.id,
      question_key: question.key,
      code,
      label: resolveItemLabel(item),
      description: item.item_detail?.description ?? item.notes ?? null,
      prices: {
        msrp: item.msrp ?? null,
        dealer: item.dealer_price ?? null,
        mode: null
      },
      media_mode: null,
      is_default: item.is_default ?? null,
      render_mappings: []
    };

    if (code) {
      optionsByQuestionAndCode[`${question.key}:${code}`] = item.id;
    }
  }

  return {
    metadata: {
      contract_version: "v0",
      model_version_id: bundle.id,
      model_year: bundle.model_year ?? null,
      version_label: bundle.version_label,
      compiled_at: null,
      compiled_hash: ""
    },
    questions_by_key: questionsByKey,
    options_by_id: optionsById,
    options_by_question_and_code: optionsByQuestionAndCode,
    render: buildRender(bundle.render_views ?? [], bundle.render_layers ?? []),
    colors: {
      palette_ids: [],
      palettes_by_id: {},
      colors_by_id: {},
      area_keys: [],
      areas_by_key: {},
      selections_by_question_key: {}
    },
    rules: []
  };
}
