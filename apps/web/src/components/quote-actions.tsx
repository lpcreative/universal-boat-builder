"use client";

import Link from "next/link";
import { useState } from "react";

interface QuoteActionsProps {
  resumeHref: string;
}

export function QuoteActions(props: QuoteActionsProps): JSX.Element {
  const [copyState, setCopyState] = useState<"idle" | "done" | "error">("idle");

  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href={props.resumeHref}
        className="rounded-lg border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
      >
        Resume Configurator
      </Link>
      <button
        type="button"
        className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(window.location.href);
            setCopyState("done");
          } catch {
            setCopyState("error");
          }
        }}
      >
        Copy Share Link
      </button>
      {copyState === "done" ? <p className="self-center text-xs text-emerald-700">Link copied.</p> : null}
      {copyState === "error" ? <p className="self-center text-xs text-rose-700">Copy failed.</p> : null}
    </div>
  );
}
