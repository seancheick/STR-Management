import type { Route } from "next";
import Link from "next/link";
import { Clock, DollarSign, MapPin } from "lucide-react";

import { acceptJobAction, startJobAction } from "@/app/(cleaner)/jobs/actions";
import type { AssignmentListRecord } from "@/lib/queries/assignments";

const STATUS_LABELS: Record<string, string> = {
  assigned: "Pending acceptance",
  confirmed: "Accepted",
  in_progress: "In progress",
  completed_pending_review: "Submitted",
  approved: "Unit ready",
  needs_reclean: "Needs re-clean",
};

const STATUS_CLASSES: Record<string, string> = {
  assigned: "border-yellow-200 bg-yellow-50 text-yellow-700",
  confirmed: "border-blue-200 bg-blue-50 text-blue-700",
  in_progress: "border-orange-200 bg-orange-50 text-orange-700",
  completed_pending_review: "border-purple-200 bg-purple-50 text-purple-700",
  approved: "border-green-200 bg-green-50 text-green-700",
  needs_reclean: "border-red-200 bg-red-50 text-red-700",
};

const STATUS_BARS: Record<string, string> = {
  assigned: "bg-yellow-400",
  confirmed: "bg-blue-400",
  in_progress: "bg-orange-400",
  completed_pending_review: "bg-purple-400",
  approved: "bg-green-400",
  needs_reclean: "bg-red-400",
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function addressForAssignment(assignment: AssignmentListRecord) {
  return [assignment.properties?.address_line_1, assignment.properties?.city]
    .filter(Boolean)
    .join(", ");
}

type CleanerJobCardProps = {
  assignment: AssignmentListRecord;
  showActions?: boolean;
  showPayout?: boolean;
};

export function CleanerJobCard({
  assignment,
  showActions = false,
  showPayout = true,
}: CleanerJobCardProps) {
  const address = addressForAssignment(assignment);
  const statusClass =
    STATUS_CLASSES[assignment.status] ?? "border-border bg-muted text-muted-foreground";
  const statusBar = STATUS_BARS[assignment.status] ?? "bg-border";

  return (
    <article className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
      <div className={`h-1 w-full ${statusBar}`} />
      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold tracking-tight">
              {assignment.properties?.name ?? "Property"}
            </h2>
            {address && (
              <div className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{address}</span>
              </div>
            )}
          </div>
          <span className={`rounded-full border px-3 py-1 text-xs font-medium ${statusClass}`}>
            {STATUS_LABELS[assignment.status] ?? assignment.status.replace(/_/g, " ")}
          </span>
        </div>

        <div className="mt-4 grid gap-2">
          {assignment.checkout_at ? (
            <div className="flex flex-col gap-0.5 rounded-xl bg-muted/60 px-3 py-2">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Window
                </span>
              </div>
              <p className="text-xs leading-5 text-foreground">
                <span className="text-muted-foreground">Start after</span>{" "}
                <span className="font-semibold">{formatDateTime(assignment.checkout_at)}</span>
              </p>
              <p className="text-xs leading-5 text-foreground">
                <span className="text-muted-foreground">Done by</span>{" "}
                <span className="font-semibold">{formatDateTime(assignment.due_at)}</span>
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2">
              <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-medium">
                Done by {formatDateTime(assignment.due_at)}
              </span>
            </div>
          )}
          {showPayout && assignment.fixed_payout_amount !== null && (
            <div className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2">
              <DollarSign className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="text-sm font-medium">
                ${Number(assignment.fixed_payout_amount).toFixed(2)}
              </span>
            </div>
          )}
        </div>

        {showActions && (
          <div className="mt-5 flex flex-col gap-3">
            {assignment.status === "assigned" && (
              <form action={async () => { await acceptJobAction(assignment.id); }}>
                <button
                  className="h-12 w-full rounded-xl bg-primary text-sm font-semibold text-[#f7f5ef]"
                  type="submit"
                >
                  Accept
                </button>
              </form>
            )}

            {assignment.status === "confirmed" && (
              <form action={async () => { await startJobAction(assignment.id); }}>
                <button
                  className="h-12 w-full rounded-xl bg-primary text-sm font-semibold text-[#f7f5ef]"
                  type="submit"
                >
                  Start job
                </button>
              </form>
            )}

            {assignment.status === "in_progress" && (
              <Link
                className="flex h-12 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-[#f7f5ef]"
                href={`/jobs/${assignment.id}` as Route}
              >
                Execute checklist
              </Link>
            )}

            {["completed_pending_review", "approved", "needs_reclean"].includes(assignment.status) && (
              <Link
                className="flex h-12 w-full items-center justify-center rounded-xl border border-border/70 bg-transparent text-sm font-medium"
                href={`/jobs/${assignment.id}` as Route}
              >
                View job
              </Link>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
