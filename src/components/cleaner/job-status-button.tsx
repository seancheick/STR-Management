"use client";

import { Loader2 } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { acceptJobAction, startJobAction } from "@/app/(cleaner)/jobs/actions";
import { showToast } from "@/components/ui/toast";

/**
 * Accept / Start job. A client component because Server Components can't
 * pass closures to <form action>; this also gives a pending state (no
 * double taps on slow signal) and surfaces the action's error.
 */
export function JobStatusButton({
  assignmentId,
  kind,
}: {
  assignmentId: string;
  kind: "accept" | "start";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      try {
        const res =
          kind === "accept"
            ? await acceptJobAction(assignmentId)
            : await startJobAction(assignmentId);
        if (!res.success) {
          showToast(res.error ?? "Something went wrong. Try again.", "error");
          return;
        }
        showToast(kind === "accept" ? "Job accepted." : "Job started.");
        // Starting a job leads straight into the checklist.
        if (kind === "start") router.push(`/jobs/${assignmentId}` as Route);
      } catch {
        showToast("Couldn't reach the server. Check your signal and try again.", "error");
      }
    });
  }

  return (
    <button
      className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground transition disabled:opacity-60"
      disabled={pending}
      onClick={run}
      type="button"
    >
      {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {kind === "accept" ? (pending ? "Accepting…" : "Accept") : pending ? "Starting…" : "Start job"}
    </button>
  );
}
