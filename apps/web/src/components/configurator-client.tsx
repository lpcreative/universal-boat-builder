"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ConfigSelectionGroupView, SelectionState } from "../lib/configurator-shared";
import { sanitizeSelectionState } from "../lib/configurator-shared";

interface ConfiguratorClientProps {
  modelVersionId: string;
  showCopyModelVersionIdButton: boolean;
  selectionGroups: ConfigSelectionGroupView[];
  initialSelections: SelectionState;
  initialDataUrl: string | null;
  initialColorByAreaKey: Record<string, string>;
  hasRenderView: boolean;
}

interface RenderResponse {
  dataUrl: string | null;
  colorByAreaKey: Record<string, string>;
  warnings: string[];
}

type QuotePriceBook = "msrp" | "dealer";
type QuoteViewMode = "paged" | "all";

const ENCODED_SELECTIONS_VERSION = "v1";

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

export function ConfiguratorClient(props: ConfiguratorClientProps): JSX.Element {
  const router = useRouter();
  const [selections, setSelections] = useState<SelectionState>(props.initialSelections);
  const [dataUrl, setDataUrl] = useState<string | null>(props.initialDataUrl);
  const [colorByAreaKey, setColorByAreaKey] = useState<Record<string, string>>(props.initialColorByAreaKey);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [priceBook, setPriceBook] = useState<QuotePriceBook>("msrp");
  const [viewMode, setViewMode] = useState<QuoteViewMode>("paged");
  const [isCreatingQuote, setIsCreatingQuote] = useState(false);
  const [createQuoteError, setCreateQuoteError] = useState<string | null>(null);

  const requestIdRef = useRef(0);

  const sortedGroups = useMemo(
    () =>
      [...props.selectionGroups].sort(
        (a, b) =>
          (a.sort ?? Number.MAX_SAFE_INTEGER) - (b.sort ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id)
      ),
    [props.selectionGroups]
  );
  const hasOptionsConfigured = sortedGroups.length > 0;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const selectionsFromUrl = decodeSelectionsFromUrl(params.get("s"));
    const bookFromUrl = params.get("book");
    const modeFromUrl = params.get("mode");

    if (bookFromUrl === "msrp" || bookFromUrl === "dealer") {
      setPriceBook(bookFromUrl);
    }
    if (modeFromUrl === "paged" || modeFromUrl === "all") {
      setViewMode(modeFromUrl);
    }
    if (selectionsFromUrl) {
      setSelections(selectionsFromUrl);
      void rerender(selectionsFromUrl);
    }
  }, []);

  async function rerender(nextSelections: SelectionState): Promise<void> {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    setIsRendering(true);
    setError(null);

    try {
      const response = await fetch("/api/configurator/render", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          modelVersionId: props.modelVersionId,
          selections: nextSelections
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `Render request failed with status ${response.status}`);
      }

      const payload = (await response.json()) as RenderResponse;
      if (requestId !== requestIdRef.current) {
        return;
      }

      setDataUrl(payload.dataUrl);
      setColorByAreaKey(payload.colorByAreaKey);
    } catch (unknownError) {
      if (requestId !== requestIdRef.current) {
        return;
      }

      const message = unknownError instanceof Error ? unknownError.message : "Unknown render error";
      setError(message);
    } finally {
      if (requestId === requestIdRef.current) {
        setIsRendering(false);
      }
    }
  }

  function updateSelections(nextSelections: SelectionState): void {
    setSelections(nextSelections);
    void rerender(nextSelections);
  }

  return (
    <section className="grid gap-4">
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        {dataUrl ? (
          <img src={dataUrl} alt="Composite preview" className="w-full max-w-[720px] rounded border border-slate-200" />
        ) : (
          <p className="text-sm text-slate-700">
            {props.hasRenderView
              ? "Preview is unavailable for this model version right now."
              : "No render view configured for this model version yet. Add a render view and layers in Directus."}
          </p>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-900">Quote</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
              priceBook === "msrp" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"
            }`}
            onClick={() => {
              setPriceBook("msrp");
            }}
          >
            MSRP
          </button>
          <button
            type="button"
            className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
              priceBook === "dealer" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"
            }`}
            onClick={() => {
              setPriceBook("dealer");
            }}
          >
            Dealer
          </button>
          <button
            type="button"
            className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
              viewMode === "all" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"
            }`}
            onClick={() => {
              setViewMode((prev) => (prev === "all" ? "paged" : "all"));
            }}
          >
            All Steps
          </button>
        </div>
        <button
          type="button"
          className="mt-3 rounded-md border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={isCreatingQuote}
          onClick={async () => {
            setCreateQuoteError(null);
            setIsCreatingQuote(true);
            try {
              const response = await fetch("/api/quotes", {
                method: "POST",
                headers: {
                  "content-type": "application/json"
                },
                body: JSON.stringify({
                  modelVersionId: props.modelVersionId,
                  selections,
                  priceBook,
                  channel: "web",
                  viewMode
                })
              });
              const payload = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
              if (!response.ok || !payload.id) {
                throw new Error(payload.error ?? "Failed to create quote");
              }
              router.push(`/quote/${payload.id}`);
            } catch (unknownError) {
              setCreateQuoteError(unknownError instanceof Error ? unknownError.message : "Failed to create quote");
            } finally {
              setIsCreatingQuote(false);
            }
          }}
        >
          {isCreatingQuote ? "Creating Quote..." : "Create Quote"}
        </button>
        {createQuoteError ? (
          <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
            {createQuoteError}
          </p>
        ) : null}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-900">Debug</h2>
        <p className="mt-2 text-sm text-slate-700">
          <strong>modelVersionId:</strong> {props.modelVersionId}
        </p>
        {props.showCopyModelVersionIdButton ? (
          <button
            type="button"
            className="mt-2 rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            onClick={() => {
              void navigator.clipboard.writeText(props.modelVersionId);
            }}
          >
            Copy MODEL_VERSION_ID
          </button>
        ) : null}
        <p className="mt-2 text-sm text-slate-700">
          <strong>selectionGroups:</strong> {sortedGroups.length}
        </p>
        <p className="mt-1 text-xs text-slate-600">
          Resume param <code>s=</code>: <code>{encodeSelectionsForUrl(selections)}</code>
        </p>
        <pre className="mt-2 overflow-x-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
          {JSON.stringify(colorByAreaKey, null, 2)}
        </pre>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-900">Selections</h2>
        {!hasOptionsConfigured ? (
          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Model is published but not configured yet. Add flow steps, sections, and selection groups in Directus.
          </p>
        ) : null}
        {sortedGroups.map((group) => {
          const currentValue = selections[group.key];

          if (group.selectionMode === "single") {
            return (
              <label key={group.id} className="mb-3 mt-3 grid gap-1.5">
                <span className="text-sm font-medium text-slate-800">{group.title}</span>
                <select
                  className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-sky-500 focus:ring-2"
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
              </label>
            );
          }

          if (group.selectionMode === "boolean") {
            return (
              <label key={group.id} className="mb-3 mt-3 flex items-center gap-2 text-sm text-slate-800">
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
              <fieldset key={group.id} className="mb-3 mt-3 rounded-md border border-slate-200 p-3">
                <legend className="px-1 text-sm font-medium text-slate-800">{group.title}</legend>
                {group.options.map((option) => (
                  <label key={option.id} className="mt-1 block text-sm text-slate-700">
                    <input
                      type="checkbox"
                      className="mr-1 h-4 w-4 rounded border-slate-300"
                      checked={selected.has(option.versionItemId)}
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
                    />{" "}
                    {option.label}
                  </label>
                ))}
              </fieldset>
            );
          }

          return (
            <label key={group.id} className="mb-3 mt-3 grid gap-1.5">
              <span className="text-sm font-medium text-slate-800">{group.title}</span>
              <input
                type="number"
                className="w-28 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm outline-none ring-sky-500 focus:ring-2"
                value={asNumber(currentValue)}
                onChange={(event) => {
                  updateSelections({
                    ...selections,
                    [group.key]: Number(event.target.value)
                  });
                }}
              />
            </label>
          );
        })}

        {isRendering ? <p className="text-sm text-slate-600">Rendering...</p> : null}
        {error ? (
          <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">
            Render error: {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
