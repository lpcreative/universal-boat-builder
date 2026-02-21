"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface QuoteDetailsFormProps {
  quoteId: string;
  initialCustomerInfo: {
    name: string;
    email: string;
    phone: string;
  };
}

export function QuoteDetailsForm(props: QuoteDetailsFormProps): JSX.Element {
  const router = useRouter();
  const [name, setName] = useState(props.initialCustomerInfo.name);
  const [email, setEmail] = useState(props.initialCustomerInfo.email);
  const [phone, setPhone] = useState(props.initialCustomerInfo.phone);
  const [isSaving, setIsSaving] = useState(false);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  async function onSave(): Promise<void> {
    if (isSaving) {
      return;
    }
    setIsSaving(true);
    setStatusText(null);
    setErrorText(null);

    try {
      const response = await fetch(`/api/quotes/${encodeURIComponent(props.quoteId)}`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          customer_info: {
            name,
            email,
            phone
          }
        })
      });

      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "Failed to save quote details");
      }

      setStatusText("Saved");
      router.refresh();
    } catch (error) {
      setErrorText(error instanceof Error ? error.message : "Failed to save quote details");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">Quote Details</h2>
      <div className="mt-3 grid gap-3">
        <label className="grid gap-1 text-sm">
          <span className="text-slate-700">Customer name</span>
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            value={name}
            maxLength={120}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-slate-700">Email</span>
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            value={email}
            maxLength={254}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span className="text-slate-700">Phone</span>
          <input
            className="rounded-md border border-slate-300 px-3 py-2 text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            value={phone}
            maxLength={40}
            onChange={(event) => {
              setPhone(event.target.value);
            }}
          />
        </label>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          disabled={isSaving}
          onClick={() => {
            void onSave();
          }}
          className="rounded-md border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? "Saving..." : "Save"}
        </button>
        {statusText ? <p className="text-sm text-emerald-700">{statusText}</p> : null}
      </div>
      {errorText ? <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-900">{errorText}</p> : null}
    </div>
  );
}
