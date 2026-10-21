"use client";

import { calendarListingId } from "@/lib/services/calendar-display";

import { useEffect, useState } from "react";
import type { Route } from "next";
import Link from "next/link";

import type { AssignmentScheduleRecord } from "@/lib/queries/assignments";
import type { PropertyRecord } from "@/lib/queries/properties";
import type { TeamMemberRecord } from "@/lib/queries/team";
import { AssignmentDrawerSheet } from "@/components/assignments/assignment-drawer-sheet";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDayLabel(date: Date) {
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function statusConfig(status: string) {
  const map: Record<string, { label: string; bg: string; border: string; text: string; dot: string }> = {
    unassigned:               { label: "Unassigned",        bg: "bg-amber-50",   border: "border-amber-300",  text: "text-amber-700",  dot: "bg-amber-400" },
    assigned:                 { label: "Assigned",          bg: "bg-emerald-50", border: "border-emerald-200",text: "text-emerald-700",dot: "bg-emerald-500" },
    confirmed:                { label: "Confirmed",         bg: "bg-indigo-50",  border: "border-indigo-200", text: "text-indigo-700", dot: "bg-indigo-400" },
    in_progress:              { label: "In Progress",       bg: "bg-orange-50",  border: "border-orange-200", text: "text-orange-700", dot: "bg-orange-400" },
    completed_pending_review: { label: "Pending Review",    bg: "bg-purple-50",  border: "border-purple-200", text: "text-purple-700", dot: "bg-purple-400" },
    approved:                 { label: "Ready",             bg: "bg-green-50",   border: "border-green-200",  text: "text-green-700",  dot: "bg-green-500" },
    needs_reclean:            { label: "Re-clean Needed",   bg: "bg-red-50",     border: "border-red-200",    text: "text-red-700",    dot: "bg-red-500" },
  };
  return map[status] ?? { label: status, bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-600", dot: "bg-gray-400" };
}

function propertyStatus(
  propertyId: string,
  assignments: AssignmentScheduleRecord[],
  today: Date,
): { label: string; color: string } {
  const todayAssignments = assignments.filter(
    (a) => calendarListingId(a) === propertyId && isSameDay(new Date(a.due_at), today),
  );
  if (todayAssignments.length === 0) return { label: "No jobs today", color: "text-muted-foreground" };
  const statuses = todayAssignments.map((a) => a.status);
  if (statuses.some((s) => s === "unassigned")) return { label: "Unassigned", color: "text-amber-600" };
  if (statuses.some((s) => s === "in_progress")) return { label: "In Progress", color: "text-orange-600" };
  if (statuses.some((s) => s === "needs_reclean")) return { label: "Re-clean", color: "text-red-600" };
  if (statuses.some((s) => s === "completed_pending_review")) return { label: "Pending Review", color: "text-purple-600" };
  if (statuses.every((s) => s === "approved")) return { label: "Ready", color: "text-green-600" };
  if (statuses.some((s) => s === "assigned" || s === "confirmed")) return { label: "Assigned", color: "text-emerald-600" };
  return { label: "Active", color: "text-primary" };
}

// ─── Assignment cell card ─────────────────────────────────────────────────────

function AssignmentCard({
  assignment,
  isSelected,
  onClick,
}: {
  assignment: AssignmentScheduleRecord;
  isSelected: boolean;
  onClick: () => void;
}) {
  const cfg = statusConfig(assignment.status);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full cursor-pointer rounded-xl border px-2.5 py-2 text-left text-xs transition-all duration-150 ${cfg.bg} ${cfg.border} ${cfg.text} ${
        isSelected ? "ring-2 ring-primary/50 ring-offset-1" : "hover:shadow-sm"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cfg.dot}`} aria-hidden="true" />
        <span className="truncate font-medium">{formatTime(assignment.checkout_at ?? assignment.due_at)}</span>
      </div>
      {assignment.cleaners ? (
        <p className="mt-0.5 truncate text-[11px] opacity-75">{assignment.cleaners.full_name}</p>
      ) : (
        <p className="mt-0.5 text-[11px] font-semibold opacity-90">Assign cleaner</p>
      )}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type ScheduleGridProps = {
  properties: PropertyRecord[];
  assignments: AssignmentScheduleRecord[];
  cleaners: TeamMemberRecord[];
  weekDays: string[]; // ISO date strings for the 7 days
  weekOffset: number;
  view: "week" | "month";
};

export function ScheduleGrid({
  properties,
  assignments,
  cleaners,
  weekDays,
  weekOffset,
  view,
}: ScheduleGridProps) {
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
  const selectedAssignment = assignments.find((a) => a.id === selectedId) ?? null;

  // Build assignment lookup: "propertyId|dayIndex" -> assignments[]
  const cellMap = new Map<string, AssignmentScheduleRecord[]>();
  for (const a of assignments) {
    const dayIndex = weekDays.findIndex((d) =>
      isSameDay(new Date(d), new Date(a.due_at)),
    );
    if (dayIndex >= 0) {
      const key = `${calendarListingId(a)}|${dayIndex}`;
      if (!cellMap.has(key)) cellMap.set(key, []);
      cellMap.get(key)!.push(a);
    }
  }

  const days = weekDays.map((d) => new Date(d));
  const weekLabel = `${days[0].toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  return (
    <div className="flex flex-col gap-4">
      {/* Week navigation */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Link
            href={`?week=${weekOffset - 1}` as Route}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card text-sm font-medium transition hover:bg-muted"
            aria-label="Previous week"
          >
            ←
          </Link>
          <span className="text-sm font-medium tabular-nums">{weekLabel}</span>
          <Link
            href={`?week=${weekOffset + 1}` as Route}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card text-sm font-medium transition hover:bg-muted"
            aria-label="Next week"
          >
            →
          </Link>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <Link
            href={`?week=${weekOffset}` as Route}
            className={`inline-flex h-9 items-center rounded-full px-4 text-sm font-medium transition ${
              view === "week"
                ? "bg-primary text-primary-foreground"
                : "border border-border/70 bg-card text-foreground hover:bg-muted"
            }`}
          >
            Week
          </Link>
          <Link
            href="?view=month"
            className={`inline-flex h-9 items-center rounded-full px-4 text-sm font-medium transition ${
              view === "month"
                ? "bg-primary text-primary-foreground"
                : "border border-border/70 bg-card text-foreground hover:bg-muted"
            }`}
          >
            Month
          </Link>
          <Link
            href="/dashboard/assignments/new"
            className="inline-flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            + New job
          </Link>
        </div>
      </div>

      {/* Grid + detail panel side by side */}
      <div className="flex gap-4">
        {/* Schedule grid */}
        <div className={`min-w-0 flex-1 overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-sm transition-all duration-200`}>
          <table className="w-full border-collapse text-sm" style={{ minWidth: "720px" }}>
            <thead>
              <tr className="border-b border-border/60">
                {/* Property column header */}
                <th className="w-44 border-r border-border/60 px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Property
                </th>
                {days.map((day, i) => {
                  const isToday = isSameDay(day, today);
                  return (
                    <th
                      key={i}
                      className={`border-r border-border/40 px-2 py-3 text-center text-xs font-medium uppercase tracking-wider last:border-r-0 ${
                        isToday
                          ? "bg-primary/5 text-primary"
                          : "text-muted-foreground"
                      }`}
                    >
                      {formatDayLabel(day)}
                      {isToday && (
                        <span className="ml-1 text-[10px] font-bold text-primary">●</span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {properties.map((property) => {
                const propStatus = propertyStatus(property.id, assignments, today);
                return (
                  <tr key={property.id} className="hover:bg-muted/30">
                    {/* Property name cell */}
                    <td className="border-r border-border/60 px-4 py-3 align-top">
                      <p className="font-medium leading-snug">{property.name}</p>
                      <p className={`mt-0.5 text-xs ${propStatus.color}`}>{propStatus.label}</p>
                    </td>
                    {/* Day cells */}
                    {days.map((day, dayIndex) => {
                      const key = `${property.id}|${dayIndex}`;
                      const cell = cellMap.get(key) ?? [];
                      const isToday = isSameDay(day, today);
                      return (
                        <td
                          key={dayIndex}
                          className={`border-r border-border/40 px-2 py-2 align-top last:border-r-0 ${isToday ? "bg-primary/[0.03]" : ""}`}
                        >
                          <div className="flex flex-col gap-1">
                            {cell.map((a) => (
                              <AssignmentCard
                                key={a.id}
                                assignment={a}
                                isSelected={selectedId === a.id}
                                onClick={() =>
                                  setSelectedId(selectedId === a.id ? null : a.id)
                                }
                              />
                            ))}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {properties.length === 0 && (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-10 text-center text-sm text-muted-foreground"
                  >
                    No properties yet.{" "}
                    <Link href="/dashboard/properties/new" className="font-medium text-primary underline-offset-2 hover:underline">
                      Add your first property
                    </Link>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Detail panel */}
      </div>

      {/* Slide-in edit sheet */}
      <AssignmentDrawerSheet
        assignment={selectedAssignment}
        cleaners={cleaners}
        onClose={() => setSelectedId(null)}
      />

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
        ].map((s) => {
          const cfg = statusConfig(s);
          return (
            <span key={s} className="flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${cfg.dot}`} aria-hidden="true" />
              {cfg.label}
            </span>
          );
        })}
      </div>
    </div>
  );
}
