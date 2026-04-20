import { describe, expect, it } from "vitest";

import { advanceNextRun } from "@/lib/domain/recurring";

describe("advanceNextRun", () => {
  it("adds 7 days for weekly", () => {
    const from = new Date("2026-04-20T15:00:00Z");
    const next = advanceNextRun(from, "weekly");
    expect(next.toISOString().slice(0, 10)).toBe("2026-04-27");
  });

  it("adds 1 month for monthly", () => {
    const from = new Date("2026-04-20T15:00:00Z");
    const next = advanceNextRun(from, "monthly");
    expect(next.getMonth()).toBe(from.getMonth() + 1);
    expect(next.getDate()).toBe(20);
  });

  it("adds 3 months for quarterly", () => {
    const from = new Date("2026-01-15T00:00:00Z");
    const next = advanceNextRun(from, "quarterly");
    expect(next.getUTCMonth()).toBe(3); // April (0-indexed)
  });

  it("adds 1 year for annual", () => {
    const from = new Date("2026-04-20T00:00:00Z");
    const next = advanceNextRun(from, "annual");
    expect(next.getUTCFullYear()).toBe(2027);
  });
});
