import Link from "next/link";
import { DirectusHttpError } from "@ubb/cms-adapter-directus";
import { listQuotes } from "../../lib/server/quotes";

export const dynamic = "force-dynamic";

function formatDate(value: string | null): string {
  if (!value) {
    return "—";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

export default async function QuotesPage(): Promise<JSX.Element> {
  try {
    const quotes = await listQuotes({ limit: 25 });

    return (
      <main className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-8 md:px-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Quotes</h1>
            <p className="text-sm text-slate-600">Recent quotes from the configurator.</p>
          </div>
          <Link
            href="/configurator"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            New Quote
          </Link>
        </div>

        {quotes.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700">
            No quotes found yet. Create one from the configurator.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Quote</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Channel</th>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Model</th>
                  <th className="px-4 py-3 font-semibold">Totals</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {quotes.map((quote) => (
                  <tr key={quote.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <Link href={`/quotes/${quote.id}`} className="font-medium text-sky-700 hover:text-sky-600">
                        {quote.quoteNumber ?? quote.id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{formatDate(quote.createdAt)}</td>
                    <td className="px-4 py-3 text-slate-700">{quote.status ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-700">{quote.channel ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-700">
                      <p>{quote.customerInfo.name || "—"}</p>
                      <p className="text-xs text-slate-500">{quote.customerInfo.email || "—"}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{quote.modelLabel ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-700">
                      {quote.totals ? (
                        <div className="space-y-0.5 tabular-nums">
                          <p>MSRP: {formatCurrency(quote.totals.msrp)}</p>
                          <p>Dealer: {formatCurrency(quote.totals.dealer)}</p>
                          <p className="text-xs text-slate-500">
                            Active: {quote.priceBook ? quote.priceBook.toUpperCase() : "—"}
                          </p>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    );
  } catch (error) {
    if (error instanceof DirectusHttpError) {
      return (
        <main className="mx-auto grid w-full max-w-5xl gap-4 px-4 py-8 md:px-6">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Quotes</h1>
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Quotes are not accessible right now. Check server permissions for the quotes collection.
          </p>
        </main>
      );
    }
    throw error;
  }
}
