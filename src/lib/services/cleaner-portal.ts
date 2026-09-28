import { dateKeyInTimeZone } from "@/lib/ical/timezone";

export type CleanerPortalAssignment = {
  id: string;
  due_at: string;
  status: string;
  fixed_payout_amount: number | null;
  properties?: { timezone?: string | null } | null;
};

export type CleanerPortalPayoutEntry = {
  amount: number;
  status: string;
  paid_at?: string | null;
};

export type CleanerPortalPendingPayout = {
  fixed_payout_amount: number | null;
  paid_at?: string | null;
};

const ACTIVE_STATUSES = new Set(["assigned", "confirmed", "in_progress"]);
const HISTORY_STATUSES = new Set(["completed_pending_review", "approved", "needs_reclean"]);

// "Today" and date groups follow the property's calendar, not the server's
// (Vercel runs in UTC, which rolled the cleaner's day over at 8pm Eastern).
function propertyDateKey(assignment: CleanerPortalAssignment, date: Date) {
  return dateKeyInTimeZone(date, assignment.properties?.timezone);
}

export function getCleanerAssignmentBuckets<T extends CleanerPortalAssignment>(
  assignments: T[],
  now = new Date(),
) {
  const active: T[] = [];
  const schedule: T[] = [];
  const history: T[] = [];

  for (const assignment of assignments) {
    if (assignment.status === "cancelled") continue;

    const dueAt = new Date(assignment.due_at);
    if (
      ACTIVE_STATUSES.has(assignment.status) &&
      propertyDateKey(assignment, dueAt) === propertyDateKey(assignment, now)
    ) {
      active.push(assignment);
      continue;
    }

    if (ACTIVE_STATUSES.has(assignment.status) && dueAt >= now) {
      schedule.push(assignment);
      continue;
    }

    if (HISTORY_STATUSES.has(assignment.status) || dueAt < now) {
      history.push(assignment);
    }
  }

  return {
    active: active.sort((a, b) => a.due_at.localeCompare(b.due_at)),
    schedule: schedule.sort((a, b) => a.due_at.localeCompare(b.due_at)),
    history: history.sort((a, b) => b.due_at.localeCompare(a.due_at)),
  };
}

export function groupCleanerAssignmentsByDate<T extends CleanerPortalAssignment>(
  assignments: T[],
) {
  const grouped = new Map<string, T[]>();

  for (const assignment of assignments) {
    const key = propertyDateKey(assignment, new Date(assignment.due_at));
    grouped.set(key, [...(grouped.get(key) ?? []), assignment]);
  }

  return Array.from(grouped.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, group]) => ({
      dateKey,
      assignments: group.sort((a, b) => a.due_at.localeCompare(b.due_at)),
    }));
}

export function calculateCleanerPaySummary({
  payoutEntries,
  pendingAssignments,
}: {
  payoutEntries: CleanerPortalPayoutEntry[];
  pendingAssignments: CleanerPortalPendingPayout[];
}) {
  // Cleaners can't read payout_batches (RLS), so a report's paid status is
  // unknowable here. Only a paid_at stamp (entry or job) proves payment.
  const included = payoutEntries.filter((entry) => entry.status === "included");
  const inReportsTotal = included.reduce((sum, entry) => sum + Number(entry.amount), 0);
  const paidInReportsTotal = included
    .filter((entry) => entry.paid_at)
    .reduce((sum, entry) => sum + Number(entry.amount), 0);
  const paidDirectTotal = pendingAssignments
    .filter((assignment) => assignment.paid_at)
    .reduce((sum, assignment) => sum + Number(assignment.fixed_payout_amount ?? 0), 0);
  const awaitingTotal = pendingAssignments
    .filter((assignment) => !assignment.paid_at)
    .reduce((sum, assignment) => sum + Number(assignment.fixed_payout_amount ?? 0), 0);

  return {
    /** Jobs in an approved or paid payout report. */
    inReportsTotal,
    /** Confirmed paid: stamped entries plus jobs marked paid outside a report. */
    paidTotal: paidInReportsTotal + paidDirectTotal,
    /** Completed jobs not yet in a report and not marked paid. */
    awaitingTotal,
    projectedTotal: inReportsTotal + paidDirectTotal + awaitingTotal,
  };
}
