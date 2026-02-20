"use client";

import { buildColorByAreaKey, computePricing, type PricingLineItem, type SelectionState } from "@ubb/engine";
import { useEffect, useMemo, useRef, useState } from "react";
import { renderMaskTintPreviewDataUrl } from "../lib/client/mask-tint-renderer";
import type {
  ConfigFlowStepView,
  ConfigSelectionGroupView,
  ConfiguratorClientData
} from "../lib/configurator-shared";

interface ConfiguratorClientProps {
  showCopyModelVersionIdButton: boolean;
  data: ConfiguratorClientData;
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

function formatMoney(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value);
}

function nextMultiValue(args: {
  group: ConfigSelectionGroupView;
  currentValue: SelectionState[string];
  optionVersionItemId: string;
  checked: boolean;
}): string[] {
  const selected = new Set(asStringArray(args.currentValue));
  if (args.checked) {
    selected.add(args.optionVersionItemId);
  } else {
    selected.delete(args.optionVersionItemId);
  }

  const next: string[] = [];
  for (const option of args.group.options) {
    if (selected.has(option.versionItemId)) {
      next.push(option.versionItemId);
    }
  }
  return next;
}

function findStepIndex(steps: ConfigFlowStepView[], stepId: string | null): number {
  if (!stepId) {
    return 0;
  }
  const index = steps.findIndex((step) => step.id === stepId);
  return index >= 0 ? index : 0;
}

export function ConfiguratorClient(props: ConfiguratorClientProps): JSX.Element {
  const [selections, setSelections] = useState<SelectionState>(props.data.selections);
  const [activeStepId, setActiveStepId] = useState<string | null>(props.data.steps[0]?.id ?? null);
  const [activeRenderViewId, setActiveRenderViewId] = useState<string | null>(props.data.initialRenderViewId);
  const [audience, setAudience] = useState<"public" | "dealer">("public");
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  const requestIdRef = useRef(0);

  const steps = useMemo(() => [...props.data.steps], [props.data.steps]);
  const activeStepIndex = useMemo(() => findStepIndex(steps, activeStepId), [steps, activeStepId]);
  const activeStep = steps[activeStepIndex] ?? null;

  const activeRenderView = useMemo(
    () => props.data.renderViews.find((view) => view.id === activeRenderViewId) ?? props.data.renderViews[0] ?? null,
    [props.data.renderViews, activeRenderViewId]
  );

  const assetUrlById = useMemo(() => {
    const map = new Map<string, string>();
    for (const view of props.data.renderViews) {
      for (const layer of view.layers) {
        map.set(layer.assetId, layer.assetUrl);
        if (layer.maskAssetId && layer.maskAssetUrl) {
          map.set(layer.maskAssetId, layer.maskAssetUrl);
        }
      }
    }
    return map;
  }, [props.data.renderViews]);

  const colorByAreaKey = useMemo(() => {
    const warnings: string[] = [];
    const result = buildColorByAreaKey(props.data.bundle, selections, (message: unknown) => warnings.push(String(message)));
    return result;
  }, [props.data.bundle, selections]);

  const pricing = useMemo(() => computePricing(props.data.bundle, selections, { audience }), [props.data.bundle, selections, audience]);

  useEffect(() => {
    if (!steps.some((step) => step.id === activeStepId)) {
      setActiveStepId(steps[0]?.id ?? null);
    }
  }, [steps, activeStepId]);

  useEffect(() => {
    if (!activeRenderView) {
      setDataUrl(null);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setIsRendering(true);
    setRenderError(null);

    const assetUrlResolver = (assetId: string): string => assetUrlById.get(assetId) ?? "";

    void renderMaskTintPreviewDataUrl({
      renderView: activeRenderView,
      layers: activeRenderView.layers,
      colorByAreaKey,
      assetUrlResolver
    })
      .then((nextDataUrl) => {
        if (requestId !== requestIdRef.current) {
          return;
        }
        setDataUrl(nextDataUrl);
      })
      .catch((error: unknown) => {
        if (requestId !== requestIdRef.current) {
          return;
        }
        const message = error instanceof Error ? error.message : "Failed to render preview";
        setRenderError(message);
      })
      .finally(() => {
        if (requestId === requestIdRef.current) {
          setIsRendering(false);
        }
      });
  }, [activeRenderView, colorByAreaKey, assetUrlById]);

  function updateSelections(nextSelections: SelectionState): void {
    setSelections(nextSelections);
  }

  function nextStep(delta: -1 | 1): void {
    const nextIndex = activeStepIndex + delta;
    if (nextIndex < 0 || nextIndex >= steps.length) {
      return;
    }
    setActiveStepId(steps[nextIndex].id);
  }

  const selectedItems = pricing.lineItems.filter((item: PricingLineItem) => item.source === "selection");
  const includedItems = pricing.lineItems.filter((item: PricingLineItem) => item.source === "included");

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
      <div className="grid gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex flex-wrap gap-2">
            {steps.map((step, index) => (
              <button
                key={step.id}
                type="button"
                className={`rounded-md border px-3 py-1.5 text-sm ${
                  index === activeStepIndex
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
                onClick={() => setActiveStepId(step.id)}
              >
                {index + 1}. {step.title}
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 disabled:opacity-50"
              onClick={() => nextStep(-1)}
              disabled={activeStepIndex <= 0}
            >
              Back
            </button>
            <button
              type="button"
              className="rounded-md bg-slate-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
              onClick={() => nextStep(1)}
              disabled={activeStepIndex >= steps.length - 1}
            >
              Next
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          {activeStep ? (
            <div className="grid gap-4">
              {activeStep.helpText ? <p className="text-sm text-slate-600">{activeStep.helpText}</p> : null}
              {activeStep.sections.map((section) => (
                <section key={section.id} className="grid gap-3 rounded-md border border-slate-200 p-3">
                  <h3 className="text-sm font-semibold text-slate-900">{section.title}</h3>
                  {section.groups.map((group) => {
                    const currentValue = selections[group.key];

                    if (group.selectionMode === "single") {
                      return (
                        <label key={group.id} className="grid gap-1.5">
                          <span className="text-sm font-medium text-slate-800">{group.title}</span>
                          <select
                            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                            value={asString(currentValue)}
                            onChange={(event) => {
                              updateSelections({
                                ...selections,
                                [group.key]: event.target.value
                              });
                            }}
                          >
                            <option value="">Select</option>
                            {group.options.map((option) => (
                              <option key={option.id} value={option.versionItemId}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          {group.helpText ? <p className="text-xs text-slate-500">{group.helpText}</p> : null}
                        </label>
                      );
                    }

                    if (group.selectionMode === "boolean") {
                      return (
                        <label key={group.id} className="flex items-center gap-2 text-sm text-slate-800">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300"
                            checked={asBoolean(currentValue)}
                            onChange={(event) => {
                              updateSelections({
                                ...selections,
                                [group.key]: event.target.checked
                              });
                            }}
                          />
                          <span>{group.title}</span>
                        </label>
                      );
                    }

                    if (group.selectionMode === "multi") {
                      const selected = new Set(asStringArray(currentValue));
                      return (
                        <fieldset key={group.id} className="rounded-md border border-slate-200 p-3">
                          <legend className="px-1 text-sm font-medium text-slate-800">{group.title}</legend>
                          {group.options.map((option) => (
                            <label key={option.id} className="mt-1 block text-sm text-slate-700">
                              <input
                                type="checkbox"
                                className="mr-2 h-4 w-4 rounded border-slate-300"
                                checked={selected.has(option.versionItemId)}
                                onChange={(event) => {
                                  updateSelections({
                                    ...selections,
                                    [group.key]: nextMultiValue({
                                      group,
                                      currentValue,
                                      optionVersionItemId: option.versionItemId,
                                      checked: event.target.checked
                                    })
                                  });
                                }}
                              />
                              {option.label}
                            </label>
                          ))}
                        </fieldset>
                      );
                    }

                    return (
                      <label key={group.id} className="grid gap-1.5">
                        <span className="text-sm font-medium text-slate-800">{group.title}</span>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          className="w-28 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                          value={asNumber(currentValue)}
                          onChange={(event) => {
                            updateSelections({
                              ...selections,
                              [group.key]: Math.max(0, Math.floor(Number(event.target.value) || 0))
                            });
                          }}
                        />
                      </label>
                    );
                  })}
                </section>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-700">No flow steps are configured for this model version.</p>
          )}
        </div>
      </div>

      <aside className="grid gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          {dataUrl ? (
            <img src={dataUrl} alt="Composite preview" className="w-full rounded border border-slate-200" />
          ) : (
            <p className="text-sm text-slate-700">No render view is configured for this model version.</p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {props.data.renderViews.map((view) => (
              <button
                key={view.id}
                type="button"
                className={`rounded-md border px-2 py-1 text-xs ${
                  activeRenderView?.id === view.id
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700"
                }`}
                onClick={() => setActiveRenderViewId(view.id)}
              >
                {view.title}
              </button>
            ))}
          </div>

          {isRendering ? <p className="mt-2 text-xs text-slate-500">Rendering preview...</p> : null}
          {renderError ? (
            <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-900">{renderError}</p>
          ) : null}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">Pricing</h2>
            <div className="inline-flex rounded-md border border-slate-300 p-0.5 text-xs">
              <button
                type="button"
                className={`rounded px-2 py-1 ${audience === "public" ? "bg-slate-900 text-white" : "text-slate-600"}`}
                onClick={() => setAudience("public")}
              >
                Public
              </button>
              <button
                type="button"
                className={`rounded px-2 py-1 ${audience === "dealer" ? "bg-slate-900 text-white" : "text-slate-600"}`}
                onClick={() => setAudience("dealer")}
              >
                Dealer
              </button>
            </div>
          </div>

          <div className="mt-3 grid gap-1">
            <p className="text-sm text-slate-700">
              MSRP: <strong>{formatMoney(pricing.totals.msrp)}</strong>
            </p>
            <p className="text-sm text-slate-700">
              Dealer: <strong>{formatMoney(pricing.totals.dealer)}</strong>
            </p>
          </div>

          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected Items</h3>
            <ul className="mt-2 grid gap-1">
              {selectedItems.map((item: PricingLineItem) => (
                <li key={item.key} className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700">
                  <div className="flex items-center justify-between gap-2">
                    <span>{item.label}</span>
                    <span>x{item.qty}</span>
                  </div>
                </li>
              ))}
              {selectedItems.length === 0 ? <li className="text-xs text-slate-500">No selected add-ons.</li> : null}
            </ul>
          </div>

          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Included Items</h3>
            <ul className="mt-2 grid gap-1">
              {includedItems.map((item: PricingLineItem) => (
                <li key={item.key} className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
                  {item.label}
                </li>
              ))}
              {includedItems.length === 0 ? <li className="text-xs text-slate-500">No included items configured.</li> : null}
            </ul>
          </div>

          {pricing.warnings.length > 0 ? (
            <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
              {pricing.warnings[0]}
            </div>
          ) : null}
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 text-xs text-slate-700">
          <p>
            <strong>modelVersionId:</strong> {props.data.modelVersionId}
          </p>
          {props.showCopyModelVersionIdButton ? (
            <button
              type="button"
              className="mt-2 rounded border border-slate-300 px-2 py-1"
              onClick={() => {
                void navigator.clipboard.writeText(props.data.modelVersionId);
              }}
            >
              Copy MODEL_VERSION_ID
            </button>
          ) : null}
        </div>
      </aside>
    </section>
  );
}
