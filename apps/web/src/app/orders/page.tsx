import Link from "next/link";
import { DirectusHttpError } from "@ubb/cms-adapter-directus";
import { listOrders } from "../../lib/server/orders";

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

export default async function OrdersPage(): Promise<JSX.Element> {
  try {
    const orders = await listOrders({ limit: 25 });
    return (
      <main className="mx-auto grid w-full max-w-7xl gap-4 px-4 py-8 md:px-6">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Orders</h1>
            <p className="text-sm text-slate-600">Recent orders converted from quotes.</p>
          </div>
          <Link
            href="/quotes"
            className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            View Quotes
          </Link>
        </div>

        {orders.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-700">
            No orders found yet. Convert a quote to create an order.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.08em] text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Order</th>
                  <th className="px-4 py-3 font-semibold">Created</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Dealer</th>
                  <th className="px-4 py-3 font-semibold">Customer</th>
                  <th className="px-4 py-3 font-semibold">Totals</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.map((order) => (
                  <tr key={order.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3">
                      <Link href={`/orders/${order.id}`} className="font-medium text-sky-700 hover:text-sky-600">
                        {order.orderNumber ?? order.id}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{formatDate(order.createdAt)}</td>
                    <td className="px-4 py-3 text-slate-700">{order.status ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-700">{order.dealerId ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-700">
                      <p>{order.customerInfo.name || "—"}</p>
                      <p className="text-xs text-slate-500">{order.customerInfo.email || "—"}</p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {order.totalsSnapshot ? (
                        <div className="space-y-0.5 tabular-nums">
                          <p>MSRP: {formatCurrency(order.totalsSnapshot.totals.msrp)}</p>
                          <p>Dealer: {formatCurrency(order.totalsSnapshot.totals.dealer)}</p>
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
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Orders</h1>
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Orders are not accessible right now. Check server permissions for the orders collection.
          </p>
        </main>
      );
    }
    throw error;
  }
}
