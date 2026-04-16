"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { completeJobAction } from "@/app/(cleaner)/jobs/actions";

type CompleteJobButtonProps = { assignmentId: string };

export function CompleteJobButton({ assignmentId }: CompleteJobButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleComplete() {
    setError(null);
    startTransition(async () => {
      const result = await completeJobAction(assignmentId);
      if (result.success) {
        router.push("/jobs");
        router.refresh();
      } else {
        setError(result.error ?? "Could not complete job.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <button
        className="inline-flex h-12 w-full items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
        disabled={isPending}
        onClick={handleComplete}
        type="button"
      >
        {isPending ? "Submitting…" : "Submit for review"}
      </button>
    </div>
  );
}
