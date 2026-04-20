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

export function tightTurnoverMinutes(
  checkoutAt: string | null,
  dueAt: string,
): number | null {
  if (!checkoutAt) return null;
  const checkoutMs = new Date(checkoutAt).getTime();
  const dueMs = new Date(dueAt).getTime();
  if (!Number.isFinite(checkoutMs) || !Number.isFinite(dueMs)) return null;
  const diff = Math.round((dueMs - checkoutMs) / 60_000);
  return diff >= 0 ? diff : null;
}

export function isTightTurnover(
  checkoutAt: string | null,
  dueAt: string,
  thresholdMinutes: number = TIGHT_TURNOVER_THRESHOLD_MINUTES,
): boolean {
  const minutes = tightTurnoverMinutes(checkoutAt, dueAt);
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
