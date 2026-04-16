import type {
  AssignmentAckStatus,
  AssignmentAction,
  AssignmentStatus,
} from "@/lib/domain/assignments";
import { terminalAssignmentStatuses } from "@/lib/domain/assignments";
import {
  assignmentStateSchema,
  assignmentTransitionContextSchema,
  type AssignmentTransitionContext,
} from "@/lib/validations/assignment-status";

type AssignmentState = {
  status: AssignmentStatus;
  ackStatus: AssignmentAckStatus;
};

function invalidTransition(action: AssignmentAction, state: AssignmentState): never {
  throw new Error(`Action ${action} is not allowed from ${state.status}/${state.ackStatus}.`);
}

export function canTransition(
  state: AssignmentState,
  transition: Omit<AssignmentTransitionContext, "status" | "ackStatus">,
) {
  try {
    transitionAssignment(state, transition);
    return true;
  } catch {
    return false;
  }
}

export function transitionAssignment(
  state: AssignmentState,
  transition: Omit<AssignmentTransitionContext, "status" | "ackStatus">,
): AssignmentState {
  const parsedState = assignmentStateSchema.parse(state);
  const parsedTransition = assignmentTransitionContextSchema.parse({
    ...state,
    ...transition,
  });

  if (
    terminalAssignmentStatuses.includes(
      parsedState.status as (typeof terminalAssignmentStatuses)[number],
    ) &&
    parsedTransition.action !== "cancel"
  ) {
    invalidTransition(parsedTransition.action, parsedState);
  }

  switch (parsedTransition.action) {
    case "assign_cleaner":
      if (parsedState.status !== "unassigned") {
        invalidTransition(parsedTransition.action, parsedState);
      }

      return {
        status: "assigned",
        ackStatus: "pending",
      };

    case "accept":
      if (parsedState.status !== "assigned" || parsedState.ackStatus !== "pending") {
        invalidTransition(parsedTransition.action, parsedState);
      }

      return {
        status: "confirmed",
        ackStatus: "accepted",
      };

    case "decline":
      if (parsedState.status !== "assigned" || parsedState.ackStatus !== "pending") {
        invalidTransition(parsedTransition.action, parsedState);
      }

      return {
        status: "assigned",
        ackStatus: "declined",
      };

    case "expire":
      if (parsedState.status !== "assigned" || parsedState.ackStatus !== "pending") {
        invalidTransition(parsedTransition.action, parsedState);
      }

      return {
        status: "assigned",
        ackStatus: "expired",
      };

    case "start":
      if (parsedState.status !== "confirmed" || parsedState.ackStatus !== "accepted") {
        invalidTransition(parsedTransition.action, parsedState);
      }

      return {
        status: "in_progress",
        ackStatus: "accepted",
      };

    case "submit_for_review":
      if (parsedState.status !== "in_progress" || parsedState.ackStatus !== "accepted") {
        invalidTransition(parsedTransition.action, parsedState);
      }

      if (!parsedTransition.proofChecklistComplete || !parsedTransition.proofPhotosComplete) {
        throw new Error("Assignment proof is incomplete.");
      }

      return {
        status: "completed_pending_review",
        ackStatus: "accepted",
      };

    case "approve":
      if (
        parsedState.status !== "completed_pending_review" ||
        parsedState.ackStatus !== "accepted"
      ) {
        invalidTransition(parsedTransition.action, parsedState);
      }

      return {
        status: "approved",
        ackStatus: "accepted",
      };

    case "reject_to_reclean":
      if (
        parsedState.status !== "completed_pending_review" ||
        parsedState.ackStatus !== "accepted"
      ) {
        invalidTransition(parsedTransition.action, parsedState);
      }

      return {
        status: "needs_reclean",
        ackStatus: "accepted",
      };

    case "reopen_to_unassigned":
      if (
        !(
          (parsedState.status === "assigned" &&
            (parsedState.ackStatus === "declined" || parsedState.ackStatus === "expired")) ||
          parsedState.status === "needs_reclean"
        )
      ) {
        invalidTransition(parsedTransition.action, parsedState);
      }

      return {
        status: "unassigned",
        ackStatus: "pending",
      };

    case "cancel":
      if (parsedState.status === "cancelled") {
        invalidTransition(parsedTransition.action, parsedState);
      }

      return {
        status: "cancelled",
        ackStatus: parsedState.ackStatus,
      };

    default: {
      const exhaustiveCheck: never = parsedTransition.action;
      return exhaustiveCheck;
    }
  }
}
