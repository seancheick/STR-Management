import type { Route } from "next";
import Link from "next/link";

import type { AssignmentScheduleRecord } from "@/lib/queries/assignments";

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
  assignments: AssignmentScheduleRecord[];
  /** ISO strings for each of the 7 days (midnight UTC) */
  days: string[];
};

// ─── Status → dot colour ──────────────────────────────────────────────────────

function statusDot(status: string): string {
  const map: Record<string, string> = {
    unassigned:               "bg-amber-400",
    needs_reclean:            "bg-amber-400",
    assigned:                 "bg-emerald-500",
    confirmed:                "bg-indigo-400",
    in_progress:              "bg-orange-400",
    completed_pending_review: "bg-purple-400",
    approved:                 "bg-green-400",
  };
  return map[status] ?? "bg-muted-foreground/40";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isSameDay(a: Date, b: Date) {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

function dayNum(d: Date): number {
  return d.getUTCDate();
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WeekPreviewStrip({ assignments, days }: Props) {
  const today = new Date();

  // Group assignments by day index
  const byDay: AssignmentScheduleRecord[][] = days.map((dayIso) => {
    const day = new Date(dayIso);
    return assignments.filter((a) => isSameDay(new Date(a.due_at), day));
  });

  // Count urgent (unassigned + overdue) across the week
  const urgentCount = assignments.filter(
    (a) => a.status === "unassigned" || a.status === "needs_reclean",
  ).length;

  return (
    <section aria-label="Week preview">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">This week</h2>
        <Link
          href={"/dashboard/schedule" as Route}
          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline underline-offset-2"
        >
          Full schedule →
        </Link>
      </div>

      {urgentCount > 0 && (
        <p className="mb-2 text-xs font-medium text-amber-600">
          {urgentCount} unassigned job{urgentCount !== 1 ? "s" : ""} this week
        </p>
      )}

      <div className="grid grid-cols-7 gap-1.5 rounded-2xl border border-border/70 bg-card p-3">
        {days.map((dayIso, i) => {
          const day = new Date(dayIso);
          const isToday = isSameDay(day, today);
          const dayJobs = byDay[i];
          const hasUnassigned = dayJobs.some(
            (a) => a.status === "unassigned" || a.status === "needs_reclean",
          );

          return (
            <Link
              key={dayIso}
              href={"/dashboard/schedule" as Route}
              className={`group flex flex-col items-center gap-1.5 rounded-xl px-1 py-2.5 transition hover:bg-muted ${
                isToday ? "bg-primary/8 ring-1 ring-primary/20" : ""
              }`}
            >
              {/* Day label */}
              <span
                className={`text-[10px] font-semibold uppercase tracking-wide ${
                  isToday ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {dayLabel(day)}
              </span>

              {/* Day number */}
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold tabular-nums ${
                  isToday
                    ? "bg-primary text-[#f7f5ef]"
                    : "text-foreground group-hover:bg-muted-foreground/10"
                }`}
              >
                {dayNum(day)}
              </span>

              {/* Job dots */}
              <div className="flex min-h-[1rem] flex-wrap items-center justify-center gap-0.5">
                {dayJobs.length === 0 ? (
                  <span className="h-1.5 w-1.5 rounded-full bg-transparent" />
                ) : dayJobs.length <= 4 ? (
                  dayJobs.map((a) => (
                    <span
                      key={a.id}
                      className={`h-1.5 w-1.5 rounded-full ${statusDot(a.status)}`}
                      title={`${a.properties?.name ?? "Property"} · ${a.status}`}
                    />
                  ))
                ) : (
                  <>
                    {dayJobs.slice(0, 3).map((a) => (
                      <span
                        key={a.id}
                        className={`h-1.5 w-1.5 rounded-full ${statusDot(a.status)}`}
                      />
                    ))}
                    <span className="text-[9px] font-bold text-muted-foreground">
                      +{dayJobs.length - 3}
                    </span>
                  </>
                )}
              </div>

              {/* Unassigned warning */}
              {hasUnassigned && (
                <span className="h-1 w-1 rounded-full bg-amber-400" aria-label="Has unassigned jobs" />
              )}
            </Link>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1">
        {[
          { dot: "bg-amber-400",  label: "Unassigned" },
          { dot: "bg-blue-400",   label: "Assigned" },
          { dot: "bg-orange-400", label: "In progress" },
          { dot: "bg-purple-400", label: "Pending review" },
          { dot: "bg-green-400",  label: "Ready" },
        ].map(({ dot, label }) => (
          <div key={label} className="flex items-center gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
            <span className="text-[10px] text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
