"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { computePricing, type PricingLineItem } from "@ubb/engine/pricing";
import { renderMaskTintPreview } from "../lib/client/mask-tint-renderer";
import type {
  ClientPricingBundle,
  ClientRenderConfig,
  ConfigSelectionGroupView,
  SelectionState
} from "../lib/configurator-shared";
import { sanitizeSelectionState } from "../lib/configurator-shared";

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
type ViewMode = "paged" | "all";

const DEFAULT_VIEW_MODE: ViewMode = "paged";
const ENCODED_SELECTIONS_VERSION = "v1";

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

interface PricePillInfo {
  text: string;
  tone: "included" | "positive" | "negative";
}

interface PersistedConfiguratorState {
  modelVersionId: string;
  selections: SelectionState;
  activeStepId: string | null;
  priceBook: PricingMode;
  summaryExpanded: boolean;
  viewMode: ViewMode;
}

interface UrlState {
  mv: string | null;
  stepId: string | null;
  priceBook: PricingMode | null;
  viewMode: ViewMode | null;
  selections: SelectionState | null;
}

interface CreateQuoteResponse {
  id: string;
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

function toUnitPrice(line: PricingLineItem, mode: PricingMode): number {
  if (line.isIncluded) {
    return 0;
  }
  return mode === "dealer" ? line.dealer ?? 0 : line.msrp ?? 0;
}

function toExtendedPrice(line: PricingLineItem, mode: PricingMode): number {
  return toUnitPrice(line, mode) * line.qty;
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

function canonicalizeSelectionState(input: SelectionState): SelectionState {
  const sortedEntries = Object.entries(sanitizeSelectionState(input)).sort(([a], [b]) => a.localeCompare(b));
  const output: SelectionState = {};
  for (const [key, value] of sortedEntries) {
    if (Array.isArray(value)) {
      output[key] = [...value].sort((a, b) => a.localeCompare(b));
    } else {
      output[key] = value;
    }
  }
  return output;
}

function base64UrlEncode(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = normalized.length % 4 === 0 ? "" : "=".repeat(4 - (normalized.length % 4));
  return atob(`${normalized}${pad}`);
}

function encodeSelectionsForUrl(selections: SelectionState): string {
  const canonical = canonicalizeSelectionState(selections);
  const json = JSON.stringify(canonical);
  const uriEncoded = encodeURIComponent(json);
  return `${ENCODED_SELECTIONS_VERSION}:${base64UrlEncode(uriEncoded)}`;
}

function decodeSelectionsFromUrl(encoded: string | null): SelectionState | null {
  if (!encoded) {
    return null;
  }
  const [version, payload] = encoded.split(":", 2);
  if (version !== ENCODED_SELECTIONS_VERSION || !payload) {
    return null;
  }

  try {
    const uriEncoded = base64UrlDecode(payload);
    const json = decodeURIComponent(uriEncoded);
    const parsed = JSON.parse(json);
    return sanitizeSelectionState(parsed);
  } catch {
    return null;
  }
}

function parsePriceBook(value: string | null): PricingMode | null {
  return value === "msrp" || value === "dealer" ? value : null;
}

function parseViewMode(value: string | null): ViewMode | null {
  return value === "paged" || value === "all" ? value : null;
}

function parseUrlState(search: string): UrlState {
  const params = new URLSearchParams(search);
  return {
    mv: params.get("mv"),
    stepId: params.get("step"),
    priceBook: parsePriceBook(params.get("book")),
    viewMode: parseViewMode(params.get("mode")),
    selections: decodeSelectionsFromUrl(params.get("s"))
  };
}

function buildPersistedState(input: {
  modelVersionId: string;
  selections: SelectionState;
  activeStepId: string | null;
  priceBook: PricingMode;
  summaryExpanded: boolean;
  viewMode: ViewMode;
}): PersistedConfiguratorState {
  return {
    modelVersionId: input.modelVersionId,
    selections: canonicalizeSelectionState(input.selections),
    activeStepId: input.activeStepId,
    priceBook: input.priceBook,
    summaryExpanded: input.summaryExpanded,
    viewMode: input.viewMode
  };
}

function readPersistedState(raw: string | null): PersistedConfiguratorState | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedConfiguratorState>;
    if (typeof parsed !== "object" || !parsed) {
      return null;
    }
    if (typeof parsed.modelVersionId !== "string") {
      return null;
    }
    if (typeof parsed.activeStepId !== "string" && parsed.activeStepId !== null) {
      return null;
    }
    if (parsed.priceBook !== "msrp" && parsed.priceBook !== "dealer") {
      return null;
    }
    if (parsed.viewMode !== "paged" && parsed.viewMode !== "all") {
      return null;
    }
    if (typeof parsed.summaryExpanded !== "boolean") {
      return null;
    }

    return {
      modelVersionId: parsed.modelVersionId,
      selections: sanitizeSelectionState(parsed.selections),
      activeStepId: parsed.activeStepId,
      priceBook: parsed.priceBook,
      summaryExpanded: parsed.summaryExpanded,
      viewMode: parsed.viewMode
    };
  } catch {
    return null;
  }
}

function PricePill(props: { info: PricePillInfo; each?: boolean; muted?: boolean }): JSX.Element {
  const toneClass =
    props.info.tone === "included"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : props.info.tone === "negative"
        ? "border-sky-200 bg-sky-50 text-sky-700"
        : "border-slate-200 bg-slate-100 text-slate-700";

  return (
    <span
      className={`ml-3 inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums ${toneClass} ${
        props.muted ? "opacity-90" : ""
      }`}
    >
      {props.info.text}
      {props.each ? <span className="ml-1 text-[10px] uppercase tracking-[0.08em]">ea</span> : null}
    </span>
  );
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
  onCreateQuote: () => Promise<void>;
  isCreatingQuote: boolean;
  createQuoteError: string | null;
}): JSX.Element {
  const activePriceLabel = props.pricingMode === "dealer" ? "Dealer" : "MSRP";

  return (
    <div className="rounded-t-2xl border border-slate-200 bg-white/95 p-4 shadow-[0_-8px_32px_rgba(15,23,42,0.12)] backdrop-blur">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Total</p>
          <p className="text-xl font-semibold tabular-nums text-slate-900">{formatCurrency(props.total)}</p>
          <p className="text-xs text-slate-500">{activePriceLabel}</p>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs">
          <button
            type="button"
            onClick={() => {
              props.onPricingModeChange("msrp");
            }}
            className={`rounded-md px-2.5 py-1.5 font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
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
            className={`rounded-md px-2.5 py-1.5 font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
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
        disabled={props.isCreatingQuote}
        className="mt-3 w-full rounded-lg border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
        onClick={() => {
          void props.onCreateQuote();
        }}
      >
        {props.isCreatingQuote ? "Creating Quote..." : "Create Quote"}
      </button>

      {props.createQuoteError ? (
        <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900">{props.createQuoteError}</p>
      ) : null}

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
        className={`overflow-hidden transition-[max-height,opacity] duration-200 ${
          props.isExpanded ? "mt-3 max-h-[32rem] opacity-100" : "max-h-0 opacity-0"
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
                    </div>
                    <div className="text-right text-xs text-slate-600 tabular-nums">
                      <p>{formatCurrency(toExtendedPrice(line, props.pricingMode))}</p>
                      <p>Unit {formatCurrency(toUnitPrice(line, props.pricingMode))}</p>
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
                    <p className="text-xs text-slate-600 tabular-nums">{formatCurrency(0)}</p>
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

          <div className="rounded-md border border-slate-200 bg-white p-2 tabular-nums">
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
  const router = useRouter();
  const [selections, setSelections] = useState<SelectionState>(props.initialSelections);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [colorByAreaKey, setColorByAreaKey] = useState<Record<string, string>>(props.initialColorByAreaKey);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pricingMode, setPricingMode] = useState<PricingMode>("msrp");
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(DEFAULT_VIEW_MODE);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [urlModelMismatch, setUrlModelMismatch] = useState<string | null>(null);
  const [isCreatingQuote, setIsCreatingQuote] = useState(false);
  const [createQuoteError, setCreateQuoteError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const stepAnchorRef = useRef<Record<string, HTMLElement | null>>({});
  const scrollTopByStepIdRef = useRef<Record<string, number>>({});

  const storageKey = useMemo(() => `ubb:configurator:${props.modelVersionId}:state`, [props.modelVersionId]);

  const sortedGroups = useMemo(
    () =>
      [...props.selectionGroups].sort(
        (a, b) =>
          (a.sort ?? Number.MAX_SAFE_INTEGER) - (b.sort ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id)
      ),
    [props.selectionGroups]
  );
  const stepTree = useMemo(() => buildStepTree(sortedGroups), [sortedGroups]);

  useEffect(() => {
    if (!activeStepId && stepTree.length > 0) {
      setActiveStepId(stepTree[0].id);
      return;
    }
    if (activeStepId && stepTree.every((step) => step.id !== activeStepId)) {
      setActiveStepId(stepTree[0]?.id ?? null);
    }
  }, [activeStepId, stepTree]);

  const activeStepIndex = useMemo(
    () => stepTree.findIndex((step) => step.id === activeStepId),
    [activeStepId, stepTree]
  );
  const activeStep = useMemo(
    () => stepTree.find((step) => step.id === activeStepId) ?? null,
    [activeStepId, stepTree]
  );
  const renderedSteps = useMemo(() => {
    if (viewMode === "all") {
      return stepTree;
    }
    return activeStep ? [activeStep] : [];
  }, [activeStep, stepTree, viewMode]);

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
    if (isHydrated) {
      return;
    }
    if (typeof window === "undefined") {
      return;
    }

    const firstStepId = stepTree[0]?.id ?? null;
    const urlState = parseUrlState(window.location.search);
    if (urlState.mv && urlState.mv !== props.modelVersionId) {
      setUrlModelMismatch(urlState.mv);
      setActiveStepId(firstStepId);
      setIsHydrated(true);
      void rerender(props.initialSelections);
      return;
    }

    let nextSelections: SelectionState = props.initialSelections;
    let nextStepId: string | null = firstStepId;
    let nextBook: PricingMode = "msrp";
    let nextSummaryExpanded = false;
    let nextViewMode: ViewMode = DEFAULT_VIEW_MODE;

    const persisted = readPersistedState(window.localStorage.getItem(storageKey));
    if (persisted && persisted.modelVersionId === props.modelVersionId) {
      nextSelections = persisted.selections;
      nextStepId = persisted.activeStepId;
      nextBook = persisted.priceBook;
      nextSummaryExpanded = persisted.summaryExpanded;
      nextViewMode = persisted.viewMode;
    }

    if (urlState.selections) {
      nextSelections = urlState.selections;
    }
    if (urlState.stepId) {
      nextStepId = urlState.stepId;
    }
    if (urlState.priceBook) {
      nextBook = urlState.priceBook;
    }
    if (urlState.viewMode) {
      nextViewMode = urlState.viewMode;
    }

    if (!nextStepId || stepTree.every((step) => step.id !== nextStepId)) {
      nextStepId = firstStepId;
    }

    setSelections(nextSelections);
    setActiveStepId(nextStepId);
    setPricingMode(nextBook);
    setIsSummaryExpanded(nextSummaryExpanded);
    setViewMode(nextViewMode);
    setIsHydrated(true);
    void rerender(nextSelections);
  }, [isHydrated, props.initialSelections, props.modelVersionId, rerender, stepTree, storageKey]);

  useEffect(() => {
    if (!isHydrated || urlModelMismatch || typeof window === "undefined") {
      return;
    }

    const payload = buildPersistedState({
      modelVersionId: props.modelVersionId,
      selections,
      activeStepId,
      priceBook: pricingMode,
      summaryExpanded: isSummaryExpanded,
      viewMode
    });
    window.localStorage.setItem(storageKey, JSON.stringify(payload));
  }, [
    activeStepId,
    isHydrated,
    isSummaryExpanded,
    pricingMode,
    props.modelVersionId,
    selections,
    storageKey,
    urlModelMismatch,
    viewMode
  ]);

  useEffect(() => {
    if (!isHydrated || urlModelMismatch || typeof window === "undefined") {
      return;
    }
    const currentUrl = new URL(window.location.href);
    const params = new URLSearchParams(currentUrl.search);
    const reserved = new Set(["mv", "step", "book", "mode", "s"]);
    for (const key of reserved) {
      params.delete(key);
    }

    const additions: Array<[string, string]> = [
      ["mv", props.modelVersionId],
      ["book", pricingMode],
      ["mode", viewMode],
      ["s", encodeSelectionsForUrl(selections)]
    ];
    if (activeStepId) {
      additions.splice(1, 0, ["step", activeStepId]);
    }
    for (const [key, value] of additions) {
      params.append(key, value);
    }

    const remaining = Array.from(params.entries()).filter(([key]) => !["mv", "step", "book", "mode", "s"].includes(key));
    const queryParts = additions.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
    remaining
      .sort((a, b) => (a[0] === b[0] ? a[1].localeCompare(b[1]) : a[0].localeCompare(b[0])))
      .forEach(([key, value]) => {
        queryParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
      });

    const nextSearch = queryParts.length > 0 ? `?${queryParts.join("&")}` : "";
    const nextUrl = `${currentUrl.pathname}${nextSearch}${currentUrl.hash}`;
    const currentComparable = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
    if (nextUrl !== currentComparable) {
      window.history.replaceState(null, "", nextUrl);
    }
  }, [activeStepId, isHydrated, pricingMode, props.modelVersionId, selections, urlModelMismatch, viewMode]);

  const goToStep = useCallback(
    (nextStepId: string) => {
      const currentStepId = activeStepId;
      const container = scrollContainerRef.current;
      if (currentStepId && container) {
        scrollTopByStepIdRef.current[currentStepId] = container.scrollTop;
      }
      setActiveStepId(nextStepId);
    },
    [activeStepId]
  );

  useEffect(() => {
    if (viewMode !== "paged" || !activeStepId) {
      return;
    }
    const container = scrollContainerRef.current;
    if (!container) {
      return;
    }
    container.scrollTop = scrollTopByStepIdRef.current[activeStepId] ?? 0;
  }, [activeStepId, viewMode]);

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

  const pricingResult = useMemo(() => computePricing(props.pricingBundle, selections), [props.pricingBundle, selections]);
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

  const groupOptionByGroupAndVersionItem = useMemo(() => {
    const map = new Map<string, ClientPricingBundle["group_options"][number]>();
    for (const option of props.pricingBundle.group_options) {
      map.set(`${option.selection_group}:${option.version_item}`, option);
    }
    return map;
  }, [props.pricingBundle.group_options]);

  const versionItemById = useMemo(
    () =>
      new Map(
        props.pricingBundle.version_items.map((versionItem): [string, ClientPricingBundle["version_items"][number]] => [
          versionItem.id,
          versionItem
        ])
      ),
    [props.pricingBundle.version_items]
  );

  const pricePillForOption = useCallback(
    (groupId: string, versionItemId: string): PricePillInfo => {
      const groupOption = groupOptionByGroupAndVersionItem.get(`${groupId}:${versionItemId}`);
      const versionItem = versionItemById.get(versionItemId);
      const unitRaw =
        pricingMode === "dealer"
          ? (groupOption?.override_dealer_price ?? versionItem?.dealer_price ?? 0)
          : (groupOption?.override_msrp ?? versionItem?.msrp ?? 0);
      const unitPrice = typeof unitRaw === "number" && Number.isFinite(unitRaw) ? unitRaw : 0;
      const isIncluded = versionItem?.is_included === true || unitPrice === 0;

      if (isIncluded) {
        return { text: "Included", tone: "included" };
      }
      if (unitPrice > 0) {
        return { text: `+${formatCurrency(unitPrice)}`, tone: "positive" };
      }
      return { text: `–${formatCurrency(Math.abs(unitPrice))}`, tone: "negative" };
    },
    [groupOptionByGroupAndVersionItem, pricingMode, versionItemById]
  );

  const stepProgress =
    stepTree.length > 0 && activeStepIndex >= 0 ? Math.round(((activeStepIndex + 1) / stepTree.length) * 100) : 0;

  const resetConfiguration = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.removeItem(storageKey);
    const firstStepId = stepTree[0]?.id ?? null;
    setSelections(props.initialSelections);
    setActiveStepId(firstStepId);
    setPricingMode("msrp");
    setIsSummaryExpanded(false);
    setViewMode(DEFAULT_VIEW_MODE);
    void rerender(props.initialSelections);
  }, [props.initialSelections, rerender, stepTree, storageKey]);

  const clearStateAndReload = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.removeItem(storageKey);
    const nextUrl = new URL(window.location.href);
    ["mv", "step", "book", "mode", "s"].forEach((key) => {
      nextUrl.searchParams.delete(key);
    });
    window.history.replaceState(null, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    window.location.reload();
  }, [storageKey]);

  const createQuote = useCallback(async (): Promise<void> => {
    if (typeof window === "undefined" || isCreatingQuote) {
      return;
    }

    setCreateQuoteError(null);
    setIsCreatingQuote(true);
    try {
      const resumeUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const response = await fetch("/api/quotes", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          modelVersionId: props.modelVersionId,
          modelLabel: props.modelLabel,
          priceBook: pricingMode,
          selections,
          encodedSelections: encodeSelectionsForUrl(selections),
          viewMode,
          stepId: activeStepId,
          resumeUrl
        })
      });

      const payload = (await response.json().catch(() => null)) as CreateQuoteResponse | { error?: string } | null;
      if (!response.ok || !payload || typeof payload !== "object" || !("id" in payload) || typeof payload.id !== "string") {
        const message =
          payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "Failed to create quote";
        throw new Error(message);
      }

      router.push(`/quotes/${payload.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to create quote";
      setCreateQuoteError(message);
    } finally {
      setIsCreatingQuote(false);
    }
  }, [
    activeStepId,
    isCreatingQuote,
    pricingMode,
    props.modelLabel,
    props.modelVersionId,
    router,
    selections,
    viewMode
  ]);

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
                  className={`h-full w-full object-contain transition-opacity duration-200 ${
                    isRendering ? "opacity-60" : "opacity-100"
                  }`}
                />
              ) : !error ? (
                <div className="flex h-full items-center justify-center px-6 text-center text-sm text-slate-600">
                  No render view is configured for this model version.
                </div>
              ) : null}
              {(isRendering || !dataUrl) && !error ? (
                <div
                  className="absolute inset-0 animate-pulse bg-gradient-to-r from-slate-200/30 via-white/60 to-slate-200/30"
                  aria-hidden
                />
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <div className="lg:col-span-5">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:flex lg:h-[calc(100vh-3rem)] lg:flex-col">
          <header className="border-b border-slate-200 bg-white/90 px-5 py-4 backdrop-blur">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Build Your Boat</p>
                <h2 className="text-lg font-semibold text-slate-900">Options</h2>
              </div>
              <p className="text-xs font-medium text-slate-500">
                {activeStepIndex + 1 > 0 ? `Step ${activeStepIndex + 1} of ${stepTree.length}` : `Steps ${stepTree.length}`}
              </p>
            </div>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={stepProgress}>
              <div className="h-full rounded-full bg-slate-900 transition-[width] duration-200" style={{ width: `${stepProgress}%` }} />
            </div>

            <nav className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Configuration steps">
              {stepTree.map((step, index) => {
                const isActive = step.id === activeStepId;
                return (
                  <button
                    key={step.id}
                    type="button"
                    onClick={() => {
                      goToStep(step.id);
                    }}
                    className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                      isActive
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:text-slate-900"
                    }`}
                    aria-current={isActive ? "step" : undefined}
                  >
                    {index + 1}. {step.title}
                  </button>
                );
              })}
            </nav>

            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                className={`rounded-md border px-2.5 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 ${
                  viewMode === "all"
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                }`}
                aria-pressed={viewMode === "all"}
                onClick={() => {
                  setViewMode((previous) => (previous === "all" ? "paged" : "all"));
                }}
              >
                All Steps
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
                onClick={resetConfiguration}
              >
                Reset Configuration
              </button>
            </div>

            {viewMode === "paged" ? (
              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={activeStepIndex <= 0}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => {
                    if (activeStepIndex <= 0) {
                      return;
                    }
                    const previousStep = stepTree[activeStepIndex - 1];
                    if (previousStep) {
                      goToStep(previousStep.id);
                    }
                  }}
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={activeStepIndex < 0 || activeStepIndex >= stepTree.length - 1}
                  className="rounded-lg border border-slate-900 bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => {
                    if (activeStepIndex < 0 || activeStepIndex >= stepTree.length - 1) {
                      return;
                    }
                    const nextStep = stepTree[activeStepIndex + 1];
                    if (nextStep) {
                      goToStep(nextStep.id);
                    }
                  }}
                >
                  Next
                </button>
              </div>
            ) : (
              <div className="mt-3 flex gap-2 overflow-x-auto">
                {stepTree.map((step, index) => (
                  <button
                    key={step.id}
                    type="button"
                    className="whitespace-nowrap rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50"
                    onClick={() => {
                      const target = stepAnchorRef.current[step.id];
                      if (target) {
                        target.scrollIntoView({ block: "start", behavior: "smooth" });
                      }
                    }}
                  >
                    Jump {index + 1}
                  </button>
                ))}
              </div>
            )}
          </header>

          <div
            ref={scrollContainerRef}
            onScroll={() => {
              if (viewMode !== "paged" || !activeStepId || !scrollContainerRef.current) {
                return;
              }
              scrollTopByStepIdRef.current[activeStepId] = scrollContainerRef.current.scrollTop;
            }}
            className="flex-1 space-y-5 overflow-y-auto px-5 py-4 pb-44 lg:pb-56"
          >
            {urlModelMismatch ? (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                <p className="font-semibold">This link targets a different model version.</p>
                <p className="mt-1 text-xs">
                  URL model: <code>{urlModelMismatch}</code>
                </p>
                <p className="text-xs">
                  Loaded model: <code>{props.modelVersionId}</code>
                </p>
                <button
                  type="button"
                  className="mt-3 rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
                  onClick={clearStateAndReload}
                >
                  Clear Stored State And Reload
                </button>
              </div>
            ) : null}

            {renderedSteps.map((step) => (
              <section
                key={step.id}
                id={`cfg-step-${step.id}`}
                ref={(element) => {
                  stepAnchorRef.current[step.id] = element;
                }}
                className="space-y-4"
                aria-label={step.title}
              >
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">{step.flowTitle}</p>
                  <h3 className="text-base font-semibold text-slate-900">{step.title}</h3>
                </div>

                {step.sections.map((section) => (
                  <div key={section.id} className="space-y-3 rounded-xl border border-slate-200 p-4">
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
                                const pill = pricePillForOption(group.id, option.versionItemId);
                                return (
                                  <label
                                    key={option.id}
                                    className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm transition ${
                                      checked
                                        ? "border-slate-900 bg-slate-900 text-white"
                                        : "border-slate-300 bg-white text-slate-800 hover:border-slate-500"
                                    }`}
                                  >
                                    <div className="flex min-w-0 items-center">
                                      <span className="truncate">{option.label}</span>
                                      <PricePill info={pill} />
                                    </div>
                                    <input
                                      type="radio"
                                      className="ml-3 h-4 w-4 accent-sky-500"
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
                        const booleanOptionId = group.options[0]?.versionItemId;
                        const pill = booleanOptionId ? pricePillForOption(group.id, booleanOptionId) : null;
                        return (
                          <div key={group.id} className="rounded-lg border border-slate-300 px-3 py-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-slate-900">{group.title}</p>
                                {group.helpText ? <p className="text-xs text-slate-500">{group.helpText}</p> : null}
                                {pill ? <PricePill info={pill} muted /> : null}
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
                                const pill = pricePillForOption(group.id, option.versionItemId);
                                return (
                                  <label
                                    key={option.id}
                                    className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition ${
                                      checked
                                        ? "border-sky-400 bg-sky-50 text-sky-900"
                                        : "border-slate-300 bg-white text-slate-800 hover:border-slate-500"
                                    }`}
                                  >
                                    <div className="flex min-w-0 items-center">
                                      <input
                                        type="checkbox"
                                        className="mr-2 h-4 w-4 rounded border-slate-300 accent-sky-500"
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
                                      <span className="truncate">{option.label}</span>
                                    </div>
                                    <PricePill info={pill} />
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
                      const quantityOptionId =
                        typeof currentValue === "string" && currentValue.length > 0
                          ? currentValue
                          : group.options[0]?.versionItemId;
                      const quantityPill = quantityOptionId ? pricePillForOption(group.id, quantityOptionId) : null;

                      return (
                        <div key={group.id} className="rounded-lg border border-slate-300 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-900">{group.title}</p>
                              {group.helpText ? <p className="text-xs text-slate-500">{group.helpText}</p> : null}
                            </div>
                            {quantityPill ? <PricePill info={quantityPill} each /> : null}
                          </div>
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
                              className="w-20 rounded-md border border-slate-300 px-2 py-1 text-center text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
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
              onCreateQuote={createQuote}
              isCreatingQuote={isCreatingQuote}
              createQuoteError={createQuoteError}
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
          onCreateQuote={createQuote}
          isCreatingQuote={isCreatingQuote}
          createQuoteError={createQuoteError}
        />
      </div>
    </section>
  );
}
