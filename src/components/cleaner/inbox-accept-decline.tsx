"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, X } from "lucide-react";

import { acceptJobAction, declineJobAction } from "@/app/(cleaner)/jobs/actions";
import { showToast } from "@/components/ui/toast";

const DECLINE_REASONS = [
  { value: "sick", label: "Sick" },
  { value: "conflict", label: "Conflict" },
  { value: "distance", label: "Too far" },
  { value: "other", label: "Other" },
] as const;

export function InboxAcceptDecline({ assignmentId }: { assignmentId: string }) {
  const [pending, startTransition] = useTransition();
  const [declineOpen, setDeclineOpen] = useState(false);

  function handleAccept(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      const res = await acceptJobAction(assignmentId);
      showToast(res.success ? "Accepted." : res.error ?? "Could not accept.", res.success ? "success" : "error");
    });
  }

  function handleDecline(reason: string) {
    startTransition(async () => {
      const res = await declineJobAction(assignmentId, reason);
      showToast(res.success ? "Declined." : res.error ?? "Could not decline.", res.success ? "success" : "error");
      setDeclineOpen(false);
    });
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <button
        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-emerald-600 px-3 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        disabled={pending}
        onClick={handleAccept}
        type="button"
      >
        {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
        Accept
      </button>

      {!declineOpen ? (
        <button
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 text-xs font-medium text-foreground transition hover:bg-muted disabled:opacity-50"
          disabled={pending}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setDeclineOpen(true);
          }}
          type="button"
        >
          <X className="h-3 w-3" />
          Decline
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[11px] text-muted-foreground">Reason:</span>
          {DECLINE_REASONS.map((r) => (
            <button
              className="inline-flex h-7 items-center rounded-full border border-border/70 bg-card px-2.5 text-[11px] font-medium transition hover:bg-muted disabled:opacity-50"
              disabled={pending}
              key={r.value}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleDecline(r.value);
              }}
              type="button"
            >
              {r.label}
            </button>
          ))}
          <button
            className="inline-flex h-7 items-center rounded-full px-2 text-[11px] font-medium text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDeclineOpen(false);
            }}
            type="button"
          >
            cancel
          </button>
        </div>
      )}
    </div>
  );
}
