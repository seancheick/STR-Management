"use client";

import { startTransition, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { JOBS_CHANGED_EVENT } from "@/lib/services/job-updates";
import { syncAllCalendarsAction, type SyncAllCalendarsResult } from "./actions";

export function SyncAllButton() {
  const router = useRouter();
  const statusId = useId();
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SyncAllCalendarsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const needsAttention = Boolean(error || result?.failures.length || result?.conflictCount);

  return (
    <div className="flex max-w-lg flex-col items-start gap-2">
      <button
        type="button"
        disabled={pending}
        aria-busy={pending}
        aria-describedby={statusId}
        title="Sync all active listing calendars"
        className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border border-border/70 bg-card px-4 text-sm font-medium transition hover:bg-muted disabled:cursor-wait disabled:opacity-60"
        onClick={async () => {
          if (pending) return;
          setPending(true);
          setError(null);
          setResult(null);
          try {
            const response = await syncAllCalendarsAction();
            setResult(response);
            setError(response.error);
            if (!response.error) {
              window.dispatchEvent(new Event(JOBS_CHANGED_EVENT));
              startTransition(() => router.refresh());
            }
          } catch {
            setError("Could not confirm the sync finished. Refresh to check the latest changes, or try syncing again.");
            startTransition(() => router.refresh());
          } finally {
            setPending(false);
          }
        }}
      >
        <RefreshCw aria-hidden="true" className={`h-4 w-4 ${pending ? "animate-spin motion-reduce:animate-none" : ""}`} />
        {pending ? "Syncing calendars…" : "Sync all"}
      </button>
      <div id={statusId} role="status" aria-live="polite" aria-atomic="true" className={`text-xs ${needsAttention ? "text-amber-800 dark:text-amber-300" : "text-muted-foreground"}`}>
        {pending && "Checking all active listing calendars. This can take a moment."}
        {error && <p>{error}</p>}
        {result && !error && (
          <>
            <p>{result.attempted === 0 ? "No active calendars to sync. Add a calendar source to get started." : `${result.succeeded} of ${result.attempted} calendars synced · ${result.assignmentsCreated} jobs created · ${result.assignmentsRescheduled} moved · ${result.assignmentsCancelled} cancelled.`}</p>
            {result.conflictCount > 0 && <p>{result.conflictCount} conflicts need review in <a className="underline underline-offset-2" href="/dashboard/calendar">Calendar sync</a>.</p>}
            {result.failures.length > 0 && <p>Could not sync: {result.failures.map(feed => `${feed.sourceName} (${feed.propertyName})`).join(", ")}. Retry these in <a className="underline underline-offset-2" href="/dashboard/calendar">Calendar sync</a>.</p>}
          </>
        )}
      </div>
    </div>
  );
}
