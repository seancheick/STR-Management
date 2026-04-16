"use client";

import { AlertCircle, CalendarDays, ArrowRight } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useCallback, useState, useTransition } from "react";

import { fetchAssignmentDetail, type AssignmentDetailAction } from "@/app/actions/assignments";
import type { AssignmentListRecord } from "@/lib/queries/assignments";
import { AssignmentDrawer } from "./assignment-drawer";
import { AssignCleanerModal } from "./assign-cleaner-modal";

// ─── Status helpers ────────────────────────────────────────────────────────────

function statusBadgeClass(status: string) {
  const map: Record<string, string> = {
    unassigned:               "bg-amber-50    text-amber-700  border-amber-200",
    assigned:                 "bg-blue-50     text-blue-700   border-blue-200",
    confirmed:                "bg-indigo-50   text-indigo-700 border-indigo-200",
    in_progress:              "bg-orange-50   text-orange-700 border-orange-200",
    completed_pending_review: "bg-purple-50   text-purple-700 border-purple-200",
    approved:                 "bg-green-50    text-green-700  border-green-200",
    needs_reclean:            "bg-red-50      text-red-700    border-red-200",
  };
  return map[status] ?? "bg-muted text-muted-foreground border-border";
}

function formatStatus(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

// ─── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  jobs: AssignmentListRecord[];
};

// ─── Component ─────────────────────────────────────────────────────────────────

export function TodayJobsTimeline({ jobs }: Props) {
  const [drawerDetail, setDrawerDetail] = useState<NonNullable<AssignmentDetailAction> | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const openDrawer = useCallback((id: string) => {
    setLoadingId(id);
    startTransition(async () => {
      const detail = await fetchAssignmentDetail(id);
      if (detail) setDrawerDetail(detail);
      setLoadingId(null);
    });
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerDetail(null);
    setShowAssignModal(false);
  }, []);

  const handleAssignClick = useCallback(() => setShowAssignModal(true), []);

  const handleAssigned = useCallback(() => {
    setShowAssignModal(false);
    setDrawerDetail(null);
    // Reload to reflect updated status
    window.location.reload();
  }, []);

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border/70 bg-card px-6 py-12 text-center">
        <CalendarDays className="h-8 w-8 text-muted-foreground/40" aria-hidden="true" />
        <div>
          <p className="font-medium text-muted-foreground">No cleanings scheduled for today</p>
          <p className="mt-1 text-sm text-muted-foreground/70">
            Check the schedule to see upcoming jobs or create a new assignment.
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Link
            href={"/dashboard/schedule" as Route}
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            View schedule
          </Link>
          <Link
            href={"/dashboard/assignments/new" as Route}
            className="inline-flex h-9 items-center rounded-full border border-border/70 bg-card px-4 text-sm font-medium transition hover:border-primary/30 hover:bg-muted"
          >
            + New assignment
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <ol className="flex flex-col gap-2">
        {jobs.map((a) => {
          const isLoading = loadingId === a.id && isPending;
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => openDrawer(a.id)}
                disabled={isPending}
                className={`w-full text-left flex items-center gap-4 rounded-2xl border border-border/70 bg-card px-5 py-4 transition hover:border-primary/25 hover:shadow-sm ${
                  isLoading ? "opacity-60" : ""
                } ${drawerDetail?.id === a.id ? "border-primary/40 shadow-sm" : ""}`}
              >
                {/* Time */}
                <div className="w-16 shrink-0 text-right">
                  <p className="text-xs font-medium tabular-nums text-muted-foreground">
                    {formatTime(a.due_at)}
                  </p>
                </div>

                {/* Status dot */}
                <div className="shrink-0">
                  <div
                    className={`h-2.5 w-2.5 rounded-full ${
                      a.status === "in_progress"
                        ? "bg-orange-400"
                        : a.status === "unassigned" || a.status === "needs_reclean"
                          ? "bg-amber-400"
                          : a.status === "approved"
                            ? "bg-green-400"
                            : a.status === "completed_pending_review"
                              ? "bg-purple-400"
                              : "bg-primary/40"
                    }`}
                  />
                </div>

                {/* Content */}
                <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold leading-snug">
                      {a.properties?.name ?? "Property"}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {a.cleaners?.full_name ?? (
                        <span className="font-medium text-amber-600">Unassigned</span>
                      )}
                      {a.expected_duration_min ? ` · ~${a.expected_duration_min} min` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isLoading ? (
                      <span className="text-xs text-muted-foreground">Loading…</span>
                    ) : (
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-medium ${statusBadgeClass(a.status)}`}
                      >
                        {formatStatus(a.status)}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ol>

      {/* Drawer */}
      {drawerDetail && !showAssignModal && (
        <AssignmentDrawer
          detail={drawerDetail}
          nextCheckinAt={drawerDetail.nextCheckinAt}
          onClose={closeDrawer}
          onAssignClick={handleAssignClick}
        />
      )}

      {/* Assign-cleaner modal */}
      {drawerDetail && showAssignModal && (
        <AssignCleanerModal
          assignmentId={drawerDetail.id}
          propertyName={drawerDetail.propertyName}
          dueAt={drawerDetail.dueAt}
          onClose={() => setShowAssignModal(false)}
          onAssigned={handleAssigned}
        />
      )}
    </>
  );
}

// ─── At-risk section (also needs drawer) ──────────────────────────────────────

type AtRiskProps = {
  jobs: AssignmentListRecord[];
};

export function AtRiskSection({ jobs }: AtRiskProps) {
  const [drawerDetail, setDrawerDetail] = useState<NonNullable<AssignmentDetailAction> | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const openDrawer = useCallback((id: string) => {
    setLoadingId(id);
    startTransition(async () => {
      const detail = await fetchAssignmentDetail(id);
      if (detail) setDrawerDetail(detail);
      setLoadingId(null);
    });
  }, []);

  const handleAssigned = useCallback(() => {
    setShowAssignModal(false);
    setDrawerDetail(null);
    window.location.reload();
  }, []);

  if (jobs.length === 0) return null;

  return (
    <>
      <section aria-label="Overdue jobs">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-base font-semibold text-destructive">
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            Overdue
          </h2>
          <Link
            href={"/dashboard/assignments" as Route}
            className="flex items-center gap-1 text-xs font-medium text-destructive hover:underline underline-offset-2"
          >
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <ol className="flex flex-col gap-2">
          {jobs.slice(0, 5).map((a) => {
            const isLoading = loadingId === a.id && isPending;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => openDrawer(a.id)}
                  disabled={isPending}
                  className={`w-full text-left flex items-center gap-4 rounded-2xl border border-red-200 bg-red-50 px-5 py-4 transition hover:border-red-300 hover:shadow-sm ${isLoading ? "opacity-60" : ""}`}
                >
                  <div className="flex-1">
                    <p className="text-sm font-semibold">{a.properties?.name ?? "Property"}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Due {formatTime(a.due_at)}
                      {a.cleaners ? ` · ${a.cleaners.full_name}` : " · Unassigned"}
                    </p>
                  </div>
                  <span className="rounded-full border border-red-200 bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
                    {isLoading ? "Loading…" : "Overdue"}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </section>

      {drawerDetail && !showAssignModal && (
        <AssignmentDrawer
          detail={drawerDetail}
          nextCheckinAt={drawerDetail.nextCheckinAt}
          onClose={() => { setDrawerDetail(null); setShowAssignModal(false); }}
          onAssignClick={() => setShowAssignModal(true)}
        />
      )}

      {drawerDetail && showAssignModal && (
        <AssignCleanerModal
          assignmentId={drawerDetail.id}
          propertyName={drawerDetail.propertyName}
          dueAt={drawerDetail.dueAt}
          onClose={() => setShowAssignModal(false)}
          onAssigned={handleAssigned}
        />
      )}
    </>
  );
}
