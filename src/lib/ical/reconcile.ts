import type { TurnoverCandidate } from "./parser";

/** Statuses a feed change may still alter: nobody has started the job yet. */
export const SYNC_MUTABLE_STATUSES = ["unassigned", "assigned", "confirmed"] as const;

export type ImportedAssignment = {
  id: string;
  source_reference: string | null;
  status: string;
  cleaner_id: string | null;
  calendar_source_id: string | null;
  due_at: string;
  checkout_at: string | null;
  next_checkin_at: string | null;
};

export type AssignmentDateUpdate = {
  id: string;
  cleanerId: string | null;
  dueChanged: boolean;
  previousDueAt: string;
  patch: { due_at: string; checkout_at: string; next_checkin_at: string | null };
};

export type ReconciliationPlan = {
  /** Still in the feed but with different dates. */
  updates: AssignmentDateUpdate[];
  /** In the feed, but not yet linked to any calendar source. */
  stampSourceIds: string[];
  /** Created by THIS source, upcoming, and gone from its feed. */
  cancels: Array<{ id: string; cleanerId: string | null; dueAt: string }>;
};

export function sourceReferenceFor(uid: string): string {
  return `ical:${uid}`;
}

function sameInstant(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return new Date(a).getTime() === new Date(b).getTime();
}

/**
 * Decides how existing imported assignments follow a fresh feed.
 * Only jobs nobody has started are touched, and only upcoming jobs are
 * cancelled. A job is cancelled only when it is linked to this source, so a
 * second feed on the same property never cancels the first feed's jobs.
 */
export function planReconciliation(input: {
  existing: ImportedAssignment[];
  candidates: TurnoverCandidate[];
  calendarSourceId: string;
  now: Date;
}): ReconciliationPlan {
  const byRef = new Map(input.candidates.map((c) => [sourceReferenceFor(c.uid), c]));
  const mutable = new Set<string>(SYNC_MUTABLE_STATUSES);
  const plan: ReconciliationPlan = { updates: [], stampSourceIds: [], cancels: [] };

  for (const row of input.existing) {
    if (!row.source_reference || !mutable.has(row.status)) continue;
    const candidate = byRef.get(row.source_reference);

    if (candidate) {
      if (row.calendar_source_id === null) plan.stampSourceIds.push(row.id);
      const dueChanged = !sameInstant(row.due_at, candidate.dueAt);
      if (
        dueChanged ||
        !sameInstant(row.checkout_at, candidate.checkoutAt) ||
        !sameInstant(row.next_checkin_at, candidate.nextCheckinAt)
      ) {
        plan.updates.push({
          id: row.id,
          cleanerId: row.cleaner_id,
          dueChanged,
          previousDueAt: row.due_at,
          patch: {
            due_at: candidate.dueAt,
            checkout_at: candidate.checkoutAt,
            next_checkin_at: candidate.nextCheckinAt,
          },
        });
      }
      continue;
    }

    if (
      row.calendar_source_id === input.calendarSourceId &&
      new Date(row.due_at).getTime() > input.now.getTime()
    ) {
      plan.cancels.push({ id: row.id, cleanerId: row.cleaner_id, dueAt: row.due_at });
    }
  }

  return plan;
}
