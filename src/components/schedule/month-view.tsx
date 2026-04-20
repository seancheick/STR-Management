"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Loader2, Pencil, UserMinus } from "lucide-react";

import type { AssignmentScheduleRecord } from "@/lib/queries/assignments";
import type { PropertyRecord } from "@/lib/queries/properties";
import type { TeamMemberRecord } from "@/lib/queries/team";
import { AssignmentEditForm } from "@/components/schedule/assignment-edit-form";
import {
  unassignCleanerAction,
  type QuickAssignState,
} from "@/app/(admin)/dashboard/schedule/actions";
import { showToast } from "@/components/ui/toast";

const unassignInitial: QuickAssignState = { status: "idle", message: null };

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

const STATUS_CFG: Record<string, { bg: string; border: string; text: string; dot: string }> = {
  unassigned:               { bg: "bg-amber-50",   border: "border-amber-300",  text: "text-amber-800",  dot: "bg-amber-400" },
  needs_reclean:            { bg: "bg-red-50",     border: "border-red-200",    text: "text-red-800",    dot: "bg-red-500"   },
  assigned:                 { bg: "bg-blue-50",    border: "border-blue-200",   text: "text-blue-800",   dot: "bg-blue-400"  },
  confirmed:                { bg: "bg-indigo-50",  border: "border-indigo-200", text: "text-indigo-800", dot: "bg-indigo-400"},
  in_progress:              { bg: "bg-orange-50",  border: "border-orange-200", text: "text-orange-800", dot: "bg-orange-400"},
  completed_pending_review: { bg: "bg-purple-50",  border: "border-purple-200", text: "text-purple-800", dot: "bg-purple-400"},
  approved:                 { bg: "bg-green-50",   border: "border-green-200",  text: "text-green-800",  dot: "bg-green-500" },
};

const STATUS_LABEL: Record<string, string> = {
  unassigned: "Unassigned", needs_reclean: "Re-clean", assigned: "Assigned",
  confirmed: "Confirmed", in_progress: "In Progress",
  completed_pending_review: "Pending Review", approved: "Ready",
};

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function shortTime(iso: string | null) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Returns first name only to keep cells compact */
function firstName(fullName: string | null | undefined) {
  if (!fullName) return null;
  return fullName.split(" ")[0];
}

// ─── Assignment chip (compact, for narrow month columns) ──────────────────────

function AssignmentChip({
  assignment,
  isSelected,
  onClick,
}: {
  assignment: AssignmentScheduleRecord;
  isSelected: boolean;
  onClick: () => void;
}) {
  const cfg = STATUS_CFG[assignment.status] ?? {
    bg: "bg-muted", border: "border-border", text: "text-foreground", dot: "bg-muted-foreground",
  };
  const time = shortTime(assignment.checkout_at ?? assignment.due_at);
  const name = firstName(assignment.cleaners?.full_name);

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-lg border px-1.5 py-1 text-left transition-all ${cfg.bg} ${cfg.border} ${cfg.text} ${
        isSelected ? "ring-2 ring-primary/50 ring-offset-1" : "hover:shadow-sm"
      }`}
    >
      <div className="flex items-center gap-1">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${cfg.dot}`} aria-hidden="true" />
        <span className="truncate text-[11px] font-semibold tabular-nums">{time}</span>
      </div>
      <p className={`mt-0.5 truncate text-[11px] font-medium ${
        name ? "" : "font-semibold opacity-90"
      }`}>
        {name ?? "Assign →"}
      </p>
    </button>
  );
}

// ─── Detail panel (shown below the grid when an assignment is selected) ───────

function DetailPanel({
  assignment,
  cleaners,
  onClose,
}: {
  assignment: AssignmentScheduleRecord;
  cleaners: TeamMemberRecord[];
  onClose: () => void;
}) {
  const cfg = STATUS_CFG[assignment.status] ?? { bg: "bg-muted", border: "border-border", text: "text-foreground", dot: "bg-muted-foreground" };
  const label = STATUS_LABEL[assignment.status] ?? assignment.status;
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [unassignState, unassignFormAction, isUnassigning] = useActionState(
    unassignCleanerAction,
    unassignInitial,
  );

  useEffect(() => {
    if (unassignState.status === "success" && unassignState.message) {
      showToast(unassignState.message);
    } else if (unassignState.status === "error" && unassignState.message) {
      showToast(unassignState.message, "error");
    }
  }, [unassignState]);

  const editableStatuses = ["unassigned", "assigned", "confirmed", "needs_reclean"];
  const canEdit = editableStatuses.includes(assignment.status);
  const canUnassign =
    assignment.cleaner_id !== null &&
    ["assigned", "confirmed", "needs_reclean"].includes(assignment.status);

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {mode === "edit" ? "Edit assignment" : "Assignment"}
          </p>
          <h3 className="mt-0.5 truncate text-base font-semibold">
            {assignment.properties?.name ?? "Property"}
          </h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>
              {assignment.cleaners?.full_name ?? (
                <span className="font-medium text-amber-600">Unassigned</span>
              )}
            </span>
            {canUnassign && (
              <form action={unassignFormAction}>
                <input type="hidden" name="assignmentId" value={assignment.id} />
                <button
                  className="inline-flex h-6 items-center gap-1 rounded-full border border-border/70 px-2 text-[10px] font-medium text-muted-foreground transition hover:border-amber-400/60 hover:bg-amber-50 hover:text-amber-800 disabled:opacity-60"
                  disabled={isUnassigning}
                  type="submit"
                >
                  {isUnassigning ? (
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                  ) : (
                    <UserMinus className="h-2.5 w-2.5" />
                  )}
                  Unassign
                </button>
              </form>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${cfg.bg} ${cfg.border} ${cfg.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} aria-hidden="true" />
            {label}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {mode === "edit" ? (
        <div className="mt-4">
          <AssignmentEditForm
            assignment={assignment}
            cleaners={cleaners}
            onCancel={() => setMode("view")}
            onSaved={() => {
              setMode("view");
              onClose();
            }}
            onDeleted={onClose}
          />
        </div>
      ) : (
        <>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {assignment.checkout_at && (
              <div>
                <dt className="text-xs text-muted-foreground">Checkout</dt>
                <dd className="font-medium tabular-nums">{shortTime(assignment.checkout_at)}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-muted-foreground">Cleaning due</dt>
              <dd className="font-medium tabular-nums">{shortTime(assignment.due_at)}</dd>
            </div>

            {assignment.expected_duration_min && (
              <div>
                <dt className="text-xs text-muted-foreground">Duration</dt>
                <dd className="font-medium">~{assignment.expected_duration_min} min</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-muted-foreground">Priority</dt>
              <dd className="font-medium capitalize">{assignment.priority}</dd>
            </div>
            {assignment.fixed_payout_amount !== null && (
              <div>
                <dt className="text-xs text-muted-foreground">Payout</dt>
                <dd className="font-medium tabular-nums">
                  ${Number(assignment.fixed_payout_amount).toFixed(2)}
                </dd>
              </div>
            )}
          </dl>

          <div className="mt-3 flex items-center gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={() => setMode("edit")}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-[#f7f5ef] transition hover:opacity-90"
              >
                <Pencil className="h-3 w-3" />
                Edit
              </button>
            )}
            <Link
              href={`/jobs/${assignment.id}` as Route}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/70 px-3 text-xs font-medium transition hover:bg-muted"
            >
              Details →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

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
  const firstDay = new Date(monthDays[0]);
  const monthLabel = firstDay.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Build lookup: "propertyId|YYYY-MM-DD" -> assignments[]
  const cellMap = new Map<string, AssignmentScheduleRecord[]>();
  for (const a of assignments) {
    const dateKey = new Date(a.due_at).toISOString().slice(0, 10);
    const key = `${a.property_id}|${dateKey}`;
    if (!cellMap.has(key)) cellMap.set(key, []);
    cellMap.get(key)!.push(a);
  }

  const days = monthDays.map((iso) => new Date(iso));
  const selectedAssignment = selectedId
    ? assignments.find((a) => a.id === selectedId) ?? null
    : null;

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
          <span className="min-w-[160px] text-center text-sm font-semibold">{monthLabel}</span>
          <Link
            href={`?view=month&month=${monthOffset + 1}` as Route}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-border/70 bg-card text-sm font-medium transition hover:bg-muted"
            aria-label="Next month"
          >
            →
          </Link>
        </div>

        <div className="flex items-center gap-2">
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

      {/* Property × Day grid — horizontally scrollable */}
      <div className="overflow-x-auto rounded-2xl border border-border/70 bg-card shadow-sm">
        <table
          className="w-full border-collapse text-sm"
          style={{ minWidth: `${180 + days.length * 88}px` }}
        >
          <thead>
            <tr className="border-b border-border/60">
              {/* Sticky property column header */}
              <th
                className="sticky left-0 z-10 w-44 border-r border-border/60 bg-card px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
              >
                Property
              </th>
              {days.map((day) => {
                const isToday = isSameDay(day, today);
                const dayNum = day.getDate();
                const dow = day.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
                return (
                  <th
                    key={day.toISOString()}
                    className={`w-[88px] min-w-[88px] px-1 py-2 text-center text-xs font-medium uppercase tracking-wider ${
                      isToday ? "bg-primary/5" : ""
                    }`}
                  >
                    <span className={isToday ? "text-primary" : "text-muted-foreground"}>
                      {dow}
                    </span>
                    <span
                      className={`mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
                        isToday
                          ? "bg-primary text-[#f7f5ef]"
                          : "text-foreground"
                      }`}
                    >
                      {dayNum}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-border/40">
            {properties.length === 0 ? (
              <tr>
                <td
                  colSpan={days.length + 1}
                  className="px-4 py-10 text-center text-sm text-muted-foreground"
                >
                  No active properties.{" "}
                  <Link
                    href="/dashboard/properties/new"
                    className="font-medium text-primary underline-offset-2 hover:underline"
                  >
                    Add your first property
                  </Link>
                </td>
              </tr>
            ) : (
              properties.map((property) => (
                <tr key={property.id} className="hover:bg-muted/20">
                  {/* Sticky property name cell */}
                  <td className="sticky left-0 z-10 border-r border-border/60 bg-card px-4 py-3 align-top">
                    <p className="font-medium leading-snug">{property.name}</p>
                    {property.city && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{property.city}</p>
                    )}
                  </td>

                  {/* Day cells */}
                  {days.map((day) => {
                    const dateKey = day.toISOString().slice(0, 10);
                    const key = `${property.id}|${dateKey}`;
                    const cell = cellMap.get(key) ?? [];
                    const isToday = isSameDay(day, today);

                    return (
                      <td
                        key={dateKey}
                        className={`px-1 py-1.5 align-top ${isToday ? "bg-primary/[0.03]" : ""}`}
                      >
                        <div className="flex flex-col gap-1">
                          {cell.map((a) => (
                            <AssignmentChip
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
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Selected assignment detail panel */}
      {selectedAssignment && (
        <DetailPanel
          assignment={selectedAssignment}
          cleaners={cleaners}
          onClose={() => setSelectedId(null)}
        />
      )}

      {/* Status legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium">Legend:</span>
        {(["unassigned", "assigned", "in_progress", "completed_pending_review", "approved", "needs_reclean"] as const).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span
              className={`h-2 w-2 rounded-full ${STATUS_CFG[s]?.dot ?? "bg-gray-400"}`}
              aria-hidden="true"
            />
            {STATUS_LABEL[s]}
          </span>
        ))}
      </div>
    </div>
  );
}
