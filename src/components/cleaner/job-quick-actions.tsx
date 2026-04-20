"use client";

import { Clock, Loader2, MapPin, UserX } from "lucide-react";
import { useState, useTransition } from "react";

import { declineJobAction, runningLateAction } from "@/app/(cleaner)/jobs/actions";
import { showToast } from "@/components/ui/toast";

type Props = {
  assignmentId: string;
  status: string;
  address: string | null;
};

const DECLINE_REASONS: Array<{ key: string; label: string }> = [
  { key: "sick", label: "Sick" },
  { key: "conflict", label: "Scheduling conflict" },
  { key: "distance", label: "Too far away" },
  { key: "other", label: "Other" },
];

const ETA_PRESETS = [15, 30, 45, 60];

export function JobQuickActions({ assignmentId, status, address }: Props) {
  const canDecline = status === "assigned" || status === "confirmed";
  const canRunLate = ["confirmed", "in_progress"].includes(status);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [lateOpen, setLateOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const mapsHref = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : null;

  function handleDecline(reason: string) {
    startTransition(async () => {
      const res = await declineJobAction(assignmentId, reason);
      if (!res.success) {
        showToast(res.error ?? "Could not decline.", "error");
      } else {
        showToast("Job unassigned. We suggested the next cleaner to your host.");
        setDeclineOpen(false);
      }
    });
  }

  function handleRunLate(eta: number) {
    startTransition(async () => {
      const res = await runningLateAction(assignmentId, eta);
      if (!res.success) {
        showToast(res.error ?? "Could not send update.", "error");
      } else {
        showToast(`Host notified — ETA ${eta} min.`);
        setLateOpen(false);
      }
    });
  }

  return (
    <section
      aria-label="Quick actions"
      className="grid grid-cols-2 gap-2 sm:grid-cols-3"
    >
      {mapsHref && (
        <a
          className="flex items-center justify-center gap-1.5 rounded-xl border border-border/70 bg-card px-3 py-3 text-xs font-medium transition hover:border-primary/40 hover:bg-muted"
          href={mapsHref}
          rel="noreferrer"
          target="_blank"
        >
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          Open in Maps
        </a>
      )}

      {canRunLate && (
        <button
          className="flex items-center justify-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-xs font-medium text-amber-800 transition hover:border-amber-300"
          onClick={() => setLateOpen((v) => !v)}
          type="button"
        >
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          Running late
        </button>
      )}

      {canDecline && (
        <button
          className="flex items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-xs font-medium text-red-800 transition hover:border-red-300"
          onClick={() => setDeclineOpen((v) => !v)}
          type="button"
        >
          <UserX className="h-3.5 w-3.5" aria-hidden="true" />
          Decline
        </button>
      )}

      {lateOpen && (
        <div className="col-span-full rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <p className="text-xs font-medium text-amber-900">How late are you?</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {ETA_PRESETS.map((eta) => (
              <button
                className="rounded-full border border-amber-300 bg-white px-3 py-1 text-xs font-medium text-amber-900 transition hover:bg-amber-100 disabled:opacity-60"
                disabled={isPending}
                key={eta}
                onClick={() => handleRunLate(eta)}
                type="button"
              >
                {isPending ? (
                  <Loader2 className="inline h-3 w-3 animate-spin" />
                ) : (
                  `${eta} min`
                )}
              </button>
            ))}
            <button
              className="rounded-full px-3 py-1 text-xs text-amber-900/70 transition hover:bg-amber-100"
              onClick={() => setLateOpen(false)}
              type="button"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {declineOpen && (
        <div className="col-span-full rounded-2xl border border-red-200 bg-red-50/60 p-4">
          <p className="text-xs font-medium text-red-900">
            Why are you declining? The host will be notified.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {DECLINE_REASONS.map((r) => (
              <button
                className="rounded-full border border-red-300 bg-white px-3 py-1 text-xs font-medium text-red-900 transition hover:bg-red-100 disabled:opacity-60"
                disabled={isPending}
                key={r.key}
                onClick={() => handleDecline(r.key)}
                type="button"
              >
                {isPending ? (
                  <Loader2 className="inline h-3 w-3 animate-spin" />
                ) : (
                  r.label
                )}
              </button>
            ))}
            <button
              className="rounded-full px-3 py-1 text-xs text-red-900/70 transition hover:bg-red-100"
              onClick={() => setDeclineOpen(false)}
              type="button"
            >
              Keep the job
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
