"use client";

import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckSquare2,
  Clock,
  Image,
  User,
  X,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useEffect } from "react";

import type { AssignmentDetailAction } from "@/app/actions/assignments";

// ─── Status helpers ────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; cls: string }> = {
  unassigned:               { label: "Unassigned",        cls: "bg-amber-50 text-amber-700 border-amber-200" },
  assigned:                 { label: "Assigned",          cls: "bg-blue-50 text-blue-700 border-blue-200" },
  confirmed:                { label: "Confirmed",         cls: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  in_progress:              { label: "In Progress",       cls: "bg-orange-50 text-orange-700 border-orange-200" },
  completed_pending_review: { label: "Pending Review",    cls: "bg-purple-50 text-purple-700 border-purple-200" },
  approved:                 { label: "Ready",             cls: "bg-green-50 text-green-700 border-green-200" },
  needs_reclean:            { label: "Needs Re-clean",    cls: "bg-red-50 text-red-700 border-red-200" },
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  detail: NonNullable<AssignmentDetailAction>;
  nextCheckinAt?: string | null;
  onClose: () => void;
  onAssignClick: () => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function AssignmentDrawer({ detail, nextCheckinAt, onClose, onAssignClick }: Props) {
  const status = STATUS_CONFIG[detail.status] ?? { label: detail.status, cls: "bg-muted text-muted-foreground border-border" };

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Turnover window
  const checkoutDate = detail.checkoutAt ? new Date(detail.checkoutAt) : null;
  const checkinDate = nextCheckinAt ? new Date(nextCheckinAt) : null;
  const turnoverMinutes =
    checkoutDate && checkinDate
      ? Math.round((checkinDate.getTime() - checkoutDate.getTime()) / 60_000)
      : null;
  const turnoverHours = turnoverMinutes ? `${Math.floor(turnoverMinutes / 60)}h ${turnoverMinutes % 60}m` : null;

  // Checklist progress
  const checklistPct =
    detail.checklistTotal > 0
      ? Math.round((detail.checklistCompleted / detail.checklistTotal) * 100)
      : null;

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[2px]"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Panel */}
      <aside
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-card shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Assignment details"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border/60 px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              {detail.assignmentType === "reclean" ? "Re-clean" : "Turnover"}
            </p>
            <h2 className="mt-0.5 truncate text-lg font-semibold tracking-tight">
              {detail.propertyName}
            </h2>
            {detail.propertyAddress && (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {detail.propertyAddress}{detail.propertyCity ? `, ${detail.propertyCity}` : ""}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 pt-0.5">
            <span className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${status.cls}`}>
              {status.label}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-muted"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          <dl className="flex flex-col gap-5">

            {/* Timing */}
            <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                Timing
              </p>
              <div className="grid grid-cols-2 gap-3">
                {detail.checkoutAt && (
                  <div>
                    <p className="text-[11px] text-muted-foreground/70">Guest checkout</p>
                    <p className="mt-0.5 text-sm font-medium">{formatTime(detail.checkoutAt)}</p>
                  </div>
                )}
                <div>
                  <p className="text-[11px] text-muted-foreground/70">Cleaning due</p>
                  <p className="mt-0.5 text-sm font-medium">{formatTime(detail.dueAt)}</p>
                </div>
                {nextCheckinAt && (
                  <div>
                    <p className="text-[11px] text-muted-foreground/70">Next check-in</p>
                    <p className="mt-0.5 text-sm font-medium">{formatTime(nextCheckinAt)}</p>
                  </div>
                )}
                {detail.expectedDurationMin && (
                  <div>
                    <p className="text-[11px] text-muted-foreground/70">Est. duration</p>
                    <p className="mt-0.5 text-sm font-medium">{detail.expectedDurationMin} min</p>
                  </div>
                )}
              </div>

              {/* Turnover window */}
              {turnoverHours && (
                <div className={`mt-3 rounded-xl px-3 py-2 text-xs ${
                  turnoverMinutes && turnoverMinutes < 180
                    ? "bg-amber-50 text-amber-700"
                    : "bg-green-50 text-green-700"
                }`}>
                  <Clock className="mr-1 inline h-3 w-3" aria-hidden="true" />
                  <span className="font-semibold">{turnoverHours} window</span>
                  {turnoverMinutes && detail.expectedDurationMin && turnoverMinutes < detail.expectedDurationMin + 30 && (
                    <span className="ml-1 font-medium text-amber-600">· Tight</span>
                  )}
                </div>
              )}
            </div>

            {/* Cleaner */}
            <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                Cleaner
              </p>
              {detail.cleanerName ? (
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                    <User className="h-4 w-4 text-primary" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">{detail.cleanerName}</p>
                    <p className="text-xs text-muted-foreground capitalize">
                      {detail.ackStatus.replace(/_/g, " ")}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" aria-hidden="true" />
                    <span className="text-sm font-medium text-amber-600">No cleaner assigned</span>
                  </div>
                  <button
                    type="button"
                    onClick={onAssignClick}
                    className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-semibold text-[#f7f5ef] transition hover:opacity-90"
                  >
                    Assign cleaner
                  </button>
                </div>
              )}
            </div>

            {/* Checklist + Photos */}
            {(detail.checklistTotal > 0 || detail.photoCount > 0) && (
              <div className="grid grid-cols-2 gap-3">
                {detail.checklistTotal > 0 && (
                  <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-4">
                    <CheckSquare2 className="h-4 w-4 text-muted-foreground/60" aria-hidden="true" />
                    <p className="mt-2 text-xl font-semibold tabular-nums">
                      {detail.checklistCompleted}
                      <span className="text-sm font-normal text-muted-foreground">
                        /{detail.checklistTotal}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Checklist items</p>
                    {checklistPct !== null && (
                      <div className="mt-2 h-1.5 w-full rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-all ${
                            checklistPct === 100 ? "bg-green-500" : "bg-primary"
                          }`}
                          style={{ width: `${checklistPct}%` }}
                        />
                      </div>
                    )}
                  </div>
                )}
                {detail.photoCount > 0 && (
                  <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-4">
                    <Image className="h-4 w-4 text-muted-foreground/60" aria-hidden="true" />
                    <p className="mt-2 text-xl font-semibold tabular-nums">{detail.photoCount}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">Photos uploaded</p>
                  </div>
                )}
              </div>
            )}

            {/* Payout */}
            {detail.fixedPayoutAmount != null && (
              <div className="rounded-2xl border border-border/70 bg-background/60 px-4 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                  Payout
                </p>
                <p className="mt-2 text-2xl font-semibold tabular-nums">
                  ${detail.fixedPayoutAmount.toFixed(2)}
                </p>
              </div>
            )}

          </dl>
        </div>

        {/* Footer */}
        <div className="border-t border-border/60 px-5 py-4">
          <Link
            href={`/dashboard/assignments/${detail.id}` as Route}
            className="flex w-full items-center justify-center gap-1.5 rounded-full border border-border/70 py-2.5 text-sm font-medium transition hover:border-primary/30 hover:bg-muted"
          >
            View full details
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </aside>
    </>
  );
}
