"use client";

import { useState } from "react";

interface QuoteActionsProps {
  resumeHref: string;
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
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(window.location.href);
            setCopied(true);
            window.setTimeout(() => {
              setCopied(false);
            }, 1200);
          } catch {
            setCopied(false);
          }
        }}
        className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
      >
        {copied ? "Copied" : "Copy share link"}
      </button>
    </div>
  );
}
