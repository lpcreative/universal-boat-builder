"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { computePricing, type PricingLineItem } from "@ubb/engine/pricing";
import { renderMaskTintPreview } from "../lib/client/mask-tint-renderer";
import type {
  ClientPricingBundle,
  ClientRenderConfig,
  ConfigSelectionGroupView,
  SelectionState
} from "../lib/configurator-shared";

interface ConfiguratorClientProps {
  modelVersionId: string;
  modelLabel: string;
  showCopyModelVersionIdButton: boolean;
  selectionGroups: ConfigSelectionGroupView[];
  initialSelections: SelectionState;
  initialColorByAreaKey: Record<string, string>;
  renderConfig: ClientRenderConfig;
  pricingBundle: ClientPricingBundle;
}

type PricingMode = "msrp" | "dealer";

interface StepSection {
  id: string;
  title: string;
  groups: ConfigSelectionGroupView[];
}

interface FlowStepGroup {
  id: string;
  key: string;
  title: string;
  flowTitle: string;
  sections: StepSection[];
}

function asStringArray(value: SelectionState[string]): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function asBoolean(value: SelectionState[string]): boolean {
  return typeof value === "boolean" ? value : false;
}

function asNumber(value: SelectionState[string]): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function asString(value: SelectionState[string]): string {
  return typeof value === "string" ? value : "";
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

function lineItemExtendedPrice(line: PricingLineItem, mode: PricingMode): number {
  if (line.isIncluded) {
    return 0;
  }
  return ((mode === "dealer" ? line.dealer : line.msrp) ?? 0) * line.qty;
}

function lineItemUnitPrice(line: PricingLineItem, mode: PricingMode): number {
  if (line.isIncluded) {
    return 0;
  }
  return mode === "dealer" ? line.dealer ?? 0 : line.msrp ?? 0;
}

function buildStepTree(selectionGroups: ConfigSelectionGroupView[]): FlowStepGroup[] {
  const ordered = [...selectionGroups].sort((a, b) => {
    const flowDelta = (a.flowSort ?? Number.MAX_SAFE_INTEGER) - (b.flowSort ?? Number.MAX_SAFE_INTEGER);
    if (flowDelta !== 0) {
      return flowDelta;
    }
    const stepDelta = (a.stepSort ?? Number.MAX_SAFE_INTEGER) - (b.stepSort ?? Number.MAX_SAFE_INTEGER);
    if (stepDelta !== 0) {
      return stepDelta;
    }
    const sectionDelta = (a.sectionSort ?? Number.MAX_SAFE_INTEGER) - (b.sectionSort ?? Number.MAX_SAFE_INTEGER);
    if (sectionDelta !== 0) {
      return sectionDelta;
    }
    const groupDelta = (a.sort ?? Number.MAX_SAFE_INTEGER) - (b.sort ?? Number.MAX_SAFE_INTEGER);
    if (groupDelta !== 0) {
      return groupDelta;
    }
    return a.id.localeCompare(b.id);
  });

  const steps = new Map<string, FlowStepGroup>();
  for (const group of ordered) {
    const step = steps.get(group.stepId) ?? {
      id: group.stepId,
      key: group.stepKey,
      title: group.stepTitle,
      flowTitle: group.flowTitle,
      sections: []
    };
    if (!steps.has(group.stepId)) {
      steps.set(group.stepId, step);
    }

    let section = step.sections.find((entry) => entry.id === group.sectionId);
    if (!section) {
      section = {
        id: group.sectionId,
        title: group.sectionTitle,
        groups: []
      };
      step.sections.push(section);
    }
    section.groups.push(group);
  }

  return Array.from(steps.values());
}

function SummaryBar(props: {
  pricingMode: PricingMode;
  onPricingModeChange: (nextMode: PricingMode) => void;
  selectedItems: number;
  quantityTotal: number;
  isExpanded: boolean;
  onToggleExpanded: () => void;
  expandedPanelId: string;
  total: number;
  msrpTotal: number;
  dealerTotal: number;
  selectedLineItems: PricingLineItem[];
  includedLineItems: PricingLineItem[];
  warnings: string[];
}): JSX.Element {
  const activePriceLabel = props.pricingMode === "dealer" ? "Dealer" : "MSRP";

  return (
    <div className="rounded-t-2xl border border-slate-200 bg-white/95 p-4 shadow-[0_-8px_32px_rgba(15,23,42,0.12)] backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Total</p>
          <p className="text-xl font-semibold text-slate-900">{formatCurrency(props.total)}</p>
          <p className="text-xs text-slate-500">{activePriceLabel}</p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs">
          <button
            type="button"
            onClick={() => {
              props.onPricingModeChange("msrp");
            }}
            className={`rounded-md px-2.5 py-1.5 font-medium transition ${
              props.pricingMode === "msrp" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
            }`}
          >
            MSRP
          </button>
          <button
            type="button"
            onClick={() => {
              props.onPricingModeChange("dealer");
            }}
            className={`rounded-md px-2.5 py-1.5 font-medium transition ${
              props.pricingMode === "dealer"
                ? "bg-white text-slate-900 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            Dealer
          </button>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-slate-600">
        <span>{props.selectedItems} selected</span>
        <span>{props.quantityTotal} quantity</span>
      </div>

      <button
        type="button"
        className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        aria-expanded={props.isExpanded}
        aria-controls={props.expandedPanelId}
        onClick={props.onToggleExpanded}
      >
        {props.isExpanded ? "Hide Details" : "View Details"}
      </button>

      <div
        id={props.expandedPanelId}
        className={`overflow-hidden transition-[max-height,opacity,transform] duration-200 ${
          props.isExpanded ? "mt-3 max-h-96 opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Selected line items</p>
            {props.selectedLineItems.length > 0 ? (
              <ul className="mt-1 space-y-1 text-slate-700">
                {props.selectedLineItems.map((line) => (
                  <li key={line.key} className="flex items-start justify-between gap-3">
                    <div>
                      <span>{line.label}</span>
                      {line.qty > 1 ? <span className="ml-1 text-xs text-slate-500">x{line.qty}</span> : null}
                      {line.isIncluded ? (
                        <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700">
                          Included
                        </span>
                      ) : null}
                    </div>
                    <div className="text-right text-xs text-slate-600">
                      <p>{formatCurrency(lineItemExtendedPrice(line, props.pricingMode))}</p>
                      <p>Unit {formatCurrency(lineItemUnitPrice(line, props.pricingMode))}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-slate-600">No selections yet.</p>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Included items</p>
            {props.includedLineItems.length > 0 ? (
              <ul className="mt-1 space-y-1 text-slate-700">
                {props.includedLineItems.map((line) => (
                  <li key={line.key} className="flex items-start justify-between gap-3">
                    <div>
                      <span>{line.label}</span>
                      <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700">
                        Included
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">{formatCurrency(0)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-slate-600">No included items.</p>
            )}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Warnings</p>
            {props.warnings.length > 0 ? (
              <ul className="mt-1 space-y-1 text-amber-800">
                {props.warnings.map((warning, index) => (
                  <li key={`${index}-${warning}`}>{warning}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-slate-600">No warnings.</p>
            )}
          </div>
          <div className="rounded-md border border-slate-200 bg-white p-2">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Totals</p>
            <div className="mt-1 text-xs text-slate-700">
              <p>MSRP: {formatCurrency(props.msrpTotal)}</p>
              <p>Dealer: {formatCurrency(props.dealerTotal)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ConfiguratorClient(props: ConfiguratorClientProps): JSX.Element {
  const [selections, setSelections] = useState<SelectionState>(props.initialSelections);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [colorByAreaKey, setColorByAreaKey] = useState<Record<string, string>>(props.initialColorByAreaKey);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pricingMode, setPricingMode] = useState<PricingMode>("msrp");
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);

  const requestIdRef = useRef(0);
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const sortedGroups = useMemo(
    () => [...props.selectionGroups].sort((a, b) => (a.sort ?? Number.MAX_SAFE_INTEGER) - (b.sort ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id)),
    [props.selectionGroups]
  );
  const stepTree = useMemo(() => buildStepTree(sortedGroups), [sortedGroups]);
  const [activeStepId, setActiveStepId] = useState(stepTree[0]?.id ?? null);

  useEffect(() => {
    if (!activeStepId && stepTree.length > 0) {
      setActiveStepId(stepTree[0].id);
      return;
    }
    if (activeStepId && stepTree.every((step) => step.id !== activeStepId)) {
      setActiveStepId(stepTree[0]?.id ?? null);
    }
  }, [activeStepId, stepTree]);

  const rerender = useCallback(
    async (nextSelections: SelectionState): Promise<void> => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      setIsRendering(true);
      setError(null);

      try {
        const payload = await renderMaskTintPreview({
          renderConfig: props.renderConfig,
          selections: nextSelections
        });
        if (requestId !== requestIdRef.current) {
          return;
        }

        setDataUrl(payload.dataUrl);
        setColorByAreaKey(payload.colorByAreaKey);
        setWarnings(payload.warnings);
      } catch (unknownError) {
        if (requestId !== requestIdRef.current) {
          return;
        }

        const message = unknownError instanceof Error ? unknownError.message : "Unknown render error";
        setError(message);
        setWarnings([]);
      } finally {
        if (requestId === requestIdRef.current) {
          setIsRendering(false);
        }
      }
    },
    [props.renderConfig]
  );

  function updateSelections(nextSelections: SelectionState): void {
    setSelections(nextSelections);
    void rerender(nextSelections);
  }

  useEffect(() => {
    void rerender(props.initialSelections);
  }, [props.initialSelections, rerender]);

  const pricingSummary = useMemo(() => {
    let selectedItems = 0;
    let quantityTotal = 0;

    for (const group of sortedGroups) {
      const value = selections[group.key];
      if (group.selectionMode === "single" && typeof value === "string" && value.length > 0) {
        selectedItems += 1;
      } else if (group.selectionMode === "multi" && Array.isArray(value)) {
        selectedItems += value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0).length;
      } else if (group.selectionMode === "boolean" && value === true) {
        selectedItems += 1;
      } else if (group.selectionMode === "quantity" && typeof value === "number" && Number.isFinite(value)) {
        quantityTotal += Math.max(0, value);
      }
    }

    return {
      selectedItems,
      quantityTotal
    };
  }, [selections, sortedGroups]);

  const pricingResult = useMemo(
    () => computePricing(props.pricingBundle, selections),
    [props.pricingBundle, selections]
  );
  const allWarnings = useMemo(() => [...warnings, ...pricingResult.warnings], [warnings, pricingResult.warnings]);
  const activeTotal = pricingMode === "dealer" ? pricingResult.totals.dealer : pricingResult.totals.msrp;
  const selectedPricingLineItems = useMemo(
    () => pricingResult.lineItems.filter((line) => line.source === "selection"),
    [pricingResult.lineItems]
  );
  const includedPricingLineItems = useMemo(
    () => pricingResult.lineItems.filter((line) => line.source === "included"),
    [pricingResult.lineItems]
  );

  return (
    <section className="grid grid-cols-1 gap-6 lg:grid-cols-12">
      <div className="lg:col-span-7 lg:sticky lg:top-6 lg:self-start">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <header className="border-b border-slate-200 bg-slate-50/70 px-5 py-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Model / Version</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">{props.modelLabel}</h2>
            <p className="text-xs text-slate-500">{props.modelVersionId}</p>
          </header>
          <div className="p-5">
            <div className="relative aspect-[16/10] overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
              {dataUrl ? (
                <img
                  src={dataUrl}
                  alt="Composite preview"
                  className={`h-full w-full object-contain transition-opacity duration-200 ${isRendering ? "opacity-60" : "opacity-100"}`}
                />
              ) : !error ? (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-600">
                  No render view is configured for this model version.
                </div>
              ) : null}
              {(isRendering || !dataUrl) && !error ? (
                <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-slate-200/30 via-white/60 to-slate-200/30" aria-hidden />
              ) : null}
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2">
              <button
                type="button"
                disabled
                className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-500"
              >
                Thumbnails
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="lg:col-span-5">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:flex lg:h-[calc(100vh-3rem)] lg:flex-col">
          <header className="border-b border-slate-200 bg-white/90 px-5 py-4 backdrop-blur">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Build Your Boat</p>
            <h2 className="text-lg font-semibold text-slate-900">Options</h2>
            <nav className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Configuration steps">
              {stepTree.map((step, index) => {
                const isActive = step.id === activeStepId;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => {
                      setActiveStepId(step.id);
                      const firstSectionId = step.sections[0]?.id;
                      const target = firstSectionId ? sectionRefs.current[firstSectionId] : null;
                      if (target) {
                        target.scrollIntoView({ block: "start", behavior: "smooth" });
                      }
                    }}
                    className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                      isActive
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-900"
                    }`}
                  >
                    {index + 1}. {step.title}
                  </button>
                );
              })}
            </nav>
          </header>

          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 pb-44 lg:pb-56">
            {stepTree.map((step) => (
              <section key={step.id} className="space-y-4" aria-label={step.title}>
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{step.flowTitle}</p>
                  <h3 className="text-base font-semibold text-slate-900">{step.title}</h3>
                </div>

                {step.sections.map((section) => (
                  <div
                    key={section.id}
                    ref={(element) => {
                      sectionRefs.current[section.id] = element;
                    }}
                    className="space-y-3 rounded-xl border border-slate-200 p-4"
                  >
                    <h4 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-600">{section.title}</h4>

                    {section.groups.map((group) => {
                      const currentValue = selections[group.key];

                      if (group.selectionMode === "single") {
                        return (
                          <fieldset key={group.id} className="space-y-2">
                            <legend className="text-sm font-medium text-slate-900">{group.title}</legend>
                            {group.helpText ? <p className="text-xs text-slate-500">{group.helpText}</p> : null}
                            <div className="grid gap-2">
                              {group.options.map((option) => {
                                const checked = asString(currentValue) === option.versionItemId;
                                return (
                                  <label
                                    key={option.id}
                                    className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm transition ${
                                      checked
                                        ? "border-slate-900 bg-slate-900 text-white"
                                        : "border-slate-300 bg-white text-slate-800 hover:border-slate-500"
                                    }`}
                                  >
                                    <span>{option.label}</span>
                                    <input
                                      type="radio"
                                      className="h-4 w-4 accent-sky-500"
                                      name={group.key}
                                      checked={checked}
                                      onChange={() => {
                                        updateSelections({
                                          ...selections,
                                          [group.key]: option.versionItemId
                                        });
                                      }}
                                    />
                                  </label>
                                );
                              })}
                            </div>
                          </fieldset>
                        );
                      }

                      if (group.selectionMode === "boolean") {
                        const checked = asBoolean(currentValue);
                        return (
                          <div key={group.id} className="rounded-lg border border-slate-300 px-3 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-medium text-slate-900">{group.title}</p>
                                {group.helpText ? <p className="text-xs text-slate-500">{group.helpText}</p> : null}
                              </div>
                              <button
                                type="button"
                                role="switch"
                                aria-checked={checked}
                                onClick={() => {
                                  updateSelections({
                                    ...selections,
                                    [group.key]: !checked
                                  });
                                }}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                                  checked ? "bg-slate-900" : "bg-slate-300"
                                }`}
                              >
                                <span
                                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                                    checked ? "translate-x-5" : "translate-x-1"
                                  }`}
                                />
                              </button>
                            </div>
                          </div>
                        );
                      }

                      if (group.selectionMode === "multi") {
                        const selected = new Set(asStringArray(currentValue));
                        return (
                          <fieldset key={group.id} className="space-y-2">
                            <legend className="text-sm font-medium text-slate-900">
                              {group.title}
                              {group.minSelect !== null || group.maxSelect !== null ? (
                                <span className="ml-2 text-xs font-normal text-slate-500">
                                  ({group.minSelect ?? 0}-{group.maxSelect ?? "any"})
                                </span>
                              ) : null}
                            </legend>
                            {group.helpText ? <p className="text-xs text-slate-500">{group.helpText}</p> : null}
                            <div className="space-y-2">
                              {group.options.map((option) => {
                                const checked = selected.has(option.versionItemId);
                                return (
                                  <label
                                    key={option.id}
                                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                                      checked
                                        ? "border-sky-400 bg-sky-50 text-sky-900"
                                        : "border-slate-300 bg-white text-slate-800 hover:border-slate-500"
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      className="h-4 w-4 rounded border-slate-300 accent-sky-500"
                                      checked={checked}
                                      onChange={(event) => {
                                        const nextSet = new Set(selected);
                                        if (event.target.checked) {
                                          nextSet.add(option.versionItemId);
                                        } else {
                                          nextSet.delete(option.versionItemId);
                                        }
                                        updateSelections({
                                          ...selections,
                                          [group.key]: Array.from(nextSet)
                                        });
                                      }}
                                    />
                                    {option.label}
                                  </label>
                                );
                              })}
                            </div>
                          </fieldset>
                        );
                      }

                      const quantity = asNumber(currentValue);
                      const min = group.minSelect ?? 0;
                      const max = group.maxSelect ?? 999;
                      const canDecrease = quantity > min;
                      const canIncrease = quantity < max;
                      return (
                        <div key={group.id} className="rounded-lg border border-slate-300 px-3 py-3">
                          <p className="text-sm font-medium text-slate-900">{group.title}</p>
                          {group.helpText ? <p className="text-xs text-slate-500">{group.helpText}</p> : null}
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              type="button"
                              disabled={!canDecrease}
                              className="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                              onClick={() => {
                                updateSelections({
                                  ...selections,
                                  [group.key]: clamp(quantity - 1, min, max)
                                });
                              }}
                            >
                              -
                            </button>
                            <input
                              type="number"
                              min={min}
                              max={max}
                              className="w-20 rounded-md border border-slate-300 px-2 py-1 text-center text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                              value={quantity}
                              onChange={(event) => {
                                const parsedValue = Number(event.target.value);
                                updateSelections({
                                  ...selections,
                                  [group.key]: clamp(Number.isFinite(parsedValue) ? parsedValue : min, min, max)
                                });
                              }}
                            />
                            <button
                              type="button"
                              disabled={!canIncrease}
                              className="rounded-md border border-slate-300 px-3 py-1 text-sm font-medium text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                              onClick={() => {
                                updateSelections({
                                  ...selections,
                                  [group.key]: clamp(quantity + 1, min, max)
                                });
                              }}
                            >
                              +
                            </button>
                            <span className="text-xs text-slate-500">
                              min {min}, max {max}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </section>
            ))}

            <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">Diagnostics</summary>
              <div className="mt-2 space-y-2 text-xs text-slate-700">
                {error ? (
                  <p className="rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-rose-900">Render error: {error}</p>
                ) : null}
                {allWarnings.length > 0 ? (
                  <ul className="list-inside list-disc rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-900">
                    {allWarnings.map((warning, index) => (
                      <li key={`${index}-${warning}`}>{warning}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No renderer warnings.</p>
                )}
                <p>
                  <strong>modelVersionId:</strong> {props.modelVersionId}
                </p>
                <p>
                  <strong>groups:</strong> {sortedGroups.length}
                </p>
                {props.showCopyModelVersionIdButton ? (
                  <button
                    type="button"
                    className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                    onClick={() => {
                      void navigator.clipboard.writeText(props.modelVersionId);
                    }}
                  >
                    Copy MODEL_VERSION_ID
                  </button>
                ) : null}
                <pre className="overflow-x-auto rounded-md bg-slate-950 p-2 text-[11px] text-slate-100">
                  {JSON.stringify(colorByAreaKey, null, 2)}
                </pre>
              </div>
            </details>
          </div>

          <div className="sticky bottom-0 z-20 hidden lg:block">
            <SummaryBar
              pricingMode={pricingMode}
              onPricingModeChange={setPricingMode}
              selectedItems={pricingSummary.selectedItems}
              quantityTotal={pricingSummary.quantityTotal}
              isExpanded={isSummaryExpanded}
              onToggleExpanded={() => {
                setIsSummaryExpanded((previous) => !previous);
              }}
              expandedPanelId="desktop-summary-details"
              total={activeTotal}
              msrpTotal={pricingResult.totals.msrp}
              dealerTotal={pricingResult.totals.dealer}
              selectedLineItems={selectedPricingLineItems}
              includedLineItems={includedPricingLineItems}
              warnings={allWarnings}
            />
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-3 lg:hidden">
        <SummaryBar
          pricingMode={pricingMode}
          onPricingModeChange={setPricingMode}
          selectedItems={pricingSummary.selectedItems}
          quantityTotal={pricingSummary.quantityTotal}
          isExpanded={isSummaryExpanded}
          onToggleExpanded={() => {
            setIsSummaryExpanded((previous) => !previous);
          }}
          expandedPanelId="mobile-summary-details"
          total={activeTotal}
          msrpTotal={pricingResult.totals.msrp}
          dealerTotal={pricingResult.totals.dealer}
          selectedLineItems={selectedPricingLineItems}
          includedLineItems={includedPricingLineItems}
          warnings={allWarnings}
        />
      </div>
    </section>
  );
}
