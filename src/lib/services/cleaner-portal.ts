export type CleanerPortalAssignment = {
  id: string;
  due_at: string;
  status: string;
  fixed_payout_amount: number | null;
};

export type CleanerPortalPayoutEntry = {
  amount: number;
  status: string;
};

export type CleanerPortalPendingPayout = {
  fixed_payout_amount: number | null;
};

const ACTIVE_STATUSES = new Set(["assigned", "confirmed", "in_progress"]);
const HISTORY_STATUSES = new Set(["completed_pending_review", "approved", "needs_reclean"]);

function isSameLocalDate(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function localDateKey(iso: string) {
  const date = new Date(iso);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
    if (ACTIVE_STATUSES.has(assignment.status) && isSameLocalDate(dueAt, now)) {
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
    const key = localDateKey(assignment.due_at);
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
  const paidTotal = payoutEntries
    .filter((entry) => entry.status === "included")
    .reduce((sum, entry) => sum + Number(entry.amount), 0);
  const pendingTotal = pendingAssignments.reduce(
    (sum, assignment) => sum + Number(assignment.fixed_payout_amount ?? 0),
    0,
  );

  return {
    paidTotal,
    pendingTotal,
    projectedTotal: paidTotal + pendingTotal,
  };
}
