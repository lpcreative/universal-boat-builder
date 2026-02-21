"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ORDER_STATUS_OPTIONS, type OrderStatus } from "../lib/orders-shared";

interface OrderStatusFormProps {
  orderId: string;
  initialStatus: string | null;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  accepted: "Accepted",
  in_production: "In Production",
  completed: "Completed",
  cancelled: "Cancelled"
};

function toStatus(value: string | null): OrderStatus {
  if (value && ORDER_STATUS_OPTIONS.includes(value as OrderStatus)) {
    return value as OrderStatus;
  }
  return "draft";
}

export function OrderStatusForm(props: OrderStatusFormProps): JSX.Element {
  const router = useRouter();
  const [status, setStatus] = useState<OrderStatus>(toStatus(props.initialStatus));
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-2"
      onSubmit={async (event) => {
        event.preventDefault();
        setIsSaving(true);
        setMessage(null);
        setError(null);
        try {
          const response = await fetch(`/api/orders/${encodeURIComponent(props.orderId)}`, {
            method: "PATCH",
            headers: {
              "content-type": "application/json"
            },
            body: JSON.stringify({ status })
          });
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          if (!response.ok) {
            throw new Error(payload?.error ?? "Failed to update status");
          }
          setMessage("Status updated");
          router.refresh();
        } catch (saveError) {
          setError(saveError instanceof Error ? saveError.message : "Failed to update status");
        } finally {
          setIsSaving(false);
        }
      }}
    >
      <label htmlFor="order-status" className="block text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
        Order status
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <select
          id="order-status"
          value={status}
          onChange={(event) => {
            setStatus(toStatus(event.target.value));
          }}
          className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
        >
          {ORDER_STATUS_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {STATUS_LABELS[option]}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={isSaving}
          className="rounded-md border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSaving ? "Saving..." : "Save Status"}
        </button>
      </div>
      {message ? <p className="text-xs text-emerald-700">{message}</p> : null}
      {error ? <p className="text-xs text-rose-700">{error}</p> : null}
    </form>
  );
}
