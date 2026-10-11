import Link from "next/link";
import { CleanerLedger } from "@/components/cleaner/cleaner-ledger";
import { getCleanerFinancialSummary } from "@/lib/queries/cleaner-finance";
import { CheckCircle2, Clock3, FileText, Wallet } from "lucide-react";

import { requireRole } from "@/lib/auth/session";
import { formatInTimeZone } from "@/lib/ical/timezone";


function money(n: number) {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function shortDate(d?: string | null, timeZone?: string | null) {
  if (!d) return "—";
  return formatInTimeZone(
    d,
    { month: "short", day: "numeric", year: "numeric" },
    timeZone,
  );
}

type PayStatus = "paid" | "report" | "awaiting";

const PAY_STATUS: Record<
  PayStatus,
  { label: string; icon: typeof Clock3; tone: string }
> = {
  paid: {
    label: "Paid",
    icon: CheckCircle2,
    tone: "bg-green-100 text-green-700",
  },
  report: {
    label: "In payout report",
    icon: FileText,
    tone: "bg-muted text-foreground/70",
  },
  awaiting: {
    label: "Awaiting payout",
    icon: Clock3,
    tone: "bg-secondary/40 text-primary",
  },
};

/** One job line: name + date + status on the left, amount on the right. */
function PayRow({
  name,
  date,
  amount,
  status,
}: {
  name: string;
  date: string;
  amount: number;
  status: PayStatus;
}) {
  const { label, icon: Icon, tone } = PAY_STATUS[status];
  return (
    <li className="flex items-center justify-between gap-3 px-4 py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tone}`}
          aria-hidden="true"
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">
            {name}
          </p>
          <p className="text-xs text-muted-foreground">
            {date} · {label}
          </p>
        </div>
      </div>
      <span className="shrink-0 text-base font-semibold tabular-nums">
        {money(amount)}
      </span>
    </li>
  );
}

export default async function CleanerPayPage() {
  const profile = await requireRole([
    "cleaner",
    "owner",
    "admin",
    "supervisor",
  ]);
  const financial = await getCleanerFinancialSummary(profile.id);
  const { ledger, entries, jobsOutsideReports, summary } = financial;
  const totalDue = financial.balance;
  const awaiting = jobsOutsideReports.filter((a) => !a.paid_at);
  const settled = [
    ...entries.map((entry) => ({
      id: entry.id,
      name: entry.properties?.name ?? "Property",
      dueAt: entry.assignments?.due_at ?? null,
      timeZone: entry.properties?.timezone,
      amount: Number(entry.amount),
      status: (entry.paid_at ? "paid" : "report") as PayStatus,
    })),
    ...jobsOutsideReports
      .filter((a) => a.paid_at)
      .map((a) => ({
        id: a.id,
        name: a.properties?.name ?? "Property",
        dueAt: a.due_at,
        timeZone: a.properties?.timezone,
        amount: Number(a.fixed_payout_amount ?? 0),
        status: "paid" as PayStatus,
      })),
  ].sort((a, b) => (b.dueAt ?? "").localeCompare(a.dueAt ?? ""));

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-5 px-5 py-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Your pay</h1>
      </header>

      <nav aria-label="Pay page" className="flex flex-wrap gap-3 text-sm">
        {ledger && (
          <a
            href="#ledger"
            className="inline-flex min-h-11 items-center underline"
          >
            Monthly ledger
          </a>
        )}
        <Link
          href="/jobs/history"
          className="inline-flex min-h-11 items-center underline"
        >
          Job history
        </Link>
      </nav>
      <section
        className="border-y border-border py-5"
        aria-label="Current balance"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">
            {totalDue < 0 ? "Credit balance" : "Total amount due"}
          </h2>
          <p className="text-3xl font-semibold tabular-nums text-primary">
            {money(Math.abs(totalDue))}
          </p>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Completed work and extras, less confirmed payments.
          {ledger
            ? " Includes the reconciled ledger plus completed work after the reconciliation date."
            : " Includes unpaid work in payout reports."}
        </p>
      </section>
      {ledger && (
        <div id="ledger">
          <CleanerLedger account={ledger.account} entries={ledger.entries} />
        </div>
      )}
      {(!ledger || entries.length > 0 || jobsOutsideReports.length > 0) && (
        <>
          {/* Hero — completed work that isn't in a payout report or marked paid yet */}
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Wallet className="h-4 w-4" aria-hidden="true" />
              Completed work outside reports
            </div>
            <p className="mt-2 text-3xl font-semibold tracking-tight text-primary tabular-nums">
              {money(summary.awaitingTotal)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {awaiting.length} completed{" "}
              {awaiting.length === 1 ? "job" : "jobs"} not in a payout report
              yet
            </p>

            <dl className="mt-5 grid grid-cols-3 gap-2 border-t border-border/60 pt-4 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Paid</dt>
                <dd className="font-semibold tabular-nums">
                  {money(summary.paidTotal)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">In reports</dt>
                <dd className="font-semibold tabular-nums">
                  {money(summary.inReportsTotal)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Earned</dt>
                <dd className="font-semibold tabular-nums">
                  {money(summary.projectedTotal)}
                </dd>
              </div>
            </dl>
          </section>

          {/* Awaiting payout */}
          <section className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-base font-semibold">Awaiting payout</h2>
              <span className="rounded-full bg-secondary/40 px-2.5 py-0.5 text-xs font-semibold text-primary">
                {awaiting.length}
              </span>
            </div>
            {awaiting.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card/70 px-6 py-8 text-center">
                <CheckCircle2
                  className="mx-auto h-9 w-9 text-green-500/60"
                  aria-hidden="true"
                />
                <p className="mt-2 font-semibold">
                  No jobs outside payout reports
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Check the total amount due above for any remaining balance.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
                {awaiting.map((a) => (
                  <PayRow
                    key={a.id}
                    name={a.properties?.name ?? "Property"}
                    date={shortDate(a.due_at, a.properties?.timezone)}
                    amount={Number(a.fixed_payout_amount ?? 0)}
                    status="awaiting"
                  />
                ))}
              </ul>
            )}
          </section>

          {/* Reports + paid history */}
          <section className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <h2 className="text-base font-semibold">Payout history</h2>
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground/70">
                {settled.length}
              </span>
            </div>
            {settled.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card/70 px-6 py-8 text-center">
                <Wallet
                  className="mx-auto h-9 w-9 text-muted-foreground/40"
                  aria-hidden="true"
                />
                <p className="mt-2 font-semibold">No payouts yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Jobs in approved payout reports or marked paid will show up
                  here.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
                {settled.map((row) => (
                  <PayRow
                    key={row.id}
                    name={row.name}
                    date={shortDate(row.dueAt, row.timeZone)}
                    amount={row.amount}
                    status={row.status}
                  />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
