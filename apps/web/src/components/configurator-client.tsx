"use client";

import { useMemo, useRef, useState } from "react";
import type { ConfigSelectionGroupView, SelectionState } from "../lib/configurator-shared";

interface ConfiguratorClientProps {
  modelVersionId: string;
  showCopyModelVersionIdButton: boolean;
  selectionGroups: ConfigSelectionGroupView[];
  initialSelections: SelectionState;
  initialDataUrl: string | null;
  initialColorByAreaKey: Record<string, string>;
}

interface RenderResponse {
  dataUrl: string | null;
  colorByAreaKey: Record<string, string>;
  warnings: string[];
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
  const [dataUrl, setDataUrl] = useState<string | null>(props.initialDataUrl);
  const [colorByAreaKey, setColorByAreaKey] = useState<Record<string, string>>(props.initialColorByAreaKey);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);

  const sortedGroups = useMemo(
    () => [...props.selectionGroups].sort((a, b) => (a.sort ?? Number.MAX_SAFE_INTEGER) - (b.sort ?? Number.MAX_SAFE_INTEGER) || a.id.localeCompare(b.id)),
    [props.selectionGroups]
  );

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
    <section style={{ display: "grid", gap: 16 }}>
      <div>
        {dataUrl ? (
          <img src={dataUrl} alt="Composite preview" style={{ width: "100%", maxWidth: 720, border: "1px solid #ccc" }} />
        ) : (
          <p>No render view is configured for this model version.</p>
        )}
      </div>

      <div style={{ border: "1px solid #ddd", padding: 12 }}>
        <h2 style={{ marginTop: 0 }}>Debug</h2>
        <p>
          <strong>modelVersionId:</strong> {props.modelVersionId}
        </p>
        {props.showCopyModelVersionIdButton ? (
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(props.modelVersionId);
            }}
          >
            Copy MODEL_VERSION_ID
          </button>
        ) : null}
        <p>
          <strong>selectionGroups:</strong> {sortedGroups.length}
        </p>
        <pre style={{ whiteSpace: "pre-wrap", overflowX: "auto" }}>{JSON.stringify(colorByAreaKey, null, 2)}</pre>
      </div>

      <div style={{ border: "1px solid #ddd", padding: 12 }}>
        <h2 style={{ marginTop: 0 }}>Selections</h2>
        {sortedGroups.map((group) => {
          const currentValue = selections[group.key];

          if (group.selectionMode === "single") {
            return (
              <label key={group.id} style={{ display: "grid", gap: 4, marginBottom: 12 }}>
                <span>{group.title}</span>
                <select
                  value={asString(currentValue)}
                  onChange={(event) => {
                    updateSelections({
                      ...selections,
                      [group.key]: event.target.value
                    });
                  }}
                >
                  <option value="">-- Select --</option>
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
              <label key={group.id} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                <input
                  type="checkbox"
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
              <fieldset key={group.id} style={{ marginBottom: 12 }}>
                <legend>{group.title}</legend>
                {group.options.map((option) => (
                  <label key={option.id} style={{ display: "block" }}>
                    <input
                      type="checkbox"
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
            <label key={group.id} style={{ display: "grid", gap: 4, marginBottom: 12 }}>
              <span>{group.title}</span>
              <input
                type="number"
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

        {isRendering ? <p>Rendering...</p> : null}
        {error ? <p style={{ color: "#b00020" }}>Render error: {error}</p> : null}
      </div>
    </section>
  );
}
