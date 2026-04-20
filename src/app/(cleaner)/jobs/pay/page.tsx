import { Banknote } from "lucide-react";

import { CleanerJobCard } from "@/components/cleaner/cleaner-job-card";
import { requireRole } from "@/lib/auth/session";
import {
  listMyPayoutEntries,
  listPendingCleanerPayoutAssignments,
} from "@/lib/queries/payouts";
import { calculateCleanerPaySummary } from "@/lib/services/cleaner-portal";

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function CleanerPayPage() {
  const profile = await requireRole(["cleaner", "owner", "admin", "supervisor"]);
  const [entries, pendingAssignments] = await Promise.all([
    listMyPayoutEntries(profile.id),
    listPendingCleanerPayoutAssignments(profile.id),
  ]);
  const summary = calculateCleanerPaySummary({
    payoutEntries: entries,
    pendingAssignments,
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-5 py-8">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">Pay</p>
        <h1 className="text-3xl font-semibold tracking-tight">
          ${summary.projectedTotal.toFixed(2)}
        </h1>
        <p className="text-sm text-muted-foreground">
          ${summary.paidTotal.toFixed(2)} in batches · ${summary.pendingTotal.toFixed(2)} pending
        </p>
      </header>

      <section className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border/70 bg-card px-4 py-4">
          <p className="text-xs text-muted-foreground">Batch pay</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            ${summary.paidTotal.toFixed(2)}
          </p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
          <p className="text-xs text-amber-700/80">Pending</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-amber-800">
            ${summary.pendingTotal.toFixed(2)}
          </p>
        </div>
      </section>

      {pendingAssignments.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">Pending payout</h2>
          {pendingAssignments.map((assignment) => (
            <CleanerJobCard
              assignment={assignment}
              key={assignment.id}
              showActions={false}
              showPayout
            />
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Payout history</h2>
        {entries.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card/70 px-6 py-10 text-center">
            <Banknote className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
            <div>
              <p className="font-semibold">No payout records yet</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Approved or paid batch entries will appear here.
              </p>
            </div>
          </div>
        ) : (
          entries.map((entry) => (
            <article
              key={entry.id}
              className="flex items-center justify-between rounded-2xl border border-border/70 bg-card px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">{entry.properties?.name ?? "Property"}</p>
                <p className="text-xs text-muted-foreground">
                  {entry.assignments?.due_at ? formatDate(entry.assignments.due_at) : "—"}
                  {" · "}
                  {entry.assignments?.assignment_type?.replace(/_/g, " ") ?? "job"}
                </p>
              </div>
              <p className="text-sm font-semibold">${Number(entry.amount).toFixed(2)}</p>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
