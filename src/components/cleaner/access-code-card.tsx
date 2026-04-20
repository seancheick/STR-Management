"use client";

import { Check, Copy, KeyRound } from "lucide-react";
import { useState } from "react";

type Props = {
  accessCode: string;
};

export function AccessCodeCard({ accessCode }: Props) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(accessCode).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => {
        setCopied(false);
      },
    );
  }

  return (
    <section className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
        <KeyRound className="h-5 w-5" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-[0.15em] text-primary/80">
          Access code
        </p>
        <p className="mt-0.5 font-mono text-2xl font-semibold tracking-wider text-foreground">
          {accessCode}
        </p>
      </div>
      <button
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-primary/30 bg-white px-3 text-xs font-semibold text-primary transition hover:bg-primary/10"
        onClick={handleCopy}
        type="button"
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5" aria-hidden="true" /> Copied
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy
          </>
        )}
      </button>
    </section>
  );
}
