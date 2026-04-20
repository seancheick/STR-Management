import { CheckCircle2, RefreshCw, TrendingUp, Banknote, UserMinus } from "lucide-react";

import type { WeeklyRecap } from "@/lib/queries/recap";

function formatRate(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
}

function rangeLabel(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(s)} – ${fmt(e)}`;
}

type Props = {
  recap: WeeklyRecap;
};

/**
 * "Last 7 days at a glance" card — turnover volume, re-cleans, on-time rate,
 * payouts, and a forward-looking unassigned count. Renders only when there's
 * something worth showing (i.e. at least one completed assignment).
 */
export function WeeklyRecapCard({ recap }: Props) {
  if (recap.completed === 0 && recap.reCleans === 0 && recap.totalPaid === 0) {
    return null;
  }

  return (
    <section className="rounded-2xl border border-border/70 bg-card px-6 py-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">Last 7 days</h2>
        <span className="text-xs text-muted-foreground">
          {rangeLabel(recap.windowStart, recap.windowEnd)}
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat
          icon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
          label="Turnovers"
          value={String(recap.completed)}
          tone="green"
        />
        <Stat
          icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
          label="On time"
          value={formatRate(recap.onTimeRate)}
          tone={
            recap.onTimeRate === null
              ? "neutral"
              : recap.onTimeRate >= 0.95
                ? "green"
                : recap.onTimeRate >= 0.8
                  ? "amber"
                  : "red"
          }
        />
        <Stat
          icon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
          label="Re-cleans"
          value={String(recap.reCleans)}
          tone={recap.reCleans > 0 ? "red" : "neutral"}
        />
        <Stat
          icon={<Banknote className="h-4 w-4" aria-hidden="true" />}
          label="Paid out"
          value={`$${recap.totalPaid.toFixed(2)}`}
          tone="neutral"
        />
        <Stat
          icon={<UserMinus className="h-4 w-4" aria-hidden="true" />}
          label="Unassigned ahead"
          value={String(recap.upcomingUnassigned)}
          tone={recap.upcomingUnassigned > 0 ? "amber" : "neutral"}
        />
      </dl>
    </section>
  );
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "green" | "amber" | "red" | "neutral";
}) {
  const color: Record<string, string> = {
    green: "text-green-700",
    amber: "text-amber-700",
    red: "text-red-700",
    neutral: "text-foreground",
  };
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="text-muted-foreground/70">{icon}</span>
        {label}
      </dt>
      <dd className={`mt-1 text-2xl font-semibold tabular-nums ${color[tone]}`}>
        {value}
      </dd>
    </div>
  );
}
