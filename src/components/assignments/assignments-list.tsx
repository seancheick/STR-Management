"use client";

import { Loader2, Pencil, Trash2, Users } from "lucide-react";
import { useMemo, useState, useTransition } from "react";

import {
  bulkAssignCleanerAction,
  deleteAssignmentsAction,
} from "@/app/(admin)/dashboard/assignments/actions";
import type { AssignmentListRecord } from "@/lib/queries/assignments";
import type { TeamMemberRecord } from "@/lib/queries/team";
import { AssignmentDrawerSheet } from "@/components/assignments/assignment-drawer-sheet";
import { showToast } from "@/components/ui/toast";

function priorityBadgeClass(priority: string) {
  const map: Record<string, string> = {
    normal: "bg-gray-50 text-gray-600 border border-gray-200",
    high: "bg-orange-50 text-orange-700 border border-orange-200",
    urgent: "bg-red-50 text-red-700 border border-red-200",
  };
  return map[priority] ?? "bg-gray-50 text-gray-600 border border-gray-200";
}

function statusBadgeClass(status: string) {
  const map: Record<string, string> = {
    unassigned: "bg-yellow-50 text-yellow-700 border-yellow-200",
    assigned: "bg-blue-50 text-blue-700 border-blue-200",
    confirmed: "bg-indigo-50 text-indigo-700 border-indigo-200",
    in_progress: "bg-orange-50 text-orange-700 border-orange-200",
    completed_pending_review: "bg-purple-50 text-purple-700 border-purple-200",
    approved: "bg-green-50 text-green-700 border-green-200",
    needs_reclean: "bg-red-50 text-red-700 border-red-200",
    cancelled: "bg-gray-50 text-gray-500 border-gray-200",
  };
  return map[status] ?? "bg-gray-50 text-gray-600 border-gray-200";
}

function formatStatus(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type AssignmentsListProps = {
  assignments: AssignmentListRecord[];
  cleaners: TeamMemberRecord[];
};

export function AssignmentsList({ assignments, cleaners }: AssignmentsListProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkCleaner, setBulkCleaner] = useState("");
  const [isPending, startTransition] = useTransition();
  const selected = assignments.find((a) => a.id === selectedId) ?? null;

  const unassignedIds = useMemo(
    () => assignments.filter((a) => a.status === "unassigned").map((a) => a.id),
    [assignments],
  );
  const deletableIds = useMemo(
    () =>
      assignments
        .filter((a) => a.status === "cancelled" || a.status === "approved")
        .map((a) => a.id),
    [assignments],
  );
  const allUnassignedChecked =
    unassignedIds.length > 0 && unassignedIds.every((id) => checkedIds.has(id));

  // Classify the current selection so the bulk bar knows what it can do.
  const selection = useMemo(() => {
    const statuses = new Set<string>();
    for (const id of checkedIds) {
      const a = assignments.find((x) => x.id === id);
      if (a) statuses.add(a.status);
    }
    const allUnassigned = statuses.size === 1 && statuses.has("unassigned");
    const allDeletable =
      statuses.size > 0 &&
      [...statuses].every((s) => s === "cancelled" || s === "approved");
    return {
      count: checkedIds.size,
      allUnassigned,
      allDeletable,
      mixed: !allUnassigned && !allDeletable && statuses.size > 0,
    };
  }, [checkedIds, assignments]);

  function toggleChecked(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllUnassigned() {
    setCheckedIds((prev) => {
      if (allUnassignedChecked) {
        const next = new Set(prev);
        for (const id of unassignedIds) next.delete(id);
        return next;
      }
      return new Set([...prev, ...unassignedIds]);
    });
  }

  function handleBulkAssign() {
    if (checkedIds.size === 0 || !bulkCleaner) return;
    const ids = Array.from(checkedIds);
    startTransition(async () => {
      const res = await bulkAssignCleanerAction(ids, bulkCleaner);
      if (res.error) {
        showToast(res.error, "error");
      } else {
        showToast(
          `Assigned ${res.assigned} job${res.assigned === 1 ? "" : "s"}.`,
        );
        setCheckedIds(new Set());
        setBulkCleaner("");
      }
    });
  }

  function handleBulkDelete() {
    if (!selection.allDeletable) return;
    const ids = Array.from(checkedIds);
    if (
      !confirm(
        `Permanently delete ${ids.length} job${ids.length === 1 ? "" : "s"}? Cancelled and approved jobs are safe to remove.`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteAssignmentsAction(ids);
      if (res.error) {
        showToast(res.error, "error");
      } else {
        showToast(`Deleted ${res.deleted} job${res.deleted === 1 ? "" : "s"}.`);
        setCheckedIds(new Set());
      }
    });
  }

  return (
    <>
      {(unassignedIds.length > 0 || deletableIds.length > 0) && (
        <div className="sticky top-0 z-20 -mx-2 mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-card/95 px-4 py-3 shadow-sm backdrop-blur">
          {unassignedIds.length > 0 && (
            <label className="flex items-center gap-2 text-xs font-medium">
              <input
                checked={allUnassignedChecked}
                className="h-4 w-4 rounded border-input"
                onChange={toggleAllUnassigned}
                type="checkbox"
              />
              Select all unassigned ({unassignedIds.length})
            </label>
          )}
          <span className="text-xs text-muted-foreground">
            {selection.count === 0
              ? "No jobs selected"
              : `${selection.count} job${selection.count === 1 ? "" : "s"} selected`}
            {selection.mixed &&
              " · mix of statuses — pick either unassigned OR cancelled/approved"}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {selection.allDeletable ? (
              <button
                className="inline-flex h-9 items-center gap-1.5 rounded-full bg-red-600 px-4 text-xs font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
                disabled={isPending}
                onClick={handleBulkDelete}
                type="button"
              >
                {isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Delete {selection.count}
              </button>
            ) : (
              <>
                <select
                  className="h-9 rounded-full border border-input bg-background px-3 text-xs disabled:opacity-60"
                  disabled={!selection.allUnassigned || isPending}
                  onChange={(e) => setBulkCleaner(e.target.value)}
                  value={bulkCleaner}
                >
                  <option value="">Choose cleaner…</option>
                  {cleaners.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.full_name}
                    </option>
                  ))}
                </select>
                <button
                  className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-[#f7f5ef] transition hover:opacity-90 disabled:opacity-60"
                  disabled={
                    !selection.allUnassigned || !bulkCleaner || isPending
                  }
                  onClick={handleBulkAssign}
                  type="button"
                >
                  {isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Users className="h-3.5 w-3.5" />
                  )}
                  Assign {selection.allUnassigned ? selection.count : ""}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <section className="flex flex-col gap-3">
        {assignments.map((a) => {
          const canEdit = !["approved", "cancelled"].includes(a.status);
          const selectable =
            a.status === "unassigned" ||
            a.status === "cancelled" ||
            a.status === "approved";
          const isChecked = checkedIds.has(a.id);
          return (
            <article
              className={`rounded-[1.5rem] border bg-card p-5 shadow-sm transition duration-200 hover:shadow-md ${
                isChecked ? "border-primary/50 bg-primary/[0.03]" : "border-border/70"
              }`}
              key={a.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-1 items-start gap-3">
                  {selectable && (
                    <input
                      aria-label={`Select ${a.properties?.name ?? "assignment"}`}
                      checked={isChecked}
                      className="mt-1 h-4 w-4 rounded border-input"
                      onChange={() => toggleChecked(a.id)}
                      type="checkbox"
                    />
                  )}
                  <div>
                    <h2 className="text-xl font-bold tracking-tight">
                      {a.properties?.name ?? "Unknown property"}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {a.properties
                        ? [a.properties.address_line_1, a.properties.city]
                            .filter(Boolean)
                            .join(", ")
                        : null}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${statusBadgeClass(a.status)}`}
                  >
                    {formatStatus(a.status)}
                  </span>
                  {canEdit && (
                    <button
                      className="inline-flex h-8 items-center gap-1 rounded-full bg-primary px-3 text-xs font-semibold text-[#f7f5ef] transition hover:opacity-90"
                      onClick={() => setSelectedId(a.id)}
                      type="button"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </button>
                  )}
                </div>
              </div>

              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border/50 pt-4 text-sm md:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">Cleaner</dt>
                  <dd className="mt-1 font-medium">
                    {a.cleaners?.full_name ?? "Unassigned"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Due</dt>
                  <dd className="mt-1 font-medium">{formatDate(a.due_at)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Priority</dt>
                  <dd className="mt-1">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${priorityBadgeClass(a.priority)}`}
                    >
                      {a.priority}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Payout</dt>
                  <dd className="mt-1 font-medium">
                    {a.fixed_payout_amount !== null
                      ? `$${Number(a.fixed_payout_amount).toFixed(2)}`
                      : "—"}
                  </dd>
                </div>
              </dl>
            </article>
          );
        })}
      </section>

      <AssignmentDrawerSheet
        assignment={selected}
        cleaners={cleaners}
        onClose={() => setSelectedId(null)}
      />
    </>
  );
}
