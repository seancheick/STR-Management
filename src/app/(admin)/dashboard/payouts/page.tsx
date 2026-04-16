import type { Route } from "next";
import Link from "next/link";

import { requireRole } from "@/lib/auth/session";
import { listPayoutBatches } from "@/lib/queries/payouts";
import { listActiveCleaners } from "@/lib/queries/team";
import { CreatePayoutBatchForm } from "@/components/payouts/create-payout-batch-form";

const statusColors: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  approved: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function PayoutsPage() {
  await requireRole(["owner", "admin", "supervisor"]);

  const [batches, cleaners] = await Promise.all([
    listPayoutBatches(),
    listActiveCleaners(),
  ]);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
            Finance
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">
            Payout Batches
          </h1>
        </div>
      </div>

      {/* Create new batch */}
      <section className="rounded-2xl border border-border/70 bg-card p-6">
        <h2 className="mb-4 text-lg font-semibold">Generate New Batch</h2>
        <CreatePayoutBatchForm cleaners={cleaners} />
      </section>

      {/* Batch list */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">All Batches</h2>
        {batches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No batches yet. Generate one above.
          </p>
        ) : (
          batches.map((b) => (
            <Link
              key={b.id}
              href={`/dashboard/payouts/${b.id}` as Route}
              className="flex items-center justify-between gap-4 rounded-2xl border border-border/70 bg-card px-5 py-4 transition hover:border-primary/30"
            >
              <div className="flex flex-col gap-0.5">
                <p className="font-semibold">{b.label}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(b.period_start)} → {formatDate(b.period_end)}
                  {b.cleaner_filter_user
                    ? ` · ${b.cleaner_filter_user.full_name}`
                    : " · All cleaners"}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm font-semibold">
                    ${Number(b.total_amount).toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {b.entry_count} entries
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${statusColors[b.status] ?? "bg-gray-100 text-gray-700"}`}
                >
                  {b.status}
                </span>
              </div>
            </Link>
          ))
        )}
      </section>
    </main>
  );
}
