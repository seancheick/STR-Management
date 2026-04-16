"use client";

import { useTransition } from "react";

import {
  acknowledgeIssueAction,
  resolveIssueAction,
} from "@/app/(admin)/dashboard/issues/actions";

type Props = {
  issueId: string;
  currentStatus: string;
};

export function IssueActionButtons({ issueId, currentStatus }: Props) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex shrink-0 flex-col gap-2">
      {currentStatus === "open" && (
        <button
          className="rounded-full border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-muted disabled:opacity-60"
          disabled={isPending}
          onClick={() => startTransition(async () => { await acknowledgeIssueAction(issueId); })}
          type="button"
        >
          Acknowledge
        </button>
      )}
      {["open", "acknowledged", "in_progress"].includes(currentStatus) && (
        <button
          className="rounded-full bg-green-600 px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90 disabled:opacity-60"
          disabled={isPending}
          onClick={() => startTransition(async () => { await resolveIssueAction(issueId); })}
          type="button"
        >
          Resolve
        </button>
      )}
    </div>
  );
}
