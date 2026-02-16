import type {
  ColorAreaRecord,
  LayerAssetRecord,
  LayerRecord,
  ModelVersionBundle,
  OptionRecord,
  QuestionRecord,
  RenderViewRecord
} from "@ubb/cms-adapter-directus";
import type { CompiledModelConfig, ValidateBundleResult, ValidationError } from "./types.js";

type RecordWithSort = { id: string; sort?: number | null };
type RenderViewWithAreas = RenderViewRecord & { color_areas?: ColorAreaRecord[] };

function bySortThenId<T extends RecordWithSort>(a: T, b: T): number {
  const aSort = a.sort ?? Number.MAX_SAFE_INTEGER;
  const bSort = b.sort ?? Number.MAX_SAFE_INTEGER;
  if (aSort !== bSort) {
    return aSort - bSort;
  }
  return a.id.localeCompare(b.id);
}

function byLayerOrder(a: LayerRecord, b: LayerRecord): number {
  const aZ = a.z_index ?? Number.MAX_SAFE_INTEGER;
  const bZ = b.z_index ?? Number.MAX_SAFE_INTEGER;
  if (aZ !== bZ) {
    return aZ - bZ;
  }
  return a.id.localeCompare(b.id);
}

function byLayerAssetOrder(a: LayerAssetRecord, b: LayerAssetRecord): number {
  const hasASort = typeof a.sort === "number";
  const hasBSort = typeof b.sort === "number";

  if (hasASort && hasBSort && a.sort !== b.sort) {
    return (a.sort as number) - (b.sort as number);
  }
  if (hasASort && !hasBSort) {
    return -1;
  }
  if (!hasASort && hasBSort) {
    return 1;
  }
  return a.id.localeCompare(b.id);
}

function byRenderViewOrder(a: RenderViewRecord, b: RenderViewRecord): number {
  const aKey = a.key.trim();
  const bKey = b.key.trim();
  if (aKey.length > 0 && bKey.length > 0) {
    const byKey = aKey.localeCompare(bKey);
    if (byKey !== 0) {
      return byKey;
    }
    return a.id.localeCompare(b.id);
  }
  return bySortThenId(a, b);
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

  const questionById = new Map<string, QuestionRecord>();
  const questionKeySet = new Set<string>();
  const optionById = new Map<string, OptionRecord>();
  const paletteIdSet = new Set<string>();

  const optionGroups = sorted(bundle.option_groups ?? [], bySortThenId);
  optionGroups.forEach((group, groupIndex) => {
    sorted(group.questions ?? [], bySortThenId).forEach((question, questionIndex) => {
      const questionPath = `option_groups[${groupIndex}].questions[${questionIndex}]`;
      if (!question.id) {
        pushValidationError(errors, "missing_question_id", `${questionPath}.id`, "question id is required");
      }
      if (!question.key) {
        pushValidationError(errors, "missing_question_key", `${questionPath}.key`, "question key is required");
      } else if (questionKeySet.has(question.key)) {
        pushValidationError(
          errors,
          "duplicate_question_key",
          `${questionPath}.key`,
          `question key "${question.key}" is duplicated`
        );
      } else {
        questionKeySet.add(question.key);
      }

      questionById.set(question.id, question);
      sorted(question.options ?? [], bySortThenId).forEach((option, optionIndex) => {
        const optionPath = `${questionPath}.options[${optionIndex}]`;
        if (!option.id) {
          pushValidationError(errors, "missing_option_id", `${optionPath}.id`, "option id is required");
          return;
        }
        if (optionById.has(option.id)) {
          pushValidationError(
            errors,
            "duplicate_option_id",
            `${optionPath}.id`,
            `option id "${option.id}" is duplicated`
          );
          return;
        }
        optionById.set(option.id, option);
      });
    });
  });

  sorted(bundle.color_palettes ?? [], bySortThenId).forEach((palette, paletteIndex) => {
    if (paletteIdSet.has(palette.id)) {
      pushValidationError(
        errors,
        "duplicate_palette_id",
        `color_palettes[${paletteIndex}].id`,
        `palette id "${palette.id}" is duplicated`
      );
      return;
    }
    paletteIdSet.add(palette.id);
  });

  sorted(bundle.render_views ?? [], byRenderViewOrder).forEach((view, viewIndex) => {
    sorted(view.layers ?? [], byLayerOrder).forEach((layer, layerIndex) => {
      sorted(layer.layer_assets ?? [], byLayerAssetOrder).forEach((asset, assetIndex) => {
        if (asset.option_id && !optionById.has(asset.option_id)) {
          pushValidationError(
            errors,
            "unknown_layer_asset_option",
            `render_views[${viewIndex}].layers[${layerIndex}].layer_assets[${assetIndex}].option_id`,
            `layer asset references unknown option_id "${asset.option_id}"`
          );
        }
      });
    });

    const colorAreas = sorted(((view as RenderViewWithAreas).color_areas ?? []).slice(), bySortThenId);
    colorAreas.forEach((area, areaIndex) => {
      sorted(area.color_selections ?? [], bySortThenId).forEach((selection, selectionIndex) => {
        if (selection.question_id && !questionById.has(selection.question_id)) {
          pushValidationError(
            errors,
            "unknown_color_selection_question",
            `render_views[${viewIndex}].color_areas[${areaIndex}].color_selections[${selectionIndex}].question_id`,
            `color selection references unknown question_id "${selection.question_id}"`
          );
        }
        if (selection.allowed_palette_id && !paletteIdSet.has(selection.allowed_palette_id)) {
          pushValidationError(
            errors,
            "unknown_color_selection_palette",
            `render_views[${viewIndex}].color_areas[${areaIndex}].color_selections[${selectionIndex}].allowed_palette_id`,
            `color selection references unknown allowed_palette_id "${selection.allowed_palette_id}"`
          );
        }
      });
    });
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

export function compileModelVersionBundle(bundle: ModelVersionBundle): CompiledModelConfig {
  const questionById = new Map<string, QuestionRecord>();
  const questionKeyById = new Map<string, string>();
  const optionById = new Map<string, OptionRecord>();

  const questionsByKey: CompiledModelConfig["questions_by_key"] = {};
  const optionsById: CompiledModelConfig["options_by_id"] = {};
  const optionsByQuestionAndCode: CompiledModelConfig["options_by_question_and_code"] = {};

  const groups = sorted(bundle.option_groups ?? [], bySortThenId);
  for (const group of groups) {
    const questions = sorted(group.questions ?? [], bySortThenId);
    for (const question of questions) {
      questionById.set(question.id, question);
      questionKeyById.set(question.id, question.key);

      const questionOptions = sorted(question.options ?? [], bySortThenId);
      const optionIds = questionOptions.map((option) => option.id);
      questionsByKey[question.key] = {
        id: question.id,
        key: question.key,
        label: question.label,
        group_id: group.id,
        group_key: group.key,
        input_type: question.input_type ?? null,
        required: question.is_required ?? null,
        default_value: question.default_value ?? null,
        option_ids: optionIds
      };

      for (const option of questionOptions) {
        optionById.set(option.id, option);
        const renderMappings: CompiledModelConfig["options_by_id"][string]["render_mappings"] = [];
        optionsById[option.id] = {
          id: option.id,
          question_id: question.id,
          question_key: question.key,
          code: option.code ?? null,
          label: option.label,
          description: option.description ?? null,
          prices: {
            msrp: option.price_msrp ?? null,
            dealer: option.price_dealer ?? null,
            mode: option.price_mode ?? null
          },
          media_mode: option.media_mode ?? null,
          is_default: option.is_default ?? null,
          render_mappings: renderMappings
        };

        if (option.code) {
          optionsByQuestionAndCode[`${question.key}:${option.code}`] = option.id;
        }
      }
    }
  }

  const renderViews = sorted(bundle.render_views ?? [], byRenderViewOrder);
  const compiledViews: CompiledModelConfig["render"]["views"] = {};
  const viewKeys: string[] = [];

  for (const renderView of renderViews) {
    const layerMap: CompiledModelConfig["render"]["views"][string]["layers"] = {};
    const layerIds: string[] = [];
    const layers = sorted(renderView.layers ?? [], byLayerOrder);

    for (const layer of layers) {
      layerIds.push(layer.id);
      const assetsByOptionRef: Record<string, Array<{ id: string; file: string | null; sort: number | null; option_id: string | null }>> =
        {};
      const assets = sorted(layer.layer_assets ?? [], byLayerAssetOrder);

      for (const asset of assets) {
        const serializedAsset = {
          id: asset.id,
          file: asset.file ?? null,
          sort: asset.sort ?? null,
          option_id: asset.option_id ?? null
        };
        const keys = asset.option_id ? [asset.option_id] : ["default"];

        if (asset.option_id) {
          const matchedOption = optionById.get(asset.option_id);
          const questionKey = matchedOption?.question_id ? questionKeyById.get(matchedOption.question_id) : null;
          if (questionKey && matchedOption?.code) {
            keys.push(`${questionKey}:${matchedOption.code}`);
          }
        }

        for (const key of keys) {
          const arr = assetsByOptionRef[key] ?? [];
          arr.push(serializedAsset);
          assetsByOptionRef[key] = arr;
        }
      }

      layerMap[layer.id] = {
        id: layer.id,
        key: layer.key,
        z_index: layer.z_index ?? null,
        assets_by_option_ref: assetsByOptionRef
      };
    }

    viewKeys.push(renderView.key);
    compiledViews[renderView.key] = {
      id: renderView.id,
      key: renderView.key,
      label: renderView.label,
      base_image: renderView.base_image ?? null,
      layer_ids: layerIds,
      layers: layerMap
    };
  }

  for (const option of Object.values(optionsById)) {
    const renderMappings: CompiledModelConfig["options_by_id"][string]["render_mappings"] = [];
    for (const viewKey of viewKeys) {
      const view = compiledViews[viewKey];
      for (const layerId of view.layer_ids) {
        const layer = view.layers[layerId];
        const matchedIds = layer.assets_by_option_ref[option.id]?.map((asset) => asset.id) ?? [];
        if (matchedIds.length > 0) {
          renderMappings.push({
            view_key: viewKey,
            layer_key: layer.key,
            layer_id: layer.id,
            asset_ids: matchedIds
          });
        }
      }
    }
    option.render_mappings = renderMappings;
  }

  const paletteIds: string[] = [];
  const palettesById: CompiledModelConfig["colors"]["palettes_by_id"] = {};
  const colorsById: CompiledModelConfig["colors"]["colors_by_id"] = {};
  const colorPalettes = sorted(bundle.color_palettes ?? [], bySortThenId);
  for (const palette of colorPalettes) {
    const colorIds: string[] = [];
    const paletteColors = sorted(palette.colors ?? [], bySortThenId);
    for (const color of paletteColors) {
      colorIds.push(color.id);
      colorsById[color.id] = {
        id: color.id,
        palette_id: palette.id,
        name: color.name,
        hex: color.hex
      };
    }
    paletteIds.push(palette.id);
    palettesById[palette.id] = {
      id: palette.id,
      key: palette.key,
      label: palette.label,
      color_ids: colorIds
    };
  }

  const areaKeys: string[] = [];
  const areasByKey: CompiledModelConfig["colors"]["areas_by_key"] = {};
  const selectionsByQuestionKey: CompiledModelConfig["colors"]["selections_by_question_key"] = {};

  for (const renderView of renderViews as RenderViewWithAreas[]) {
    const colorAreas = sorted((renderView.color_areas ?? []).slice(), bySortThenId);
    for (const area of colorAreas) {
      areaKeys.push(area.key);
      areasByKey[area.key] = {
        id: area.id,
        key: area.key,
        view_key: renderView.key,
        mask_file: area.mask_file ?? null,
        default_color_id: area.default_color_id ?? null
      };

      const selections = sorted(area.color_selections ?? [], bySortThenId);
      for (const selection of selections) {
        const questionId = selection.question_id ?? selection.option?.id ?? null;
        const questionKey = questionId ? (questionKeyById.get(questionId) ?? questionId) : null;
        if (!questionKey) {
          continue;
        }

        const list = selectionsByQuestionKey[questionKey] ?? [];
        list.push({
          area_key: area.key,
          allowed_palette_id: selection.allowed_palette_id ?? selection.color?.id ?? null
        });
        selectionsByQuestionKey[questionKey] = list;
      }
    }
  }

  for (const key of Object.keys(selectionsByQuestionKey)) {
    selectionsByQuestionKey[key] = sorted(
      selectionsByQuestionKey[key],
      (a, b) =>
        a.area_key.localeCompare(b.area_key) ||
        (a.allowed_palette_id ?? "").localeCompare(b.allowed_palette_id ?? "")
    );
  }

  const rules = sorted(bundle.rules ?? [], bySortThenId)
    .filter((rule) => rule.enabled !== false && typeof rule.rule_json === "object" && rule.rule_json !== null)
    .map((rule) => ({
      id: rule.id,
      scope: rule.scope ?? null,
      priority: rule.priority ?? null,
      rule_json: rule.rule_json as Record<string, unknown>
    }));

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
    render: {
      view_keys: viewKeys,
      views: compiledViews
    },
    colors: {
      palette_ids: paletteIds,
      palettes_by_id: palettesById,
      colors_by_id: colorsById,
      area_keys: areaKeys,
      areas_by_key: areasByKey,
      selections_by_question_key: selectionsByQuestionKey
    },
    rules
  };
}
