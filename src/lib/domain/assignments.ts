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
