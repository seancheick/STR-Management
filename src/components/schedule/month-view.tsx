"use client";

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";

import type { AssignmentScheduleRecord } from "@/lib/queries/assignments";
import type { PropertyRecord } from "@/lib/queries/properties";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MonthViewProps = {
  assignments: AssignmentScheduleRecord[];
  properties: PropertyRecord[];
  monthDays: string[]; // ISO strings for every day in the month
  monthOffset: number;
  view: "week" | "month";
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_DOT: Record<string, string> = {
  unassigned: "bg-amber-400",
  needs_reclean: "bg-amber-400",
  assigned: "bg-blue-400",
  confirmed: "bg-indigo-400",
  in_progress: "bg-orange-400",
  completed_pending_review: "bg-purple-400",
  approved: "bg-green-400",
};

const STATUS_LABEL: Record<string, string> = {
  unassigned: "Unassigned",
  needs_reclean: "Re-clean",
  assigned: "Assigned",
  confirmed: "Confirmed",
  in_progress: "In Progress",
  completed_pending_review: "Pending Review",
  approved: "Ready",
};

const STATUS_CHIP: Record<string, string> = {
  unassigned: "bg-amber-50 border-amber-300 text-amber-700",
  needs_reclean: "bg-amber-50 border-amber-300 text-amber-700",
  assigned: "bg-blue-50 border-blue-200 text-blue-700",
  confirmed: "bg-indigo-50 border-indigo-200 text-indigo-700",
  in_progress: "bg-orange-50 border-orange-200 text-orange-700",
  completed_pending_review: "bg-purple-50 border-purple-200 text-purple-700",
  approved: "bg-green-50 border-green-200 text-green-700",
};

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Day cell ─────────────────────────────────────────────────────────────────

function DayCell({
  date,
  assignments,
  isSelected,
  onClick,
}: {
  date: Date;
  assignments: AssignmentScheduleRecord[];
  isSelected: boolean;
  onClick: () => void;
}) {
  const today = new Date();
  const isToday = isSameDay(date, today);
  const hasUnassigned = assignments.some(
    (a) => a.status === "unassigned" || a.status === "needs_reclean",
  );
  const visible = assignments.slice(0, 3);
  const overflow = assignments.length - 3;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex min-h-[72px] w-full flex-col items-start gap-1 rounded-xl p-2 text-left transition-all duration-150 ${
        isSelected
          ? "bg-primary/10 ring-2 ring-primary/40"
          : "hover:bg-muted/60"
      }`}
    >
      {/* Day number */}
      <span
        className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
          isToday
            ? "bg-primary text-[#f7f5ef]"
            : "text-foreground"
        }`}
      >
        {date.getDate()}
      </span>

      {/* Dots */}
      {visible.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {visible.map((a) => (
            <span
              key={a.id}
              className={`h-2 w-2 rounded-full ${STATUS_DOT[a.status] ?? "bg-gray-400"}`}
              title={a.properties?.name ?? a.status}
              aria-hidden="true"
            />
          ))}
          {overflow > 0 && (
            <span className="text-[10px] text-muted-foreground">+{overflow} more</span>
          )}
        </div>
      )}

      {/* Unassigned indicator */}
      {hasUnassigned && (
        <span
          className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-400"
          aria-label="Has unassigned jobs"
        />
      )}
    </button>
  );
}

// ─── Expanded day panel ───────────────────────────────────────────────────────

function DayPanel({
  date,
  assignments,
}: {
  date: Date;
  assignments: AssignmentScheduleRecord[];
}) {
  const label = date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="col-span-7 rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-semibold">{label}</p>
        <Link
          href={`/dashboard/assignments/new?date=${date.toISOString().slice(0, 10)}` as Route}
          className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-[#f7f5ef] transition hover:opacity-90"
        >
          + New job
        </Link>
      </div>

      {assignments.length === 0 ? (
        <p className="text-sm text-muted-foreground">No assignments this day.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {assignments.map((a) => {
            const chipClass = STATUS_CHIP[a.status] ?? "bg-gray-50 border-gray-200 text-gray-600";
            const dotClass = STATUS_DOT[a.status] ?? "bg-gray-400";
            return (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-xl border border-border/60 bg-background px-3 py-2.5 text-sm"
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{a.properties?.name ?? "Property"}</p>
                  <p className="text-xs text-muted-foreground">
                    {a.cleaners?.full_name ?? "Unassigned"} · {formatTime(a.checkout_at ?? a.due_at)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${chipClass}`}
                >
                  {STATUS_LABEL[a.status] ?? a.status}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function MonthView({
  assignments,
  monthDays,
  monthOffset,
  view,
}: MonthViewProps) {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Derive month label from first day
  const firstDay = new Date(monthDays[0]);
  const monthLabel = firstDay.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Build a map: ISO date string (YYYY-MM-DD) -> assignments
  const dayMap = new Map<string, AssignmentScheduleRecord[]>();
  for (const a of assignments) {
    const key = new Date(a.due_at).toISOString().slice(0, 10);
    if (!dayMap.has(key)) dayMap.set(key, []);
    dayMap.get(key)!.push(a);
  }

  // Build calendar grid — pad start with empty cells to align day-of-week
  const startDow = firstDay.getDay(); // 0 = Sun
  const paddingCells = startDow; // number of empty cells before first day

  // Group days into weeks (rows of 7)
  type CalCell = { date: Date; iso: string } | null;
  const gridCells: CalCell[] = [
    ...Array.from({ length: paddingCells }, () => null),
    ...monthDays.map((iso) => ({ date: new Date(iso), iso: iso.slice(0, 10) })),
  ];
  // Pad end to complete last row
  while (gridCells.length % 7 !== 0) gridCells.push(null);

  const weeks: CalCell[][] = [];
  for (let i = 0; i < gridCells.length; i += 7) {
    weeks.push(gridCells.slice(i, i + 7));
  }

  const selectedDate = selectedDay ? new Date(selectedDay + "T00:00:00") : null;
  const selectedAssignments = selectedDay ? (dayMap.get(selectedDay) ?? []) : [];

  // Find which week row contains the selected day (to insert panel after it)
  const selectedWeekIdx = selectedDay
    ? weeks.findIndex((row) => row.some((c) => c?.iso === selectedDay))
    : -1;

  return (
    <div className="flex flex-col gap-4">
      {/* Header: month navigation + view toggle */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Link
            href={`?view=month&month=${monthOffset - 1}` as Route}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card text-sm font-medium transition hover:bg-muted"
            aria-label="Previous month"
          >
            ←
          </Link>
          <span className="min-w-[140px] text-center text-sm font-medium">{monthLabel}</span>
          <Link
            href={`?view=month&month=${monthOffset + 1}` as Route}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card text-sm font-medium transition hover:bg-muted"
            aria-label="Next month"
          >
            →
          </Link>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <Link
            href="?week=0"
            className={`inline-flex h-9 items-center rounded-full px-4 text-sm font-medium transition ${
              view === "week"
                ? "bg-primary text-[#f7f5ef]"
                : "border border-border/70 bg-card text-foreground hover:bg-muted"
            }`}
          >
            Week
          </Link>
          <Link
            href={`?view=month&month=${monthOffset}` as Route}
            className={`inline-flex h-9 items-center rounded-full px-4 text-sm font-medium transition ${
              view === "month"
                ? "bg-primary text-[#f7f5ef]"
                : "border border-border/70 bg-card text-foreground hover:bg-muted"
            }`}
          >
            Month
          </Link>
          <Link
            href="/dashboard/assignments/new"
            className="inline-flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-[#f7f5ef] transition hover:opacity-90"
          >
            + New job
          </Link>
        </div>
      </div>

      {/* Calendar */}
      <div className="rounded-2xl border border-border/70 bg-card shadow-sm">
        {/* Day-of-week header */}
        <div className="grid grid-cols-7 border-b border-border/60">
          {DAY_NAMES.map((name) => (
            <div
              key={name}
              className="px-2 py-2.5 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              {name}
            </div>
          ))}
        </div>

        {/* Weeks */}
        <div className="flex flex-col divide-y divide-border/40">
          {weeks.map((row, weekIdx) => (
            <>
              <div key={`week-${weekIdx}`} className="grid grid-cols-7 divide-x divide-border/30">
                {row.map((cell, colIdx) => {
                  if (!cell) {
                    return <div key={`empty-${colIdx}`} className="min-h-[72px] p-1" />;
                  }
                  const cellAssignments = dayMap.get(cell.iso) ?? [];
                  const isSelected = selectedDay === cell.iso;
                  return (
                    <div key={cell.iso} className="p-1">
                      <DayCell
                        date={cell.date}
                        assignments={cellAssignments}
                        isSelected={isSelected}
                        onClick={() =>
                          setSelectedDay(isSelected ? null : cell.iso)
                        }
                      />
                    </div>
                  );
                })}
              </div>
              {/* Expand panel below this week row if selected day is in it */}
              {selectedWeekIdx === weekIdx && selectedDate && (
                <div key={`panel-${weekIdx}`} className="p-3">
                  <DayPanel date={selectedDate} assignments={selectedAssignments} />
                </div>
              )}
            </>
          ))}
        </div>
      </div>

      {/* Status legend */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span className="font-medium">Legend:</span>
        {[
          "unassigned",
          "assigned",
          "in_progress",
          "completed_pending_review",
          "approved",
          "needs_reclean",
        ].map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${STATUS_DOT[s] ?? "bg-gray-400"}`} aria-hidden="true" />
            {STATUS_LABEL[s] ?? s}
          </span>
        ))}
      </div>
    </div>
  );
}
