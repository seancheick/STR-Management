"use client";

import { useTransition } from "react";

import {
  acknowledgeRestockAction,
  fulfillRestockAction,
} from "@/app/(admin)/dashboard/issues/actions";

type Props = {
  requestId: string;
};

export function RestockActionButtons({ requestId }: Props) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex shrink-0 gap-2">
      <button
        className="rounded-full border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-muted disabled:opacity-60"
        disabled={isPending}
        onClick={() => startTransition(async () => { await acknowledgeRestockAction(requestId); })}
        type="button"
      >
        Acknowledge
      </button>
      <button
        className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-[#f7f5ef] transition hover:opacity-90 disabled:opacity-60"
        disabled={isPending}
        onClick={() => startTransition(async () => { await fulfillRestockAction(requestId); })}
        type="button"
      >
        Fulfill
      </button>
    </div>
  );
}
