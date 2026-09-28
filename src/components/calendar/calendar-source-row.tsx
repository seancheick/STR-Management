"use client";

import { useState, useTransition } from "react";

import type { CalendarSourceRecord } from "@/lib/queries/calendar";
import { manualSyncAction, removeCalendarSourceAction } from "@/app/(admin)/dashboard/calendar/actions";
import { formatInTimeZone } from "@/lib/ical/timezone";

const platformLabels: Record<string, string> = {
  airbnb: "Airbnb",
  vrbo: "VRBO",
  booking: "Booking.com",
  other: "Other",
};

type Props = {
  source: CalendarSourceRecord;
  /** Removing a source is owner/admin-only; supervisors can still sync. */
  canRemove: boolean;
};

export function CalendarSourceRow({ source, canRemove }: Props) {
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
    if (!window.confirm(`Remove "${source.name}"? Bookings from this calendar will stop syncing.`)) {
      return;
    }
    startTransition(async () => {
      const res = await removeCalendarSourceAction(source.id);
      if (res.error) setLastResult(`Error: ${res.error}`);
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
              {formatInTimeZone(source.last_synced_at, {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </p>
          )}
          {lastResult && (
            <p
              className={`text-xs ${lastResult.startsWith("Error") ? "text-destructive" : "text-green-700"}`}
              role="status"
            >
              {lastResult}
            </p>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
            disabled={isPending}
            onClick={handleSync}
            type="button"
          >
            {isPending ? "Syncing…" : "Sync now"}
          </button>
          {canRemove && (
            <button
              className="inline-flex h-9 items-center rounded-full border border-border px-4 text-xs font-medium text-destructive transition hover:bg-destructive/10 disabled:opacity-60"
              disabled={isPending}
              onClick={handleRemove}
              type="button"
            >
              Remove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
