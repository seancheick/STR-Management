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

  it("uses the property's calendar day, not UTC, for today and grouping", () => {
    // 9pm Eastern on Sep 28 is already Sep 29 in UTC (where Vercel runs).
    const evening = {
      ...baseAssignment,
      id: "evening",
      status: "confirmed",
      due_at: "2026-09-29T01:00:00Z",
      properties: { timezone: "America/New_York" },
    };
    const buckets = getCleanerAssignmentBuckets([evening], new Date("2026-09-28T23:00:00Z"));
    expect(buckets.active.map((a) => a.id)).toEqual(["evening"]);

    const groups = groupCleanerAssignmentsByDate([evening]);
    expect(groups[0]?.dateKey).toBe("2026-09-28");

    const inLA = { ...evening, properties: { timezone: "America/Los_Angeles" } };
    expect(groupCleanerAssignmentsByDate([inLA])[0]?.dateKey).toBe("2026-09-28");
    const inLondon = { ...evening, properties: { timezone: "Europe/London" } };
    expect(groupCleanerAssignmentsByDate([inLondon])[0]?.dateKey).toBe("2026-09-29");
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
  it("combines report entries and pending fixed payouts", () => {
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

    expect(summary.inReportsTotal).toBe(80);
    expect(summary.paidTotal).toBe(0);
    expect(summary.awaitingTotal).toBe(75);
    expect(summary.projectedTotal).toBe(155);
  });

  it("only counts paid_at-stamped money as paid; direct-paid jobs are not owed", () => {
    const summary = calculateCleanerPaySummary({
      payoutEntries: [
        { amount: 80, status: "included", paid_at: "2026-09-01T00:00:00Z" },
        { amount: 40, status: "included", paid_at: null },
      ],
      pendingAssignments: [
        { fixed_payout_amount: 60, paid_at: "2026-09-02T00:00:00Z" },
        { fixed_payout_amount: 75, paid_at: null },
      ],
    });

    expect(summary.paidTotal).toBe(140);
    expect(summary.inReportsTotal).toBe(120);
    expect(summary.awaitingTotal).toBe(75);
    expect(summary.projectedTotal).toBe(255);
  });
});

describe("timezone display helpers", () => {
  it("falls back to the app default instead of throwing on a bad zone", async () => {
    const { dateKeyInTimeZone, formatInTimeZone } = await import("@/lib/ical/timezone");
    expect(dateKeyInTimeZone(new Date("2026-09-29T01:00:00Z"), "Not/AZone")).toBe("2026-09-28");
    expect(
      formatInTimeZone("2026-09-28T15:00:00Z", { hour: "numeric", minute: "2-digit" }, "Eastern"),
    ).toMatch(/^11:00\sAM$/);
  });
});

describe("zonedDayTime", () => {
  it("builds local-day boundaries in the property zone, DST-safe", async () => {
    const { zonedDayTime } = await import("@/lib/ical/timezone");
    // 9pm EDT Sep 28 (= Sep 29 UTC): local day is still Sep 28.
    const now = new Date("2026-09-29T01:00:00Z");
    expect(zonedDayTime(now, 0, 0, "America/New_York").toISOString()).toBe("2026-09-28T04:00:00.000Z");
    expect(zonedDayTime(now, 1, 0, "America/New_York").toISOString()).toBe("2026-09-29T04:00:00.000Z");
    // Across the Nov 1 DST change, midnight moves from UTC-4 to UTC-5.
    expect(zonedDayTime(now, 35, 0, "America/New_York").toISOString()).toBe("2026-11-02T05:00:00.000Z");
  });
});
