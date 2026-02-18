import "server-only";

import type { GroupOptionRecord, ModelVersionBundle, PublishedModel, VersionItemRecord } from "@ubb/cms-adapter-directus";
import { bySortThenId, type ConfigOptionView, type ConfigSelectionGroupView, type SelectionState } from "../configurator-shared";

export interface PublishedModelVersionChoice {
  modelName: string;
  modelVersionId: string;
  label: string;
}

interface RawModelVersion {
  model: PublishedModel;
  version: PublishedModel["model_versions"][number];
}

function readModelVersionIdFromEnv(): string | null {
  const value = process.env.MODEL_VERSION_ID?.trim();
  return value && value.length > 0 ? value : null;
}

function versionText(version: { year?: number | null; trim?: string | null }): string {
  const parts = [version.year ? String(version.year) : null, version.trim ?? null].filter(
    (part): part is string => Boolean(part)
  );
  return parts.length > 0 ? parts.join(" ") : "Unknown version";
}

export async function listPublishedModelVersionChoices(): Promise<PublishedModelVersionChoice[]> {
  const { getPublishedModels } = await import("@ubb/cms-adapter-directus");
  const models = await getPublishedModels();
  const rows: RawModelVersion[] = [];

  for (const model of models) {
    const versions = model.model_versions.filter((version) => version.status === "published");
    for (const version of versions) {
      rows.push({ model, version });
    }
  }

  return rows.map(({ model, version }) => ({
    modelName: model.name,
    modelVersionId: version.id,
    label: `${model.name} - ${versionText(version)}`
  }));
}

export async function pickModelVersion(args: {
  selectedModelVersionId: string | null;
}): Promise<{
  modelVersionId: string | null;
  source: "env" | "single" | "selected" | "none";
  choices: PublishedModelVersionChoice[];
}> {
  const envModelVersionId = readModelVersionIdFromEnv();
  const choices = await listPublishedModelVersionChoices();

  if (envModelVersionId) {
    return {
      modelVersionId: envModelVersionId,
      source: "env",
      choices
    };
  }

  if (choices.length === 0) {
    return {
      modelVersionId: null,
      source: "none",
      choices
    };
  }

  if (choices.length === 1) {
    return {
      modelVersionId: choices[0].modelVersionId,
      source: "single",
      choices
    };
  }

  if (args.selectedModelVersionId && choices.some((choice) => choice.modelVersionId === args.selectedModelVersionId)) {
    return {
      modelVersionId: args.selectedModelVersionId,
      source: "selected",
      choices
    };
  }

  return {
    modelVersionId: null,
    source: "none",
    choices
  };
}

function selectionStateKey(group: { id: string; key: string }): string {
  return group.key || group.id;
}

function createVersionItemMap(bundle: ModelVersionBundle): Map<string, VersionItemRecord> {
  return new Map(bundle.version_items.map((item) => [item.id, item]));
}

function createGroupOptionsMap(bundle: ModelVersionBundle): Map<string, GroupOptionRecord[]> {
  const map = new Map<string, GroupOptionRecord[]>();
  const sortedOptions = [...bundle.group_options].sort(bySortThenId);

  for (const option of sortedOptions) {
    const row = map.get(option.selection_group) ?? [];
    row.push(option);
    map.set(option.selection_group, row);
  }

  return map;
}

function optionLabel(option: GroupOptionRecord, item: VersionItemRecord | undefined): string {
  const label = option.label_override ?? item?.label_override ?? item?.item_detail?.label_default ?? item?.id ?? option.id;
  return label;
}

function toOptions(args: {
  groupOptions: GroupOptionRecord[];
  versionItemsById: Map<string, VersionItemRecord>;
}): ConfigOptionView[] {
  return args.groupOptions.map((option) => {
    const item = args.versionItemsById.get(option.version_item);
    return {
      id: option.id,
      versionItemId: option.version_item,
      label: optionLabel(option, item),
      sort: option.sort ?? null
    };
  });
}

export function toSelectionGroupsView(bundle: ModelVersionBundle): ConfigSelectionGroupView[] {
  const sortedGroups = [...bundle.selection_groups].sort(bySortThenId);
  const versionItemsById = createVersionItemMap(bundle);
  const groupOptionsByGroupId = createGroupOptionsMap(bundle);

  return sortedGroups.map((group) => ({
    id: group.id,
    key: selectionStateKey(group),
    title: group.title,
    selectionMode: group.selection_mode,
    sort: group.sort ?? null,
    options: toOptions({
      groupOptions: groupOptionsByGroupId.get(group.id) ?? [],
      versionItemsById
    })
  }));
}

export async function createInitialConfiguratorData(args: {
  modelVersionId: string;
}): Promise<{
  modelVersionId: string;
  selections: SelectionState;
  selectionGroups: ConfigSelectionGroupView[];
  colorByAreaKey: Record<string, string>;
  initialDataUrl: string | null;
}> {
  const { createConfiguratorSession } = await import("@ubb/engine");
  const session = await createConfiguratorSession({ modelVersionId: args.modelVersionId });

  return {
    modelVersionId: session.modelVersionId,
    selections: session.selections,
    selectionGroups: toSelectionGroupsView(session.bundle),
    colorByAreaKey: session.colorByAreaKey,
    initialDataUrl: session.renders[0]?.dataUrl ?? null
  };
}
