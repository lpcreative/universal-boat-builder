import Link from "next/link";
import { DirectusHttpError } from "@ubb/cms-adapter-directus";
import { QuoteActions } from "../../../components/quote-actions";
import { QuoteDetailsForm } from "../../../components/quote-details-form";
import { generateQuoteShareToken } from "../../../lib/server/quote-share";
import { getQuoteById } from "../../../lib/server/quotes";

export const dynamic = "force-dynamic";

interface QuotePageProps {
  params: {
    quoteId: string;
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

function formatDate(value: string | null): string {
  if (!value) {
    return "Unknown date";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function buildResumeHref(args: {
  resumeUrl: string | null;
  modelVersionId: string;
  priceBook: "msrp" | "dealer";
  viewMode: "paged" | "all";
  stepId: string | null;
  encodedSelections: string | null;
}): string {
  if (args.resumeUrl && args.resumeUrl.startsWith("/configurator")) {
    return args.resumeUrl;
  }

  const params = new URLSearchParams();
  params.set("mv", args.modelVersionId);
  params.set("book", args.priceBook);
  params.set("mode", args.viewMode);
  if (args.stepId) {
    params.set("step", args.stepId);
  }
  if (args.encodedSelections) {
    params.set("s", args.encodedSelections);
  }
  return `/configurator?${params.toString()}`;
}

export default async function QuotePage(props: QuotePageProps): Promise<JSX.Element> {
  let quote = null;
  try {
    quote = await getQuoteById(props.params.quoteId);
  } catch (error) {
    if (error instanceof DirectusHttpError) {
      return (
        <main className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-8 md:px-6">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Quote not accessible</h1>
          <p className="text-sm text-slate-700">
            This quote is not accessible right now. Check server permissions for the quotes collection.
          </p>
          <p>
            <Link className="text-sm font-medium text-sky-700 hover:text-sky-600" href="/configurator">
              Back to configurator
            </Link>
          </p>
        </main>
      );
    }
    throw error;
  }

  if (!quote) {
    return (
      <main className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-8 md:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Quote not found</h1>
        <p className="text-sm text-slate-700">No quote exists for ID: {props.params.quoteId}</p>
        <p>
          <Link className="text-sm font-medium text-sky-700 hover:text-sky-600" href="/configurator">
            Back to configurator
          </Link>
        </p>
      </main>
    );
  }

  const snapshot = quote.totalsSnapshot;
  if (!snapshot) {
    return (
      <main className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-8 md:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Quote {quote.quoteNumber ?? quote.id}</h1>
        <p className="text-sm text-slate-700">This quote does not have a pricing snapshot.</p>
      </main>
    );
  }

  const selectedLines = snapshot.lineItems.filter((line) => line.source === "selection");
  const includedLines = snapshot.lineItems.filter((line) => line.isIncluded || line.source === "included");
  const activeTotal = snapshot.priceBook === "dealer" ? snapshot.totals.dealer : snapshot.totals.msrp;
  const resumeHref = buildResumeHref({
    resumeUrl: snapshot.meta.resumeUrl,
    modelVersionId: snapshot.modelVersionId,
    priceBook: snapshot.priceBook,
    viewMode: snapshot.meta.viewMode,
    stepId: snapshot.meta.stepId,
    encodedSelections: snapshot.meta.encodedSelections
  });
  let shareHref: string | null = null;
  try {
    const shareToken = generateQuoteShareToken({ quoteId: quote.id, expiresInDays: 30 });
    shareHref = `/q/${shareToken}`;
  } catch {
    shareHref = null;
  }

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 md:px-6 lg:grid-cols-12">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-5">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Quote Snapshot</p>
        <h1 className="mt-1 text-2xl font-semibold text-slate-900">{snapshot.modelLabel}</h1>
        <dl className="mt-4 grid gap-2 text-sm text-slate-700">
          <div className="flex items-center justify-between gap-3">
            <dt>Quote number</dt>
            <dd className="font-medium text-slate-900">{quote.quoteNumber ?? quote.id}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt>Created</dt>
            <dd>{formatDate(quote.createdAt ?? snapshot.meta.createdAt)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt>Price book</dt>
            <dd className="uppercase">{snapshot.priceBook}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt>Total</dt>
            <dd className="text-lg font-semibold tabular-nums text-slate-900">{formatCurrency(activeTotal)}</dd>
          </div>
        </dl>

        <div className="mt-5">
          <QuoteActions resumeHref={resumeHref} shareHref={shareHref} quoteId={quote.id} />
        </div>
        <div className="mt-5">
          <QuoteDetailsForm quoteId={quote.id} initialCustomerInfo={quote.customerInfo} />
        </div>
      </section>

      <section className="space-y-4 lg:col-span-7">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Selected Items</h2>
          {selectedLines.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {selectedLines.map((line) => (
                <li key={line.key} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                  <div>
                    <p className="font-medium text-slate-900">{line.label}</p>
                    <p className="text-xs text-slate-500">Qty {line.qty}</p>
                  </div>
                  <div className="text-right tabular-nums">
                    <p className="text-sm text-slate-800">{formatCurrency(line.extendedPrice)}</p>
                    <p className="text-xs text-slate-500">Unit {formatCurrency(line.unitPrice)}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-600">No selected line items.</p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Included Items</h2>
          {includedLines.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {includedLines.map((line) => (
                <li key={line.key} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                  <div>
                    <p className="font-medium text-slate-900">{line.label}</p>
                    <p className="text-xs text-emerald-700">Included</p>
                  </div>
                  <p className="tabular-nums text-slate-700">{formatCurrency(0)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-600">No included items.</p>
          )}
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Warnings</h2>
          {snapshot.warnings.length > 0 ? (
            <ul className="mt-2 list-inside list-disc text-sm text-amber-800">
              {snapshot.warnings.map((warning, index) => (
                <li key={`${index}-${warning}`}>{warning}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-600">No warnings.</p>
          )}
        </div>
      </section>
    </main>
  );
}
