export const assignmentStatuses = [
  "unassigned",
  "assigned",
  "confirmed",
  "in_progress",
  "completed_pending_review",
  "approved",
  "needs_reclean",
  "cancelled",
] as const;

export const assignmentAckStatuses = [
  "pending",
  "accepted",
  "declined",
  "expired",
] as const;

export const assignmentActions = [
  "assign_cleaner",
  "accept",
  "decline",
  "expire",
  "start",
  "submit_for_review",
  "mark_unit_ready",
  "approve",
  "reject_to_reclean",
  "reopen_to_unassigned",
  "cancel",
] as const;

export type AssignmentStatus = (typeof assignmentStatuses)[number];
export type AssignmentAckStatus = (typeof assignmentAckStatuses)[number];
export type AssignmentAction = (typeof assignmentActions)[number];

export const terminalAssignmentStatuses = ["approved", "cancelled"] as const;

/**
 * Tight turnover: the cleaning deadline is dangerously close to the guest checkout.
 * Default threshold 6 hours matches an aggressive same-day turn (11am checkout → 3pm check-in = 4h).
 * Hosts want a visual flag so they don't oversleep on an unassigned tight turn.
 */
export const TIGHT_TURNOVER_THRESHOLD_MINUTES = 360;

/**
 * Minutes between the guest's checkout and the NEXT guest's arrival.
 * Accepts null nextArrivalAt (= no upcoming booking known → not tight).
 */
export function tightTurnoverMinutes(
  checkoutAt: string | null,
  nextArrivalAt: string | null,
): number | null {
  if (!checkoutAt || !nextArrivalAt) return null;
  const checkoutMs = new Date(checkoutAt).getTime();
  const arriveMs = new Date(nextArrivalAt).getTime();
  if (!Number.isFinite(checkoutMs) || !Number.isFinite(arriveMs)) return null;
  const diff = Math.round((arriveMs - checkoutMs) / 60_000);
  return diff >= 0 ? diff : null;
}

export function isTightTurnover(
  checkoutAt: string | null,
  nextArrivalAt: string | null,
  thresholdMinutes: number = TIGHT_TURNOVER_THRESHOLD_MINUTES,
): boolean {
  const minutes = tightTurnoverMinutes(checkoutAt, nextArrivalAt);
  return minutes !== null && minutes <= thresholdMinutes;
}

export function formatTurnoverWindow(minutes: number | null): string | null {
  if (minutes === null) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
