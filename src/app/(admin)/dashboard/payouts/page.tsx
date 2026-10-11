import type { Route } from "next";
import Link from "next/link";
import { ChevronDown } from "lucide-react";

import { isHistoricalPayoutReport } from "@/lib/services/cleaner-ledger";
import { listCleanerFinancialSummaries } from "@/lib/queries/cleaner-finance";
import { requireRole } from "@/lib/auth/session";
import { listUnpaidPayableJobs } from "@/lib/queries/assignments";
import { listPayoutBatches } from "@/lib/queries/payouts";
import { listActiveCleaners, listCleaners } from "@/lib/queries/team";
import { BulkMarkPaid } from "@/components/payouts/bulk-mark-paid";
import { CreatePayoutBatchForm } from "@/components/payouts/create-payout-batch-form";
import { formatInTimeZone } from "@/lib/ical/timezone";

const statusColors: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  approved: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

function formatDate(d: string) {
  return formatInTimeZone(d, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const FILTER_PRESETS: Array<{
  key: string;
  label: string;
  days: number | "all";
}> = [
  { key: "all", label: "All", days: "all" },
  { key: "30", label: "Last 30 days", days: 30 },
  { key: "90", label: "Last 90 days", days: 90 },
  { key: "365", label: "Last 12 months", days: 365 },
];

type PayoutsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PayoutsPage({ searchParams }: PayoutsPageProps) {
  const profile = await requireRole(["owner", "admin", "supervisor"]);
  // Mutations here are owner/admin-only; supervisors get a read-only view.
  const canManage = profile.role === "owner" || profile.role === "admin";
  const params = (await searchParams) ?? {};
  const rangeKey = typeof params.range === "string" ? params.range : "all";

  const [allBatches, cleaners, unpaidJobs, allCleaners] = await Promise.all([
    listPayoutBatches(),
    listActiveCleaners(),
    listUnpaidPayableJobs(),
    listCleaners(),
  ]);

  const finances = await listCleanerFinancialSummaries(
    allCleaners.map((cleaner) => cleaner.id),
  );
  const financeByCleaner = new Map(
    finances.map((item) => [item.cleanerId, item]),
  );
  const accounts = finances.flatMap((item) =>
    item.ledger ? [item.ledger.account] : [],
  );

  // Filter in-memory — payout_batches is a small table per owner.
  const preset =
    FILTER_PRESETS.find((p) => p.key === rangeKey) ?? FILTER_PRESETS[0];
  const cutoff =
    preset.days === "all"
      ? null
      : // eslint-disable-next-line react-hooks/purity -- server component renders once per request
        new Date(Date.now() - preset.days * 24 * 60 * 60 * 1000);
  const batches = cutoff
    ? allBatches.filter((b) => new Date(b.period_end) >= cutoff)
    : allBatches;

  const isHistorical = (batch: (typeof batches)[number]) =>
    isHistoricalPayoutReport(batch, accounts);
  const currentBatches = batches.filter((b) => !isHistorical(b));

  const reportRow = (b: (typeof batches)[number], historical = false) => (
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
          className={`rounded-full px-3 py-1 text-xs font-medium ${historical ? "bg-muted text-muted-foreground" : (statusColors[b.status] ?? "bg-gray-100 text-gray-700")}`}
        >
          {historical ? "Archived report" : b.status}
        </span>
      </div>
    </Link>
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
            Finance
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">
            Payouts
          </h1>
        </div>
      </div>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Cleaner balances</h2>
        <p className="text-sm text-muted-foreground">
          Recorded amounts due, including reconciled ledgers and unpaid
          completed work.
        </p>
        {allCleaners.map((cleaner) => {
          const ledger = financeByCleaner.get(cleaner.id)?.ledger;
          const balance = financeByCleaner.get(cleaner.id)?.balance ?? 0;
          return (
            <div
              key={cleaner.id}
              className="flex min-h-16 flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card p-4"
            >
              <div>
                <p className="font-semibold">
                  {ledger?.account.label ?? cleaner.full_name}
                  {!cleaner.active && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      Inactive
                    </span>
                  )}
                </p>
                {ledger ? (
                  <Link
                    className="mt-1 inline-flex min-h-9 items-center text-sm text-primary underline"
                    href={`/dashboard/payouts/ledger/${cleaner.id}` as Route}
                  >
                    View ledger · through{" "}
                    {formatDate(
                      ledger.account.reconciled_through + "T12:00:00Z",
                    )}
                  </Link>
                ) : (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Completed jobs awaiting payment
                  </p>
                )}
              </div>
              <span className="font-semibold tabular-nums">
                {Math.abs(balance).toLocaleString("en-US", {
                  style: "currency",
                  currency: "USD",
                })}{" "}
                {balance < 0 ? "credit" : "due"}
              </span>
            </div>
          );
        })}
        {allCleaners.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No cleaners added yet.
          </p>
        )}
      </section>
      {/* Quick-pay: individual jobs (Zelle/Venmo/cash) outside the batch flow */}
      {canManage && <BulkMarkPaid jobs={unpaidJobs} />}

      {/* Create new report */}
      {canManage && (
        <details className="group rounded-2xl border border-border/70 bg-card">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-6 py-4 font-semibold [&::-webkit-details-marker]:hidden">
            Generate a payout report
            <ChevronDown
              className="h-5 w-5 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
          </summary>
          <div className="border-t border-border/60 p-6">
            <p className="mb-4 text-sm text-muted-foreground">
              Pick a cleaner and date range. We&apos;ll pull approved jobs,
              total the payouts, and let you review, mark paid, or export. Jobs
              already reconciled in a ledger stay in that ledger and are
              excluded from new job reports.
            </p>
            <CreatePayoutBatchForm cleaners={cleaners} />
          </div>
        </details>
      )}

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
                      ? "bg-primary text-primary-foreground"
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

        <p className="text-sm text-muted-foreground">
          Reports group jobs for review and payment. Cleaner balances above show
          the amount currently due.
        </p>
        {currentBatches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No current reports in this date range.
          </p>
        ) : (
          currentBatches.map((batch) => reportRow(batch))
        )}
        {batches.some(isHistorical) && (
          <details className="group rounded-2xl border border-border/70 bg-card">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 font-semibold [&::-webkit-details-marker]:hidden">
              Historical report archive · {batches.filter(isHistorical).length}
              <ChevronDown
                className="h-5 w-5 transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
            </summary>
            <div className="space-y-3 border-t border-border/60 p-4">
              <p className="text-sm text-muted-foreground">
                Reference copies from before ledger reconciliation. Their
                reported amounts and paid labels do not determine today’s
                balance. Use the cleaner ledger for confirmed payments.
              </p>
              {batches
                .filter(isHistorical)
                .map((batch) => reportRow(batch, true))}
            </div>
          </details>
        )}
      </section>
    </main>
  );
}
