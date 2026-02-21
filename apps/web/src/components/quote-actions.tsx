"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface QuoteActionsProps {
  resumeHref: string;
  shareHref: string | null;
  quoteId: string;
}

export function QuoteActions(props: QuoteActionsProps): JSX.Element {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={props.resumeHref}
        className="rounded-md border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
      >
        Resume configurator
      </a>
      <button
        type="button"
        disabled={!props.shareHref}
        onClick={async () => {
          if (!props.shareHref) {
            return;
          }
          try {
            const shareUrl = new URL(props.shareHref, window.location.origin).toString();
            await navigator.clipboard.writeText(shareUrl);
            setCopied(true);
            window.setTimeout(() => {
              setCopied(false);
            }, 1200);
          } catch {
            setCopied(false);
          }
        }}
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400"
      >
        {copied ? "Copied" : "Copy Public Share Link"}
      </button>
      <button
        type="button"
        disabled={isConverting}
        onClick={async () => {
          setConvertError(null);
          setIsConverting(true);
          try {
            const response = await fetch("/api/orders/from-quote", {
              method: "POST",
              headers: {
                "content-type": "application/json"
              },
              body: JSON.stringify({ quoteId: props.quoteId })
            });
            const payload = (await response.json().catch(() => null)) as { orderId?: string; error?: string } | null;
            if (!response.ok || !payload?.orderId) {
              throw new Error(payload?.error ?? "Failed to convert quote");
            }
            router.push(`/orders/${payload.orderId}`);
          } catch (error) {
            setConvertError(error instanceof Error ? error.message : "Failed to convert quote");
          } finally {
            setIsConverting(false);
          }
        }}
        className="rounded-md border border-sky-600 bg-sky-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isConverting ? "Converting..." : "Convert to Order"}
      </button>
      {convertError ? <p className="w-full text-xs text-rose-700">{convertError}</p> : null}
    </div>
  );
}
