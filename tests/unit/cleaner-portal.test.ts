import { describe, expect, it } from "vitest";

import {
  calculateCleanerPaySummary,
  getCleanerAssignmentBuckets,
  groupCleanerAssignmentsByDate,
} from "@/lib/services/cleaner-portal";

const baseAssignment = {
  id: "assignment-1",
  due_at: "2026-04-20T16:00:00Z",
  status: "assigned",
  fixed_payout_amount: 75,
};

describe("cleaner portal assignment buckets", () => {
  it("separates active, upcoming, and history assignments", () => {
    const buckets = getCleanerAssignmentBuckets([
      { ...baseAssignment, id: "active-1", status: "in_progress" },
      { ...baseAssignment, id: "future-1", status: "confirmed", due_at: "2026-04-23T16:00:00Z" },
      { ...baseAssignment, id: "history-1", status: "approved", due_at: "2026-04-19T16:00:00Z" },
      { ...baseAssignment, id: "cancelled-1", status: "cancelled", due_at: "2026-04-24T16:00:00Z" },
    ], new Date("2026-04-20T12:00:00Z"));

    expect(buckets.active.map((assignment) => assignment.id)).toEqual(["active-1"]);
    expect(buckets.schedule.map((assignment) => assignment.id)).toEqual(["future-1"]);
    expect(buckets.history.map((assignment) => assignment.id)).toEqual(["history-1"]);
  });

  it("groups assignments by local calendar date", () => {
    const groups = groupCleanerAssignmentsByDate([
      { ...baseAssignment, id: "a", due_at: "2026-04-20T16:00:00Z" },
      { ...baseAssignment, id: "b", due_at: "2026-04-21T16:00:00Z" },
      { ...baseAssignment, id: "c", due_at: "2026-04-20T18:00:00Z" },
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0]?.assignments.map((assignment) => assignment.id)).toEqual(["a", "c"]);
    expect(groups[1]?.assignments.map((assignment) => assignment.id)).toEqual(["b"]);
  });
});

describe("calculateCleanerPaySummary", () => {
  it("combines paid batch entries and pending fixed payouts", () => {
    const summary = calculateCleanerPaySummary({
      payoutEntries: [
        { amount: 80, status: "included" },
        { amount: 20, status: "disputed" },
      ],
      pendingAssignments: [
        { fixed_payout_amount: 75 },
        { fixed_payout_amount: null },
      ],
    });

    expect(summary.paidTotal).toBe(80);
    expect(summary.pendingTotal).toBe(75);
    expect(summary.projectedTotal).toBe(155);
  });
});
