"use client";

import { startTransition, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { runBookabilityScanAction } from "./actions";

export function ScanBookabilityButton() {
  const router = useRouter();
  const statusId = useId();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        aria-describedby={statusId}
        className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-border/70 bg-card px-4 text-sm font-medium transition hover:bg-muted disabled:cursor-wait disabled:opacity-60"
        onClick={async () => {
          if (pending) return;
          setPending(true);
          setMessage(null);
          try {
            const r = await runBookabilityScanAction();
            setMessage(r.ok ? { text: `${r.listings} calendars checked · ${r.findings} open findings`, error: false } : { text: `Scan failed: ${r.error}`, error: true });
          } catch {
            setMessage({ text: "Could not confirm the scan finished. Refresh to see the latest result.", error: true });
          } finally {
            setPending(false);
            startTransition(() => router.refresh());
          }
        }}
      >
        <RefreshCw aria-hidden="true" className={`h-4 w-4 ${pending ? "animate-spin motion-reduce:animate-none" : ""}`} />
        {pending ? "Scanning calendars…" : "Scan now"}
      </button>
      <p id={statusId} role="status" aria-live="polite" className={`text-xs ${message?.error ? "text-destructive" : "text-muted-foreground"}`}>{message?.text}</p>
    </div>
  );
}
