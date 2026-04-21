"use client";

import { useActionState, useEffect, useState } from "react";
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  Pencil,
  User,
  UserMinus,
  X,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

import type { AssignmentScheduleRecord } from "@/lib/queries/assignments";
import type { PropertyRecord } from "@/lib/queries/properties";
import type { TeamMemberRecord } from "@/lib/queries/team";
import {
  quickAssignAction,
  unassignCleanerAction,
  type QuickAssignState,
} from "@/app/(admin)/dashboard/schedule/actions";
import { AssignmentEditForm } from "@/components/schedule/assignment-edit-form";
import { AssignmentDrawerSheet } from "@/components/assignments/assignment-drawer-sheet";
import { showToast } from "@/components/ui/toast";

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

function turnoverWindow(checkoutAt: string | null, dueAt: string): string {
  if (!checkoutAt) return "";
  const minutes = Math.round(
    (new Date(dueAt).getTime() - new Date(checkoutAt).getTime()) / 60_000,
  );
  if (minutes <= 0) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m > 0 ? `${m}m` : ""}`.trim() : `${m}m`;
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
    (a) => a.property_id === propertyId && isSameDay(new Date(a.due_at), today),
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

// ─── Detail panel ─────────────────────────────────────────────────────────────

const initialState: QuickAssignState = { status: "idle", message: null };

function AssignmentDetailPanel({
  assignment,
  cleaners,
  onClose,
}: {
  assignment: AssignmentScheduleRecord;
  cleaners: TeamMemberRecord[];
  onClose: () => void;
}) {
  const cfg = statusConfig(assignment.status);
  const turnover = turnoverWindow(assignment.checkout_at, assignment.due_at);
  const [state, formAction, isPending] = useActionState(quickAssignAction, initialState);
  const [unassignState, unassignFormAction, isUnassigning] = useActionState(
    unassignCleanerAction,
    initialState,
  );
  const [mode, setMode] = useState<"view" | "edit">("view");

  useEffect(() => {
    if (state.status === "success" && state.message) showToast(state.message);
    else if (state.status === "error" && state.message) showToast(state.message, "error");
  }, [state]);

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
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            {mode === "edit" ? "Edit assignment" : "Assignment detail"}
          </p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight">
            {assignment.properties?.name ?? "Property"}
          </h3>
          {assignment.properties?.address_line_1 && (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {[assignment.properties.address_line_1, assignment.properties.city]
                .filter(Boolean)
                .join(", ")}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted"
          aria-label="Close detail panel"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {mode === "edit" ? (
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
      ) : (
        <>
          {/* Status chip */}
          <span
            className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${cfg.bg} ${cfg.border} ${cfg.text}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} aria-hidden="true" />
            {cfg.label}
          </span>

          {/* Time info */}
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                Checkout
              </dt>
              <dd className="mt-1 font-medium tabular-nums">{formatTime(assignment.checkout_at)}</dd>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                Cleaning due
              </dt>
              <dd className="mt-1 font-medium tabular-nums">{formatTime(assignment.due_at)}</dd>
            </div>
            {turnover && (
              <div className="col-span-2">
                <dt className="text-xs text-muted-foreground">Turnover window</dt>
                <dd className="mt-1 font-semibold text-primary tabular-nums">{turnover}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-muted-foreground">Priority</dt>
              <dd className="mt-1 font-medium capitalize">{assignment.priority}</dd>
            </div>
            {assignment.fixed_payout_amount !== null && (
              <div>
                <dt className="text-xs text-muted-foreground">Payout</dt>
                <dd className="mt-1 font-semibold tabular-nums">
                  ${Number(assignment.fixed_payout_amount).toFixed(2)}
                </dd>
              </div>
            )}
          </dl>

          {/* Current cleaner */}
          <div className="rounded-xl border border-border/70 bg-background px-4 py-3">
            <p className="text-xs text-muted-foreground">Assigned cleaner</p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 font-medium">
                <User className="h-4 w-4 text-muted-foreground/60" aria-hidden="true" />
                {assignment.cleaners?.full_name ?? "Unassigned"}
              </p>
              {canUnassign && (
                <form action={unassignFormAction}>
                  <input type="hidden" name="assignmentId" value={assignment.id} />
                  <button
                    className="inline-flex h-7 items-center gap-1 rounded-full border border-border/70 px-2.5 text-[11px] font-medium text-muted-foreground transition hover:border-amber-400/50 hover:bg-amber-50 hover:text-amber-800 disabled:opacity-60"
                    disabled={isUnassigning}
                    type="submit"
                  >
                    {isUnassigning ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <UserMinus className="h-3 w-3" />
                    )}
                    Unassign
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Quick assign — only if unassigned */}
          {assignment.status === "unassigned" && (
            <form action={formAction} className="flex flex-col gap-3">
              <input type="hidden" name="assignmentId" value={assignment.id} />
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-muted-foreground" htmlFor="cleanerId">
                  Assign cleaner
                </label>
                <select
                  id="cleanerId"
                  name="cleanerId"
                  required
                  className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm"
                >
                  <option value="">Select a cleaner…</option>
                  {cleaners.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
              </div>
              {state.status === "error" && (
                <p className="flex items-center gap-1.5 text-xs text-destructive">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {state.message}
                </p>
              )}
              {state.status === "success" && (
                <p className="flex items-center gap-1.5 text-xs text-green-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  {state.message}
                </p>
              )}
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-[#f7f5ef] transition hover:opacity-90 disabled:opacity-60"
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Assign cleaner
              </button>
            </form>
          )}

          {/* Edit / View-full actions */}
          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={() => setMode("edit")}
                className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-[#f7f5ef] transition hover:opacity-90"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
            )}
            <Link
              href={`/jobs/${assignment.id}` as Route}
              className="inline-flex h-9 items-center justify-center rounded-full border border-border/70 px-4 text-sm font-medium text-foreground transition hover:bg-muted"
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
      const key = `${a.property_id}|${dayIndex}`;
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
                ? "bg-primary text-[#f7f5ef]"
                : "border border-border/70 bg-card text-foreground hover:bg-muted"
            }`}
          >
            Week
          </Link>
          <Link
            href="?view=month"
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
