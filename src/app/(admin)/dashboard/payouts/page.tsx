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

const FILTER_PRESETS: Array<{ key: string; label: string; days: number | "all" }> = [
  { key: "all", label: "All", days: "all" },
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "365", label: "This year", days: 365 },
];

type PayoutsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PayoutsPage({ searchParams }: PayoutsPageProps) {
  await requireRole(["owner", "admin", "supervisor"]);
  const params = (await searchParams) ?? {};
  const rangeKey = typeof params.range === "string" ? params.range : "all";

  const [allBatches, cleaners] = await Promise.all([
    listPayoutBatches(),
    listActiveCleaners(),
  ]);

  // Filter in-memory — payout_batches is a small table per owner.
  const preset = FILTER_PRESETS.find((p) => p.key === rangeKey) ?? FILTER_PRESETS[0];
  const cutoff =
    preset.days === "all"
      ? null
      : new Date(Date.now() - preset.days * 24 * 60 * 60 * 1000);
  const batches = cutoff
    ? allBatches.filter((b) => new Date(b.period_end) >= cutoff)
    : allBatches;

  const totalPaid = batches
    .filter((b) => b.status === "paid")
    .reduce((sum, b) => sum + Number(b.total_amount), 0);
  const totalPending = batches
    .filter((b) => b.status === "draft" || b.status === "approved")
    .reduce((sum, b) => sum + Number(b.total_amount), 0);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
            Finance
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">
            Payout reports
          </h1>
        </div>
      </div>

      {/* Create new report */}
      <section className="rounded-2xl border border-border/70 bg-card p-6">
        <h2 className="mb-1 text-lg font-semibold">Generate a payout report</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Pick a cleaner and date range. We&apos;ll pull approved jobs, total
          the payouts, and let you review, mark paid, or export.
        </p>
        <CreatePayoutBatchForm cleaners={cleaners} />
      </section>

      {/* Report list with date-range filter + totals */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Reports</h2>
          <div className="flex flex-wrap gap-1.5">
            {FILTER_PRESETS.map((p) => {
              const active = p.key === rangeKey;
              return (
                <Link
                  className={`inline-flex h-8 items-center rounded-full px-3 text-xs font-medium transition ${
                    active
                      ? "bg-primary text-[#f7f5ef]"
                      : "border border-border/70 bg-card text-foreground hover:bg-muted"
                  }`}
                  href={
                    (p.key === "all"
                      ? "/dashboard/payouts"
                      : `/dashboard/payouts?range=${p.key}`) as Route
                  }
                  key={p.key}
                >
                  {p.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Totals for the filtered range */}
        {batches.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-border/70 bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">Reports</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{batches.length}</p>
            </div>
            <div className="rounded-2xl border border-green-200 bg-green-50 px-4 py-3">
              <p className="text-xs text-green-700/80">Paid out</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-green-800">
                ${totalPaid.toFixed(2)}
              </p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-xs text-amber-700/80">Pending</p>
              <p className="mt-1 text-xl font-semibold tabular-nums text-amber-800">
                ${totalPending.toFixed(2)}
              </p>
            </div>
          </div>
        )}

        {batches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {allBatches.length === 0
              ? "No reports yet. Generate one above."
              : "No reports in that range — try a wider filter."}
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
