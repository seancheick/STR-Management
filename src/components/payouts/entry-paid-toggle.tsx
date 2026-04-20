"use client";

import { Check, Loader2 } from "lucide-react";
import { useTransition } from "react";

import { toggleEntryPaidAction } from "@/app/(admin)/dashboard/payouts/actions";
import { showToast } from "@/components/ui/toast";

type Props = {
  entryId: string;
  paidAt: string | null;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export function EntryPaidToggle({ entryId, paidAt }: Props) {
  const [isPending, startTransition] = useTransition();
  const paid = paidAt !== null;

  function handleToggle() {
    startTransition(async () => {
      const res = await toggleEntryPaidAction(entryId, !paid);
      if (res.error) {
        showToast(res.error, "error");
      } else {
        showToast(paid ? "Marked unpaid." : "Marked paid.");
      }
    });
  }

  return (
    <button
      className={`inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition disabled:opacity-60 ${
        paid
          ? "border-green-300 bg-green-50 text-green-800 hover:bg-green-100"
          : "border-border/70 bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
      }`}
      disabled={isPending}
      onClick={handleToggle}
      type="button"
    >
      {isPending ? (
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      ) : paid ? (
        <Check className="h-3 w-3" aria-hidden="true" />
      ) : null}
      {paid ? `Paid ${paidAt ? formatDate(paidAt) : ""}` : "Mark paid"}
    </button>
  );
}
