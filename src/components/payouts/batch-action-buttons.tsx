"use client";

import { useTransition, useState } from "react";

import {
  approveBatchAction,
  markPaidAction,
  cancelBatchAction,
} from "@/app/(admin)/dashboard/payouts/actions";

type Props = {
  batchId: string;
  canApprove: boolean;
  canPay: boolean;
  canCancel: boolean;
};

export function BatchActionButtons({
  batchId,
  canApprove,
  canPay,
  canCancel,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleApprove() {
    startTransition(async () => {
      const res = await approveBatchAction(batchId);
      if (res.error) setError(res.error);
    });
  }

  function handlePaid() {
    startTransition(async () => {
      const res = await markPaidAction(batchId);
      if (res.error) setError(res.error);
    });
  }

  function handleCancel() {
    if (!confirm("Cancel this batch? This cannot be undone.")) return;
    startTransition(async () => {
      const res = await cancelBatchAction(batchId);
      if (res.error) setError(res.error);
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      {error && (
        <p className="w-full rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </p>
      )}
      {canApprove && (
        <button
          onClick={handleApprove}
          disabled={isPending}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Approve batch"}
        </button>
      )}
      {canPay && (
        <button
          onClick={handlePaid}
          disabled={isPending}
          className="rounded-lg bg-green-600 px-5 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Mark as paid"}
        </button>
      )}
      {canCancel && (
        <button
          onClick={handleCancel}
          disabled={isPending}
          className="rounded-lg border border-destructive/40 px-5 py-2 text-sm font-medium text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
        >
          Cancel batch
        </button>
      )}
    </div>
  );
}
