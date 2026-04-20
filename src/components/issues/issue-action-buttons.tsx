"use client";

import { Loader2 } from "lucide-react";
import { useState, useTransition } from "react";

import {
  acknowledgeIssueAction,
  markInProgressAction,
  resolveIssueAction,
} from "@/app/(admin)/dashboard/issues/actions";
import { showToast } from "@/components/ui/toast";

type Props = {
  issueId: string;
  currentStatus: string;
};

export function IssueActionButtons({ issueId, currentStatus }: Props) {
  const [isPending, startTransition] = useTransition();
  const [resolving, setResolving] = useState(false);
  const [notes, setNotes] = useState("");

  if (resolving) {
    return (
      <form
        className="flex w-full max-w-md shrink-0 flex-col gap-2 rounded-xl border border-green-200 bg-green-50/60 p-3"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const result = await resolveIssueAction(issueId, notes);
            if (result.error) {
              showToast(result.error, "error");
            } else {
              showToast("Issue resolved.");
              setResolving(false);
              setNotes("");
            }
          });
        }}
      >
        <label className="text-xs font-medium text-green-900" htmlFor={`res-${issueId}`}>
          Resolution notes <span className="font-normal text-green-800/60">(optional)</span>
        </label>
        <textarea
          className="min-h-16 w-full rounded-lg border border-green-200 bg-white px-3 py-2 text-xs"
          id={`res-${issueId}`}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="How did you fix this?"
          value={notes}
        />
        <div className="flex items-center gap-2">
          <button
            className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-full bg-green-600 px-3 text-xs font-semibold text-white transition hover:bg-green-700 disabled:opacity-60"
            disabled={isPending}
            type="submit"
          >
            {isPending && <Loader2 className="h-3 w-3 animate-spin" />}
            Mark resolved
          </button>
          <button
            className="inline-flex h-8 items-center justify-center rounded-full border border-border/70 bg-background px-3 text-xs font-medium transition hover:bg-muted"
            onClick={() => {
              setResolving(false);
              setNotes("");
            }}
            type="button"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex shrink-0 flex-col gap-2">
      {currentStatus === "open" && (
        <button
          className="rounded-full border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-muted disabled:opacity-60"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await acknowledgeIssueAction(issueId);
            })
          }
          type="button"
        >
          Acknowledge
        </button>
      )}
      {currentStatus === "acknowledged" && (
        <button
          className="rounded-full border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700 transition hover:bg-blue-100 disabled:opacity-60"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await markInProgressAction(issueId);
            })
          }
          type="button"
        >
          Start work
        </button>
      )}
      {["open", "acknowledged", "in_progress"].includes(currentStatus) && (
        <button
          className="rounded-full bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          onClick={() => setResolving(true)}
          type="button"
        >
          Resolve
        </button>
      )}
    </div>
  );
}
