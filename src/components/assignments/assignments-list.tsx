"use client";

import { Pencil, X } from "lucide-react";
import { useEffect, useState } from "react";

import type { AssignmentListRecord } from "@/lib/queries/assignments";
import type { TeamMemberRecord } from "@/lib/queries/team";
import { AssignmentEditForm } from "@/components/schedule/assignment-edit-form";

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
  const selected = assignments.find((a) => a.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelectedId(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  return (
    <>
      <section className="flex flex-col gap-3">
        {assignments.map((a) => {
          const canEdit = !["approved", "cancelled"].includes(a.status);
          return (
            <article
              className="rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm transition duration-200 hover:shadow-md"
              key={a.id}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
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

      {selected && (
        <>
          <div
            aria-hidden="true"
            className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[2px]"
            onClick={() => setSelectedId(null)}
          />
          <aside
            aria-label="Edit assignment"
            aria-modal="true"
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col overflow-y-auto bg-card shadow-2xl"
            role="dialog"
          >
            <div className="flex items-start justify-between gap-4 border-b border-border/60 px-5 py-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
                  Edit assignment
                </p>
                <h2 className="mt-0.5 text-lg font-semibold">
                  {selected.properties?.name ?? "Assignment"}
                </h2>
              </div>
              <button
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted"
                onClick={() => setSelectedId(null)}
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 px-5 py-5">
              <AssignmentEditForm
                assignment={selected}
                cleaners={cleaners}
                onCancel={() => setSelectedId(null)}
                onDeleted={() => setSelectedId(null)}
                onSaved={() => setSelectedId(null)}
              />
            </div>
          </aside>
        </>
      )}
    </>
  );
}
