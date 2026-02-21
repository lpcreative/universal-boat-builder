"use client";

import { useState } from "react";

interface QuoteActionsProps {
  resumeHref: string;
  shareHref: string | null;
}

export function QuoteActions(props: QuoteActionsProps): JSX.Element {
  const [copied, setCopied] = useState(false);

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
    </div>
  );
}
