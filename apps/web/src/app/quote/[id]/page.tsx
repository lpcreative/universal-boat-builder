import Link from "next/link";
import { notFound } from "next/navigation";
import { QuoteActions } from "../../../components/quote-actions";
import { checkRequiredDirectusEnv } from "../../../lib/server/directus-env";
import { getQuoteById, type QuotePriceBook, type QuoteViewMode } from "../../../lib/server/quotes";
import { sanitizeSelectionState, type SelectionState } from "../../../lib/configurator-shared";

interface QuotePageProps {
  params: {
    id: string;
  };
}

interface QuoteLineItemSnapshot {
  id: string;
  title: string;
  qty: number;
  unitPrice: number;
  extendedPrice: number;
  isIncluded: boolean;
}

interface QuoteSnapshotView {
  priceBook: QuotePriceBook;
  totals: {
    msrp: number;
    dealer: number;
    active: number;
  };
  lineItems: {
    selected: QuoteLineItemSnapshot[];
    included: QuoteLineItemSnapshot[];
  };
  warnings: string[];
  uiState: {
    activeStepId: string | null;
    viewMode: QuoteViewMode;
  };
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

function base64UrlEncodeUtf8(input: string): string {
  const processLike = globalThis as { Buffer?: { from: (inputValue: string, encoding: string) => { toString: (encoding: string) => string } } };
  if (processLike.Buffer) {
    return processLike.Buffer.from(input, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  }

  return btoa(input).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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

function encodeSelectionsForUrlV1(selections: SelectionState): string {
  const canonical = canonicalizeSelectionState(selections);
  const json = JSON.stringify(canonical);
  const uriEncoded = encodeURIComponent(json);
  return `v1:${base64UrlEncodeUtf8(uriEncoded)}`;
}

function coerceSnapshot(raw: unknown): QuoteSnapshotView {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const totalsRaw = source.totals && typeof source.totals === "object" ? (source.totals as Record<string, unknown>) : {};
  const lineItemsRaw =
    source.lineItems && typeof source.lineItems === "object" ? (source.lineItems as Record<string, unknown>) : {};
  const uiStateRaw = source.uiState && typeof source.uiState === "object" ? (source.uiState as Record<string, unknown>) : {};

  const asLineItems = (value: unknown): QuoteLineItemSnapshot[] => {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((row) => (row && typeof row === "object" ? (row as Record<string, unknown>) : null))
      .filter((row): row is Record<string, unknown> => Boolean(row))
      .map((row) => ({
        id: typeof row.id === "string" ? row.id : "unknown",
        title: typeof row.title === "string" ? row.title : "Unnamed",
        qty: typeof row.qty === "number" && Number.isFinite(row.qty) ? row.qty : 1,
        unitPrice: typeof row.unitPrice === "number" && Number.isFinite(row.unitPrice) ? row.unitPrice : 0,
        extendedPrice: typeof row.extendedPrice === "number" && Number.isFinite(row.extendedPrice) ? row.extendedPrice : 0,
        isIncluded: row.isIncluded === true
      }));
  };

  return {
    priceBook: source.priceBook === "dealer" ? "dealer" : "msrp",
    totals: {
      msrp: typeof totalsRaw.msrp === "number" && Number.isFinite(totalsRaw.msrp) ? totalsRaw.msrp : 0,
      dealer: typeof totalsRaw.dealer === "number" && Number.isFinite(totalsRaw.dealer) ? totalsRaw.dealer : 0,
      active: typeof totalsRaw.active === "number" && Number.isFinite(totalsRaw.active) ? totalsRaw.active : 0
    },
    lineItems: {
      selected: asLineItems(lineItemsRaw.selected),
      included: asLineItems(lineItemsRaw.included)
    },
    warnings: Array.isArray(source.warnings)
      ? source.warnings.filter((entry): entry is string => typeof entry === "string")
      : [],
    uiState: {
      activeStepId: typeof uiStateRaw.activeStepId === "string" ? uiStateRaw.activeStepId : null,
      viewMode: uiStateRaw.viewMode === "all" ? "all" : "paged"
    }
  };
}

export default async function QuotePage(props: QuotePageProps): Promise<JSX.Element> {
  const env = checkRequiredDirectusEnv();
  if (!env.ok) {
    return (
      <main className="mx-auto grid w-full max-w-4xl gap-4 px-4 py-8 md:px-6">
        <h1 className="text-2xl font-semibold text-slate-900">Directus env vars missing</h1>
        <p className="text-sm text-slate-700">Cannot load quote without server Directus credentials.</p>
        <ul className="list-inside list-disc rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {env.missing.map((name) => (
            <li key={name}>
              <code>{name}</code>
            </li>
          ))}
        </ul>
      </main>
    );
  }

  const quote = await getQuoteById(props.params.id);
  if (!quote) {
    notFound();
  }

  const snapshot = coerceSnapshot(quote.totals_snapshot);
  const selectionsSnapshot = sanitizeSelectionState(quote.selections_snapshot);
  const encodedSelections = encodeSelectionsForUrlV1(selectionsSnapshot);

  const revisionRecord =
    quote.revision && typeof quote.revision === "object"
      ? (quote.revision as unknown as Record<string, unknown>)
      : null;
  const modelVersionRecord =
    revisionRecord?.model_version && typeof revisionRecord.model_version === "object"
      ? (revisionRecord.model_version as Record<string, unknown>)
      : null;
  const boatModelRecord =
    modelVersionRecord?.boat_model && typeof modelVersionRecord.boat_model === "object"
      ? (modelVersionRecord.boat_model as Record<string, unknown>)
      : null;

  const modelVersionId = typeof modelVersionRecord?.id === "string" ? modelVersionRecord.id : null;
  const modelName = typeof boatModelRecord?.name === "string" ? boatModelRecord.name : "Boat Model";
  const year = typeof modelVersionRecord?.year === "number" ? String(modelVersionRecord.year) : "";
  const trim = typeof modelVersionRecord?.trim === "string" ? modelVersionRecord.trim : "";
  const versionLabel = [year, trim].filter((part) => part.length > 0).join(" ");
  const modelVersionLabel = versionLabel.length > 0 ? `${modelName} ${versionLabel}` : modelName;

  const createdDate = quote.date_created ? new Date(quote.date_created) : null;
  const createdDateText = createdDate && !Number.isNaN(createdDate.getTime()) ? createdDate.toLocaleString() : "Unknown";

  const resumeParams = new URLSearchParams();
  if (modelVersionId) {
    resumeParams.set("modelVersionId", modelVersionId);
    resumeParams.set("mv", modelVersionId);
  }
  resumeParams.set("book", snapshot.priceBook);
  resumeParams.set("mode", snapshot.uiState.viewMode);
  if (snapshot.uiState.activeStepId) {
    resumeParams.set("step", snapshot.uiState.activeStepId);
  }
  resumeParams.set("s", encodedSelections);
  const resumeHref = `/configurator?${resumeParams.toString()}`;

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 md:px-6 lg:grid-cols-12">
      <section className="lg:col-span-7">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-2xl font-semibold text-slate-900">Quote</h1>
          <p className="mt-1 text-sm text-slate-600">{modelVersionLabel}</p>

          <div className="mt-4 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 md:grid-cols-2">
            <p>
              <strong>Quote Number:</strong> {quote.quote_number}
            </p>
            <p>
              <strong>Created:</strong> {createdDateText}
            </p>
            <p>
              <strong>Channel:</strong> {quote.channel}
            </p>
            <p>
              <strong>Price Book:</strong> {snapshot.priceBook.toUpperCase()}
            </p>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 p-4">
            <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-600">Selections Snapshot</h2>
            <pre className="mt-2 overflow-x-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">
              {JSON.stringify(selectionsSnapshot, null, 2)}
            </pre>
          </div>
        </div>
      </section>

      <section className="lg:col-span-5">
        <div className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <QuoteActions resumeHref={resumeHref} />

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Totals</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900">{formatCurrency(snapshot.totals.active)}</p>
            <p className="mt-1 text-xs text-slate-600 tabular-nums">MSRP {formatCurrency(snapshot.totals.msrp)}</p>
            <p className="text-xs text-slate-600 tabular-nums">Dealer {formatCurrency(snapshot.totals.dealer)}</p>
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-600">Selected</h3>
            {snapshot.lineItems.selected.length > 0 ? (
              <ul className="mt-2 space-y-2 text-sm">
                {snapshot.lineItems.selected.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-800">{item.title}</p>
                      <p className="text-xs text-slate-500">Qty {item.qty}</p>
                    </div>
                    <div className="text-right text-xs tabular-nums text-slate-600">
                      <p>{formatCurrency(item.extendedPrice)}</p>
                      <p>Unit {formatCurrency(item.unitPrice)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-600">No selected line items.</p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-600">Included</h3>
            {snapshot.lineItems.included.length > 0 ? (
              <ul className="mt-2 space-y-2 text-sm">
                {snapshot.lineItems.included.map((item) => (
                  <li key={item.id} className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-slate-800">{item.title}</p>
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700">
                        Included
                      </span>
                    </div>
                    <p className="text-xs tabular-nums text-slate-600">{formatCurrency(0)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-slate-600">No included line items.</p>
            )}
          </div>

          {snapshot.warnings.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-amber-900">Warnings</h3>
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-amber-900">
                {snapshot.warnings.map((warning, index) => (
                  <li key={`${index}-${warning}`}>{warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <Link href="/configurator" className="inline-block text-sm font-medium text-sky-700 hover:text-sky-600">
            Back to configurator
          </Link>
        </div>
      </section>
    </main>
  );
}
