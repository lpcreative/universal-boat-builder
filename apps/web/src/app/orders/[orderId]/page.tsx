import Link from "next/link";
import { DirectusHttpError } from "@ubb/cms-adapter-directus";
import { OrderStatusForm } from "../../../components/order-status-form";
import { getOrderById } from "../../../lib/server/orders";

export const dynamic = "force-dynamic";

interface OrderPageProps {
  params: {
    orderId: string;
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

function buildResumeHrefFromSelections(selections: Record<string, unknown>): string | null {
  const resumeUrl = typeof selections.__resume_url === "string" ? selections.__resume_url : null;
  if (resumeUrl && resumeUrl.startsWith("/configurator")) {
    return resumeUrl;
  }

  const modelVersionId = typeof selections.__mv === "string" ? selections.__mv : null;
  const priceBook = selections.__book === "dealer" ? "dealer" : selections.__book === "msrp" ? "msrp" : null;
  const viewMode = selections.__mode === "all" ? "all" : selections.__mode === "paged" ? "paged" : null;
  const stepId = typeof selections.__step === "string" ? selections.__step : null;
  const encodedSelections = typeof selections.__s === "string" ? selections.__s : null;

  if (!modelVersionId || !priceBook || !viewMode) {
    return null;
  }

  const params = new URLSearchParams();
  params.set("mv", modelVersionId);
  params.set("book", priceBook);
  params.set("mode", viewMode);
  if (stepId) {
    params.set("step", stepId);
  }
  if (encodedSelections) {
    params.set("s", encodedSelections);
  }
  return `/configurator?${params.toString()}`;
}

export default async function OrderPage(props: OrderPageProps): Promise<JSX.Element> {
  let order = null;
  try {
    order = await getOrderById(props.params.orderId);
  } catch (error) {
    if (error instanceof DirectusHttpError) {
      return (
        <main className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-8 md:px-6">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Order not accessible</h1>
          <p className="text-sm text-slate-700">
            This order is not accessible right now. Check server permissions for orders and order events.
          </p>
          <p>
            <Link className="text-sm font-medium text-sky-700 hover:text-sky-600" href="/orders">
              Back to orders
            </Link>
          </p>
        </main>
      );
    }
    throw error;
  }

  if (!order) {
    return (
      <main className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-8 md:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Order not found</h1>
        <p className="text-sm text-slate-700">No order exists for ID: {props.params.orderId}</p>
        <p>
          <Link className="text-sm font-medium text-sky-700 hover:text-sky-600" href="/orders">
            Back to orders
          </Link>
        </p>
      </main>
    );
  }

  const snapshot = order.totalsSnapshot;
  const selectedLines = snapshot ? snapshot.lineItems.filter((line) => line.source === "selection") : [];
  const includedLines = snapshot ? snapshot.lineItems.filter((line) => line.isIncluded || line.source === "included") : [];
  const activeTotal = snapshot ? (snapshot.priceBook === "dealer" ? snapshot.totals.dealer : snapshot.totals.msrp) : 0;
  const resumeHref = buildResumeHrefFromSelections(order.selectionsSnapshot as Record<string, unknown>);
  const quoteId = order.externalRefs.quote_id ?? null;
  const selectedGroupCount = Object.keys(order.selectionsSnapshot).length;

  return (
    <main className="mx-auto grid w-full max-w-7xl gap-6 px-4 py-8 md:px-6 lg:grid-cols-12">
      <section className="space-y-4 lg:col-span-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Order</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{order.orderNumber ?? order.id}</h1>
          <dl className="mt-4 grid gap-2 text-sm text-slate-700">
            <div className="flex items-center justify-between gap-3">
              <dt>Status</dt>
              <dd className="font-medium capitalize text-slate-900">{order.status ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Created</dt>
              <dd>{formatDate(order.createdAt)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Dealer</dt>
              <dd>{order.dealerId ?? "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Customer</dt>
              <dd>{order.customerInfo.name || "—"}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Email</dt>
              <dd>{order.customerInfo.email || "—"}</dd>
            </div>
            {snapshot ? (
              <div className="flex items-center justify-between gap-3">
                <dt>Total</dt>
                <dd className="text-lg font-semibold tabular-nums text-slate-900">{formatCurrency(activeTotal)}</dd>
              </div>
            ) : null}
          </dl>

          <div className="mt-5">
            <OrderStatusForm orderId={order.id} initialStatus={order.status} />
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            {resumeHref ? (
              <Link
                href={resumeHref}
                className="rounded-md border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                Resume configurator
              </Link>
            ) : null}
            {quoteId ? (
              <Link
                href={`/quotes/${quoteId}`}
                className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                View source quote
              </Link>
            ) : null}
          </div>
          <p className="mt-3 text-xs text-slate-500">Configured groups captured: {selectedGroupCount}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Order Events</h2>
          {order.events.length > 0 ? (
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {order.events.map((event) => (
                <li key={event.id} className="rounded-lg border border-slate-200 px-3 py-2">
                  <p className="font-medium text-slate-900">{event.type ?? "event"}</p>
                  <p>{event.note ?? "—"}</p>
                  <p className="text-xs text-slate-500">{formatDate(event.createdAt)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-slate-600">No order events yet.</p>
          )}
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
          {snapshot && snapshot.warnings.length > 0 ? (
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
