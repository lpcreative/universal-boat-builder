"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { renderMaskTintPreview } from "../lib/client/mask-tint-renderer";
import type { ClientRenderConfig, ConfigSelectionGroupView, SelectionState } from "../lib/configurator-shared";

interface ConfiguratorClientProps {
  modelVersionId: string;
  showCopyModelVersionIdButton: boolean;
  selectionGroups: ConfigSelectionGroupView[];
  initialSelections: SelectionState;
  initialColorByAreaKey: Record<string, string>;
  renderConfig: ClientRenderConfig;
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

export function ConfiguratorClient(props: ConfiguratorClientProps): JSX.Element {
  const [selections, setSelections] = useState<SelectionState>(props.initialSelections);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [colorByAreaKey, setColorByAreaKey] = useState<Record<string, string>>(props.initialColorByAreaKey);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);

  const sortedGroups = useMemo(
    () => [...props.selectionGroups].sort((a, b) => (a.sort ?? Number.MAX_SAFE_INTEGER) - (b.sort ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id)),
    [props.selectionGroups]
  );

  const rerender = useCallback(async (nextSelections: SelectionState): Promise<void> => {
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
  }, [props.renderConfig]);

  function updateSelections(nextSelections: SelectionState): void {
    setSelections(nextSelections);
    void rerender(nextSelections);
  }

  useEffect(() => {
    void rerender(props.initialSelections);
  }, [props.initialSelections, rerender]);

  return (
    <section className="grid gap-4">
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        {dataUrl ? (
          <img src={dataUrl} alt="Composite preview" className="w-full max-w-[720px] rounded border border-slate-200" />
        ) : (
          <p className="text-sm text-slate-700">No render view is configured for this model version.</p>
        )}
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
        <pre className="mt-2 overflow-x-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
          {JSON.stringify(colorByAreaKey, null, 2)}
        </pre>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-slate-900">Selections</h2>
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
        {error ? <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">Render error: {error}</p> : null}
      </div>
    </section>
  );
}
