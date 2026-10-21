import { dateKeyInTimeZone } from "./timezone";
import type { TurnoverCandidate } from "./parser";

/** Statuses a feed change may still alter: nobody has started the job yet. */
export const SYNC_MUTABLE_STATUSES = ["unassigned", "assigned", "confirmed"] as const;

export type ImportedAssignment = {
  id: string;
  source_reference: string | null;
  hostex_reservation_code?: string | null;
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
  ownershipTransfers: Array<{ id: string; calendarSourceId: string; sourceReference: string; listingPropertyId?: string; fixedPayoutAmount?: number | null }>;
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
  timeZone?: string;
  otherFeedReservations?: Array<{ checkoutAt: string; calendarSourceId: string; sourceReference: string; listingPropertyId?: string; fixedPayoutAmount?: number | null }>;
}): ReconciliationPlan {
  const byRef = new Map(input.candidates.map((c) => [sourceReferenceFor(c.uid), c]));
  const mutable = new Set<string>(SYNC_MUTABLE_STATUSES);
  const plan: ReconciliationPlan = { updates: [], stampSourceIds: [], ownershipTransfers: [], cancels: [] };

  for (const row of input.existing) {
    // Hostex is authoritative once linked. A stale backup feed must not undo
    // its dates or cancel its job, including during a Hostex API outage.
    if (row.hostex_reservation_code) continue;
    if (!row.source_reference || !mutable.has(row.status) || new Date(row.due_at).getTime() <= input.now.getTime()) continue;
    // Providers prune a departed stay after checkout, before the cleaning's
    // deadline. The turnover still needs its cleaner; feed absence is no longer
    // evidence that the stay was cancelled once checkout has been reached.
    if (new Date(row.checkout_at ?? row.due_at).getTime() <= input.now.getTime()) continue;
    const candidate = byRef.get(row.source_reference);

    if (candidate) {
      // Matching UIDs from another source must never move this source's job.
      if (row.calendar_source_id !== null && row.calendar_source_id !== input.calendarSourceId) continue;
      // A corrected feed must not move an upcoming task back into history.
      if (new Date(candidate.dueAt).getTime() <= input.now.getTime()) continue;
      if (row.calendar_source_id === null) plan.stampSourceIds.push(row.id);
      const dueChanged = !sameInstant(row.due_at, candidate.dueAt);
      if (
        dueChanged ||
        !sameInstant(row.checkout_at, candidate.checkoutAt) ||
        !sameInstant(row.next_checkin_at, candidate.nextCheckinAt)
      ) {
        const destinationDay = dateKeyInTimeZone(new Date(candidate.checkoutAt), input.timeZone);
        const occupied = input.existing.some((other) => other.id !== row.id && other.status !== "cancelled" &&
          dateKeyInTimeZone(new Date(other.checkout_at ?? other.due_at), input.timeZone) === destinationDay);
        if (dueChanged && occupied) {
          plan.cancels.push({ id: row.id, cleanerId: row.cleaner_id, dueAt: row.due_at });
          continue;
        }
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
      const turnoverDay = dateKeyInTimeZone(new Date(row.checkout_at ?? row.due_at), input.timeZone);
      const survivor = input.otherFeedReservations?.find((reservation) =>
        reservation.calendarSourceId !== input.calendarSourceId &&
        dateKeyInTimeZone(new Date(reservation.checkoutAt), input.timeZone) === turnoverDay);
      if (survivor) {
        plan.ownershipTransfers.push({ id: row.id, calendarSourceId: survivor.calendarSourceId, sourceReference: survivor.sourceReference, ...(survivor.listingPropertyId ? { listingPropertyId: survivor.listingPropertyId, fixedPayoutAmount: survivor.fixedPayoutAmount } : {}) });
      } else {
        plan.cancels.push({ id: row.id, cleanerId: row.cleaner_id, dueAt: row.due_at });
      }
    }
  }

  return plan;
}
