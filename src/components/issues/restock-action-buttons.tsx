"use client";

import { useTransition } from "react";

import {
  acknowledgeRestockAction,
  fulfillRestockAction,
} from "@/app/(admin)/dashboard/issues/actions";
import { showToast } from "@/components/ui/toast";

type Props = {
  requestId: string;
  status: string;
};

export function RestockActionButtons({ requestId, status }: Props) {
  const [isPending, startTransition] = useTransition();

  function run(action: typeof acknowledgeRestockAction, done: string) {
    startTransition(async () => {
      const res = await action(requestId);
      showToast(res.error ?? done, res.error ? "error" : "success");
    });
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      {status === "acknowledged" ? (
        <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
          Acknowledged
        </span>
      ) : (
        <button
          className="rounded-full border border-border px-3 py-1.5 text-xs font-medium transition hover:bg-muted disabled:opacity-60"
          disabled={isPending}
          onClick={() => run(acknowledgeRestockAction, "Acknowledged.")}
          type="button"
        >
          Acknowledge
        </button>
      )}
      <button
        className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
        disabled={isPending}
        onClick={() => run(fulfillRestockAction, "Marked fulfilled.")}
        type="button"
      >
        Fulfill
      </button>
    </div>
  );
}
