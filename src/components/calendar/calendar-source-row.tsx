"use client";

import { useState, useTransition } from "react";

import type { CalendarSourceRecord } from "@/lib/queries/calendar";
import { manualSyncAction, removeCalendarSourceAction } from "@/app/(admin)/dashboard/calendar/actions";

const platformLabels: Record<string, string> = {
  airbnb: "Airbnb",
  vrbo: "VRBO",
  booking: "Booking.com",
  other: "Other",
};

type Props = { source: CalendarSourceRecord };

export function CalendarSourceRow({ source }: Props) {
  const [isPending, startTransition] = useTransition();
  const [lastResult, setLastResult] = useState<string | null>(null);

  function handleSync() {
    startTransition(async () => {
      const res = await manualSyncAction(source.id);
      if (res.error) {
        setLastResult(`Error: ${res.error}`);
      } else if (res.result) {
        const r = res.result;
        setLastResult(
          `Synced: ${r.assignmentsCreated} created, ${r.assignmentsSkipped} skipped${r.conflictCount > 0 ? `, ${r.conflictCount} conflicts` : ""}`,
        );
      }
    });
  }

  function handleRemove() {
    startTransition(async () => {
      await removeCalendarSourceAction(source.id);
    });
  }

  return (
    <div className="rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{source.name}</span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {platformLabels[source.platform] ?? source.platform}
            </span>
            <span className="text-xs text-muted-foreground">
              {source.properties?.name ?? ""}
            </span>
          </div>
          <p className="max-w-lg truncate font-mono text-xs text-muted-foreground">
            {source.ical_url}
          </p>
          {source.last_synced_at && (
            <p className="text-xs text-muted-foreground">
              Last synced:{" "}
              {new Date(source.last_synced_at).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          )}
          {lastResult && (
            <p className="text-xs text-green-600">{lastResult}</p>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-xs font-medium text-[#f7f5ef] transition hover:opacity-90 disabled:opacity-60"
            disabled={isPending}
            onClick={handleSync}
            type="button"
          >
            {isPending ? "Syncing…" : "Sync now"}
          </button>
          <button
            className="inline-flex h-9 items-center rounded-full border border-border px-4 text-xs font-medium text-destructive transition hover:bg-destructive/10 disabled:opacity-60"
            disabled={isPending}
            onClick={handleRemove}
            type="button"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
