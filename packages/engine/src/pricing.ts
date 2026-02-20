import type { ModelVersionBundle } from "@ubb/cms-adapter-directus";

type SelectionValue = string | string[] | boolean | number | null;
type SelectionState = Record<string, SelectionValue>;

export interface PricingLineItem {
  key: string;
  label: string;
  qty: number;
  isIncluded: boolean;
  source: "selection" | "included";
  msrp?: number | null;
  dealer?: number | null;
  vendorCode?: string | null;
  internalCode?: string | null;
  notes?: string | null;
  category?: string | null;
}

export interface PricingTotals {
  msrp: number;
  dealer: number;
}

export interface PricingResult {
  lineItems: PricingLineItem[];
  totals: PricingTotals;
  warnings: string[];
}

export interface ComputePricingOptions {
  audience?: "public" | "dealer";
}

function bySortThenId<T extends { sort?: number | null; id: string }>(a: T, b: T): number {
  const aSort = a.sort ?? Number.MAX_SAFE_INTEGER;
  const bSort = b.sort ?? Number.MAX_SAFE_INTEGER;
  if (aSort !== bSort) {
    return aSort - bSort;
  }
  return a.id.localeCompare(b.id);
}

function selectionStateKey(group: { id: string; key: string }): string {
  return group.key || group.id;
}

function asCandidates(value: SelectionValue): string[] {
  if (typeof value === "string" && value.length > 0) {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
  }
  return [];
}

function asQty(value: SelectionValue): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  return Math.floor(value);
}

function asBool(value: SelectionValue): boolean {
  return value === true;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function makeLineItemLabel(item: ModelVersionBundle["version_items"][number]): string {
  return item.label_override ?? item.item_detail?.label_default ?? item.id;
}

function resolveSelectionByGroup(args: {
  bundle: ModelVersionBundle;
  selections: SelectionState;
  warnings: string[];
}): Array<{
  groupKey: string;
  versionItemId: string;
  qty: number;
  groupOption: ModelVersionBundle["group_options"][number] | null;
}> {
  const groupOptionsByGroupId = new Map<string, ModelVersionBundle["group_options"]>();
  const optionById = new Map(args.bundle.group_options.map((option) => [option.id, option]));
  const versionItemsById = new Map(args.bundle.version_items.map((item) => [item.id, item]));
  const selectedRows: Array<{
    groupKey: string;
    versionItemId: string;
    qty: number;
    groupOption: ModelVersionBundle["group_options"][number] | null;
  }> = [];

  const sortedOptions = [...args.bundle.group_options].sort(bySortThenId);
  for (const option of sortedOptions) {
    const row = groupOptionsByGroupId.get(option.selection_group) ?? [];
    row.push(option);
    groupOptionsByGroupId.set(option.selection_group, row);
  }

  const sortedGroups = [...args.bundle.selection_groups].sort(bySortThenId);
  const groupedVersionItemIds = new Set<string>();

  for (const group of sortedGroups) {
    const groupKey = selectionStateKey(group);
    const selectionValue = args.selections[groupKey];
    const groupOptions = groupOptionsByGroupId.get(group.id) ?? [];
    const candidates = asCandidates(selectionValue);
    const versionItemIdsForGroup = new Set(groupOptions.map((option) => option.version_item));

    for (const versionItemId of versionItemIdsForGroup) {
      groupedVersionItemIds.add(versionItemId);
    }

    const addSelected = (versionItemId: string, qty: number, option: ModelVersionBundle["group_options"][number] | null): void => {
      const versionItem = versionItemsById.get(versionItemId);
      if (!versionItem) {
        args.warnings.push(`selection "${groupKey}" references unknown version_item "${versionItemId}"`);
        return;
      }
      if (versionItem.is_available === false) {
        args.warnings.push(`selection "${groupKey}" references unavailable version_item "${versionItemId}"`);
        return;
      }
      selectedRows.push({
        groupKey,
        versionItemId,
        qty,
        groupOption: option
      });
    };

    if (groupOptions.length > 0) {
      if (group.selection_mode === "single") {
        const selectedOption = candidates
          .map((candidate) => optionById.get(candidate) ?? groupOptions.find((option) => option.version_item === candidate))
          .find((option) => Boolean(option));
        if (selectedOption) {
          addSelected(selectedOption.version_item, 1, selectedOption);
        }
        continue;
      }

      if (group.selection_mode === "multi") {
        const candidateSet = new Set(candidates);
        for (const option of groupOptions) {
          if (candidateSet.has(option.id) || candidateSet.has(option.version_item)) {
            addSelected(option.version_item, 1, option);
          }
        }
        continue;
      }

      if (group.selection_mode === "boolean") {
        if (!asBool(selectionValue)) {
          continue;
        }
        const preferred = groupOptions.find((option) => option.default_state === "selected") ?? groupOptions[0] ?? null;
        if (preferred) {
          addSelected(preferred.version_item, 1, preferred);
        }
        continue;
      }

      if (group.selection_mode === "quantity") {
        const qty = asQty(selectionValue);
        if (qty <= 0) {
          continue;
        }
        const selectedOption = candidates
          .map((candidate) => optionById.get(candidate) ?? groupOptions.find((option) => option.version_item === candidate))
          .find((option) => Boolean(option));
        const quantityOption = selectedOption ?? groupOptions[0] ?? null;
        if (!quantityOption) {
          args.warnings.push(`quantity group "${groupKey}" has no selectable options`);
          continue;
        }
        addSelected(quantityOption.version_item, qty, quantityOption);
      }
      continue;
    }

    const fallbackCandidates = candidates.filter((candidate) => versionItemsById.has(candidate));
    if (group.selection_mode === "single") {
      const candidate = fallbackCandidates[0];
      if (candidate) {
        addSelected(candidate, 1, null);
      }
      continue;
    }
    if (group.selection_mode === "multi") {
      const seen = new Set<string>();
      for (const candidate of fallbackCandidates) {
        if (seen.has(candidate)) {
          continue;
        }
        seen.add(candidate);
        addSelected(candidate, 1, null);
      }
      continue;
    }
    if (group.selection_mode === "boolean") {
      if (!asBool(selectionValue)) {
        continue;
      }
      const defaultVersionItem = args.bundle.version_items
        .filter((item) => item.is_available !== false)
        .sort(bySortThenId)[0];
      if (defaultVersionItem) {
        addSelected(defaultVersionItem.id, 1, null);
      }
      continue;
    }
    const qty = asQty(selectionValue);
    if (qty > 0) {
      args.warnings.push(`quantity group "${groupKey}" has no group_options; quantity cannot map to a version_item`);
    }
  }

  const ungroupedVersionItems = new Set(
    args.bundle.version_items
      .filter((item) => !groupedVersionItemIds.has(item.id))
      .map((item) => item.id)
  );

  for (const [selectionKey, selectionValue] of Object.entries(args.selections)) {
    const candidates = asCandidates(selectionValue);
    const uniqueCandidates = new Set(candidates);
    for (const candidate of uniqueCandidates) {
      if (!ungroupedVersionItems.has(candidate)) {
        continue;
      }
      const versionItem = versionItemsById.get(candidate);
      if (!versionItem || versionItem.is_available === false) {
        continue;
      }
      selectedRows.push({
        groupKey: selectionKey,
        versionItemId: candidate,
        qty: 1,
        groupOption: null
      });
    }
  }

  return selectedRows;
}

export function computePricing(
  bundle: ModelVersionBundle,
  selections: SelectionState,
  options: ComputePricingOptions = {}
): PricingResult {
  const audience = options.audience ?? "public";
  void audience;

  const warnings: string[] = [];
  const versionItemsById = new Map(bundle.version_items.map((item) => [item.id, item]));
  const selectedRows = resolveSelectionByGroup({ bundle, selections, warnings });
  const selectedIncludedIds = new Set<string>();

  const lineItems = selectedRows
    .filter((row) => {
      const versionItem = versionItemsById.get(row.versionItemId);
      if (!versionItem) {
        return false;
      }
      if (versionItem.is_included === true) {
        selectedIncludedIds.add(versionItem.id);
        return false;
      }
      return row.qty > 0;
    })
    .map((row): PricingLineItem => {
      const versionItem = versionItemsById.get(row.versionItemId);
      if (!versionItem) {
        return {
          key: `${row.groupKey}:${row.versionItemId}`,
          label: row.versionItemId,
          qty: row.qty,
          isIncluded: false,
          source: "selection",
          msrp: null,
          dealer: null
        };
      }

      const msrp = row.groupOption?.override_msrp ?? versionItem.msrp ?? null;
      const dealer = row.groupOption?.override_dealer_price ?? versionItem.dealer_price ?? null;
      const optionKey = row.groupOption?.id ? `:${row.groupOption.id}` : "";
      return {
        key: `${row.groupKey}:${row.versionItemId}${optionKey}`,
        label: makeLineItemLabel(versionItem),
        qty: row.qty,
        isIncluded: false,
        source: "selection",
        msrp,
        dealer,
        vendorCode: versionItem.item_detail?.vendor_code ?? null,
        internalCode: versionItem.item_detail?.internal_code ?? null,
        notes: versionItem.notes ?? null,
        category: versionItem.item_detail?.item_category ?? null
      };
    });

  const includedLineItems: PricingLineItem[] = [...bundle.version_items]
    .filter((item) => item.is_included === true)
    .sort(bySortThenId)
    .map((item): PricingLineItem => {
      if (selectedIncludedIds.has(item.id)) {
        warnings.push(`included version_item "${item.id}" is also selected; reporting it once as included`);
      }

      return {
        key: `included:${item.id}`,
        label: makeLineItemLabel(item),
        qty: 1,
        isIncluded: true,
        source: "included",
        msrp: 0,
        dealer: 0,
        vendorCode: item.item_detail?.vendor_code ?? null,
        internalCode: item.item_detail?.internal_code ?? null,
        notes: item.notes ?? null,
        category: item.item_detail?.item_category ?? null
      };
    });

  const combined = [...lineItems, ...includedLineItems];
  combined.sort((a, b) => {
    const categoryA = a.category ?? "";
    const categoryB = b.category ?? "";
    if (categoryA !== categoryB) {
      return categoryA.localeCompare(categoryB);
    }
    if (a.label !== b.label) {
      return a.label.localeCompare(b.label);
    }
    if (a.key !== b.key) {
      return a.key.localeCompare(b.key);
    }
    return 0;
  });

  const totals = combined.reduce(
    (acc, item) => {
      if (!item.isIncluded && typeof item.msrp === "number" && Number.isFinite(item.msrp)) {
        acc.msrp += item.msrp * item.qty;
      }
      if (!item.isIncluded && typeof item.dealer === "number" && Number.isFinite(item.dealer)) {
        acc.dealer += item.dealer * item.qty;
      }
      return acc;
    },
    { msrp: 0, dealer: 0 }
  );

  const hasPricedSelections = selectedRows.some((row) => {
    const versionItem = versionItemsById.get(row.versionItemId);
    if (!versionItem) {
      return false;
    }
    const msrp = row.groupOption?.override_msrp ?? versionItem.msrp ?? 0;
    const dealer = row.groupOption?.override_dealer_price ?? versionItem.dealer_price ?? 0;
    return msrp > 0 || dealer > 0;
  });
  if (hasPricedSelections && totals.msrp <= 0 && totals.dealer <= 0) {
    warnings.push("priced selections detected but computed totals are zero; check pricing mapping.");
  }

  return {
    lineItems: combined,
    totals: {
      msrp: roundMoney(totals.msrp),
      dealer: roundMoney(totals.dealer)
    },
    warnings
  };
}
