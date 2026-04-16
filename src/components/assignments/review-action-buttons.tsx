"use client";

import { useTransition, useState } from "react";

import {
  approveJobAction,
  needsRecleanFromReviewAction,
} from "@/app/(admin)/dashboard/review/actions";

type Props = {
  assignmentId: string;
};

export function ReviewActionButtons({ assignmentId }: Props) {
  const [isPending, startTransition] = useTransition();
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleApprove() {
    startTransition(async () => {
      const result = await approveJobAction(assignmentId, notes || null);
      if (result.error) setError(result.error);
    });
  }

  function handleNeedsReclean() {
    if (!confirm("Mark this job as needing a re-clean?")) return;
    startTransition(async () => {
      const result = await needsRecleanFromReviewAction(assignmentId, notes || null);
      if (result.error) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <textarea
        className="w-full rounded-2xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        disabled={isPending}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Review notes (optional)"
        rows={2}
        value={notes}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button
          className="flex-1 rounded-full bg-green-600 px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          disabled={isPending}
          onClick={handleApprove}
          type="button"
        >
          {isPending ? "…" : "Approve"}
        </button>
        <button
          className="flex-1 rounded-full border border-orange-300 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-700 transition hover:bg-orange-100 disabled:opacity-60"
          disabled={isPending}
          onClick={handleNeedsReclean}
          type="button"
        >
          Needs re-clean
        </button>
      </div>
    </div>
  );
}
