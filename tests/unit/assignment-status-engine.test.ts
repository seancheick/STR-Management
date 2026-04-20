import { describe, expect, it } from "vitest";

import { transitionAssignment } from "@/lib/services/assignment-status-engine";

describe("transitionAssignment", () => {
  it("moves an unassigned job into assigned with pending acknowledgment", () => {
    const result = transitionAssignment(
      { status: "unassigned", ackStatus: "pending" },
      { action: "assign_cleaner" },
    );

    expect(result).toEqual({
      status: "assigned",
      ackStatus: "pending",
    });
  });

  it("accepts a pending assignment", () => {
    const result = transitionAssignment(
      { status: "assigned", ackStatus: "pending" },
      { action: "accept" },
    );

    expect(result).toEqual({
      status: "confirmed",
      ackStatus: "accepted",
    });
  });

  it("rejects completion without checklist proof", () => {
    expect(() =>
      transitionAssignment(
        { status: "in_progress", ackStatus: "accepted" },
        {
          action: "submit_for_review",
          proofChecklistComplete: false,
          proofPhotosComplete: true,
        },
      ),
    ).toThrowError("Assignment proof is incomplete.");
  });

  it("rejects completion without photo proof", () => {
    expect(() =>
      transitionAssignment(
        { status: "in_progress", ackStatus: "accepted" },
        {
          action: "submit_for_review",
          proofChecklistComplete: true,
          proofPhotosComplete: false,
        },
      ),
    ).toThrowError("Assignment proof is incomplete.");
  });

  it("moves an in-progress assignment into completed_pending_review when proof exists", () => {
    const result = transitionAssignment(
      { status: "in_progress", ackStatus: "accepted" },
      {
        action: "submit_for_review",
        proofChecklistComplete: true,
        proofPhotosComplete: true,
      },
    );

    expect(result).toEqual({
      status: "completed_pending_review",
      ackStatus: "accepted",
    });
  });

  it("marks an in-progress assignment ready when cleaner proof exists", () => {
    const result = transitionAssignment(
      { status: "in_progress", ackStatus: "accepted" },
      {
        action: "mark_unit_ready",
        proofChecklistComplete: true,
        proofPhotosComplete: true,
      },
    );

    expect(result).toEqual({
      status: "approved",
      ackStatus: "accepted",
    });
  });

  it("blocks accept after the acknowledgment window is closed", () => {
    expect(() =>
      transitionAssignment(
        { status: "assigned", ackStatus: "declined" },
        { action: "accept" },
      ),
    ).toThrowError("Action accept is not allowed from assigned/declined.");
  });

  it("allows cancelling from any non-terminal state", () => {
    const result = transitionAssignment(
      { status: "confirmed", ackStatus: "accepted" },
      { action: "cancel" },
    );

    expect(result).toEqual({
      status: "cancelled",
      ackStatus: "accepted",
    });
  });
});
