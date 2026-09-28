import { CheckCircle2, Clock3, FileText, Wallet } from "lucide-react";

import { requireRole } from "@/lib/auth/session";
import { formatInTimeZone } from "@/lib/ical/timezone";
import {
  listMyPayoutEntries,
  listPendingCleanerPayoutAssignments,
} from "@/lib/queries/payouts";
import { calculateCleanerPaySummary } from "@/lib/services/cleaner-portal";

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
  return formatInTimeZone(d, { month: "short", day: "numeric", year: "numeric" }, timeZone);
}

type PayStatus = "paid" | "report" | "awaiting";

const PAY_STATUS: Record<PayStatus, { label: string; icon: typeof Clock3; tone: string }> = {
  paid: { label: "Paid", icon: CheckCircle2, tone: "bg-green-100 text-green-700" },
  report: { label: "In payout report", icon: FileText, tone: "bg-muted text-foreground/70" },
  awaiting: { label: "Awaiting payout", icon: Clock3, tone: "bg-secondary/40 text-primary" },
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
          <p className="truncate text-sm font-semibold text-foreground">{name}</p>
          <p className="text-xs text-muted-foreground">
            {date} · {label}
          </p>
        </div>
      </div>
      <span className="shrink-0 text-base font-semibold tabular-nums">{money(amount)}</span>
    </li>
  );
}

export default async function CleanerPayPage() {
  const profile = await requireRole(["cleaner", "owner", "admin", "supervisor"]);
  const [rawEntries, jobsOutsideReports] = await Promise.all([
    listMyPayoutEntries(profile.id),
    listPendingCleanerPayoutAssignments(profile.id),
  ]);
  // A job marked paid on the schedule stamps the assignment, not the entry.
  const entries = rawEntries.map((entry) => ({
    ...entry,
    paid_at: entry.paid_at ?? entry.assignments?.paid_at ?? null,
  }));
  const summary = calculateCleanerPaySummary({
    payoutEntries: entries,
    pendingAssignments: jobsOutsideReports,
  });

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
        <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
          Hi, {profile.full_name.split(" ")[0]}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">Your pay</h1>
      </header>

      {/* Hero — completed work that isn't in a payout report or marked paid yet */}
      <section className="rounded-3xl border border-border/70 bg-card p-6 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Wallet className="h-4 w-4" aria-hidden="true" />
          Awaiting payout
        </div>
        <p className="mt-2 text-5xl font-bold tracking-tight text-primary tabular-nums">
          {money(summary.awaitingTotal)}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {awaiting.length} completed {awaiting.length === 1 ? "job" : "jobs"} not in a payout
          report yet
        </p>

        <dl className="mt-5 grid grid-cols-3 gap-2 border-t border-border/60 pt-4 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Paid</dt>
            <dd className="font-semibold tabular-nums">{money(summary.paidTotal)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">In reports</dt>
            <dd className="font-semibold tabular-nums">{money(summary.inReportsTotal)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Earned</dt>
            <dd className="font-semibold tabular-nums">{money(summary.projectedTotal)}</dd>
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
            <CheckCircle2 className="mx-auto h-9 w-9 text-green-500/60" aria-hidden="true" />
            <p className="mt-2 font-semibold">All caught up</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Every completed job is in a payout report or marked paid.
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
            <Wallet className="mx-auto h-9 w-9 text-muted-foreground/40" aria-hidden="true" />
            <p className="mt-2 font-semibold">No payouts yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Jobs in approved payout reports or marked paid will show up here.
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
    </main>
  );
}
