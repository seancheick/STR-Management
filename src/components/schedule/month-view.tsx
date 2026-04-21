"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Clock, Sparkles } from "lucide-react";

import type { AssignmentScheduleRecord } from "@/lib/queries/assignments";
import type { PropertyRecord } from "@/lib/queries/properties";
import type { TeamMemberRecord } from "@/lib/queries/team";
import { isTightTurnover } from "@/lib/domain/assignments";
import { AssignmentDrawerSheet } from "@/components/assignments/assignment-drawer-sheet";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MonthViewProps = {
  assignments: AssignmentScheduleRecord[];
  properties: PropertyRecord[];
  cleaners: TeamMemberRecord[];
  monthDays: string[]; // ISO strings for every day in the month
  monthOffset: number;
  view: "week" | "month";
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Stable per-cleaner color: hash the cleaner_id → pick a palette slot.
// Keeps the same cleaner's pills the same colour across the month.
const CLEANER_PALETTE = [
  { bg: "bg-blue-100", ring: "ring-blue-300", text: "text-blue-900", dot: "bg-blue-500" },
  { bg: "bg-orange-100", ring: "ring-orange-300", text: "text-orange-900", dot: "bg-orange-500" },
  { bg: "bg-green-100", ring: "ring-green-300", text: "text-green-900", dot: "bg-green-500" },
  { bg: "bg-pink-100", ring: "ring-pink-300", text: "text-pink-900", dot: "bg-pink-500" },
  { bg: "bg-purple-100", ring: "ring-purple-300", text: "text-purple-900", dot: "bg-purple-500" },
  { bg: "bg-teal-100", ring: "ring-teal-300", text: "text-teal-900", dot: "bg-teal-500" },
  { bg: "bg-indigo-100", ring: "ring-indigo-300", text: "text-indigo-900", dot: "bg-indigo-500" },
];

function paletteFor(cleanerId: string | null): (typeof CLEANER_PALETTE)[number] {
  if (!cleanerId) {
    return {
      bg: "bg-amber-50",
      ring: "ring-amber-300",
      text: "text-amber-900",
      dot: "bg-amber-400",
    };
  }
  let hash = 0;
  for (let i = 0; i < cleanerId.length; i++) hash = (hash * 31 + cleanerId.charCodeAt(i)) | 0;
  return CLEANER_PALETTE[Math.abs(hash) % CLEANER_PALETTE.length];
}

function shortTime(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso)
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .replace(" ", "")
    .replace(":00", "");
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function MonthView({
  assignments,
  properties,
  cleaners,
  monthDays,
  monthOffset,
  view,
}: MonthViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId) return;
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectedId(null);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedId]);

  const today = new Date();
  const monthStart = new Date(monthDays[0]);
  const monthLabel = monthStart.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  // Pad the grid so Sunday is always the first column.
  const gridCells = useMemo(() => {
    const firstDow = monthStart.getDay(); // 0 Sun
    const leading: Date[] = [];
    for (let i = firstDow; i > 0; i--) {
      const d = new Date(monthStart);
      d.setDate(monthStart.getDate() - i);
      leading.push(d);
    }
    const monthDates = monthDays.map((iso) => new Date(iso));
    const lastDate = monthDates[monthDates.length - 1];
    const trailing: Date[] = [];
    const pad = 6 - lastDate.getDay();
    for (let i = 1; i <= pad; i++) {
      const d = new Date(lastDate);
      d.setDate(lastDate.getDate() + i);
      trailing.push(d);
    }
    return [...leading, ...monthDates, ...trailing];
  }, [monthDays, monthStart]);

  // Group by day; a single assignment can appear on two days (checkout day + due day)
  const byDay = useMemo(() => {
    const map = new Map<string, AssignmentScheduleRecord[]>();
    for (const a of assignments) {
      const due = new Date(a.due_at);
      const key = dayKey(due);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return map;
  }, [assignments]);

  const propertyNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of properties) m.set(p.id, p.name);
    return m;
  }, [properties]);

  const selectedAssignment = selectedId
    ? assignments.find((a) => a.id === selectedId) ?? null
    : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Header: month navigation + view toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            aria-label="Previous month"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card text-sm font-medium transition hover:bg-muted"
            href={`?view=month&month=${monthOffset - 1}` as Route}
          >
            ←
          </Link>
          <span className="min-w-[160px] text-center text-sm font-semibold">{monthLabel}</span>
          <Link
            aria-label="Next month"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card text-sm font-medium transition hover:bg-muted"
            href={`?view=month&month=${monthOffset + 1}` as Route}
          >
            →
          </Link>
        </div>

        <div className="flex items-center gap-2">
          <Link
            className={`inline-flex h-9 items-center rounded-full px-4 text-sm font-medium transition ${
              view === "week"
                ? "bg-primary text-[#f7f5ef]"
                : "border border-border/70 bg-card text-foreground hover:bg-muted"
            }`}
            href="?week=0"
          >
            Week
          </Link>
          <Link
            className={`inline-flex h-9 items-center rounded-full px-4 text-sm font-medium transition ${
              view === "month"
                ? "bg-primary text-[#f7f5ef]"
                : "border border-border/70 bg-card text-foreground hover:bg-muted"
            }`}
            href={`?view=month&month=${monthOffset}` as Route}
          >
            Month
          </Link>
          <Link
            className="inline-flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-[#f7f5ef] transition hover:opacity-90"
            href="/dashboard/assignments/new"
          >
            + New job
          </Link>
        </div>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-[1px] overflow-hidden rounded-t-2xl border border-border/60 bg-border/60">
        {WEEKDAY_LABELS.map((label) => (
          <div
            className="bg-card px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
            key={label}
          >
            {label}
          </div>
        ))}
      </div>

      {/* 7-col month grid */}
      <div className="grid grid-cols-7 gap-[1px] overflow-hidden rounded-b-2xl border border-t-0 border-border/60 bg-border/60">
        {gridCells.map((cell, idx) => {
          const inMonth = cell.getMonth() === monthStart.getMonth();
          const isToday = sameLocalDay(cell, today);
          const dayJobs = byDay.get(dayKey(cell)) ?? [];

          return (
            <div
              className={`flex min-h-[120px] flex-col gap-1 bg-card p-2 transition ${
                inMonth ? "" : "bg-muted/30 text-muted-foreground/70"
              } ${isToday ? "ring-2 ring-primary/40 ring-inset" : ""}`}
              key={idx}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`inline-flex h-6 min-w-[1.5rem] items-center justify-center text-[11px] font-semibold tabular-nums ${
                    isToday
                      ? "rounded-full bg-primary px-1.5 text-[#f7f5ef]"
                      : inMonth
                        ? "text-foreground"
                        : "text-muted-foreground/60"
                  }`}
                >
                  {cell.getDate()}
                </span>
                {dayJobs.length > 3 && (
                  <span className="text-[10px] font-medium text-muted-foreground">
                    +{dayJobs.length - 3}
                  </span>
                )}
              </div>

              <div className="flex flex-col gap-1">
                {dayJobs.slice(0, 3).map((a) => (
                  <CalendarPill
                    assignment={a}
                    key={a.id}
                    onClick={() => setSelectedId(a.id)}
                    propertyName={propertyNameById.get(a.property_id)}
                  />
                ))}
                {dayJobs.length > 3 && (
                  <button
                    className="text-left text-[10px] font-medium text-primary hover:underline"
                    onClick={() => setSelectedId(dayJobs[3].id)}
                    type="button"
                  >
                    + {dayJobs.length - 3} more…
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11px] text-muted-foreground">
        <span className="font-medium">Legend:</span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" /> Unassigned
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" /> Tight turn / re-clean
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-green-500" aria-hidden="true" /> Approved
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-blue-500" aria-hidden="true" /> Cleaner pill (per-person colour)
        </span>
      </div>

      {/* Slide-in edit sheet */}
      <AssignmentDrawerSheet
        assignment={selectedAssignment}
        cleaners={cleaners}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}

// ─── Pill inside a day cell ───────────────────────────────────────────────────

function CalendarPill({
  assignment,
  onClick,
  propertyName,
}: {
  assignment: AssignmentScheduleRecord;
  onClick: () => void;
  propertyName: string | undefined;
}) {
  const tight = isTightTurnover(assignment.checkout_at, assignment.due_at);
  const needsReclean = assignment.status === "needs_reclean";
  const approved = assignment.status === "approved";
  const cleanerFirst = assignment.cleaners?.full_name?.split(" ")[0] ?? null;

  // Status overrides cleaner colour for attention states
  let paletteClass: string;
  let icon: React.ReactNode = <Sparkles className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />;
  let label: string;

  if (tight || needsReclean) {
    paletteClass = "bg-red-50 ring-red-300 text-red-900";
    icon = <Clock className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />;
    label = needsReclean ? "Re-clean" : cleanerFirst ?? "Tight turn";
  } else if (approved) {
    paletteClass = "bg-green-50 ring-green-300 text-green-900";
    label = cleanerFirst ?? "Ready";
  } else if (!assignment.cleaner_id) {
    paletteClass = "bg-amber-50 ring-amber-300 text-amber-900";
    label = "Assign →";
  } else {
    const p = paletteFor(assignment.cleaner_id);
    paletteClass = `${p.bg} ${p.ring} ${p.text}`;
    label = cleanerFirst ?? "Assigned";
  }

  const time = shortTime(assignment.due_at);

  return (
    <button
      className={`flex w-full items-center gap-1 truncate rounded-md px-1.5 py-1 text-left text-[10px] font-semibold leading-tight ring-1 transition hover:shadow-sm ${paletteClass}`}
      onClick={onClick}
      title={`${propertyName ?? "Property"} · ${label} · ${time}`}
      type="button"
    >
      {icon}
      <span className="truncate tabular-nums">{time}</span>
      <span className="truncate font-medium opacity-90">· {label}</span>
    </button>
  );
}
