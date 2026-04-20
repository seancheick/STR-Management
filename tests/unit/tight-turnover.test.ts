import { describe, expect, it } from "vitest";

import {
  formatTurnoverWindow,
  isTightTurnover,
  tightTurnoverMinutes,
} from "@/lib/domain/assignments";

describe("tightTurnoverMinutes", () => {
  it("returns null when checkout is missing", () => {
    expect(tightTurnoverMinutes(null, "2026-05-01T15:00:00Z")).toBeNull();
  });

  it("returns the gap in minutes for a standard same-day turn", () => {
    // 11:00 checkout → 15:00 due = 4 hours = 240 min
    expect(
      tightTurnoverMinutes("2026-05-01T11:00:00Z", "2026-05-01T15:00:00Z"),
    ).toBe(240);
  });

  it("returns null if due is before checkout (inverted)", () => {
    expect(
      tightTurnoverMinutes("2026-05-01T15:00:00Z", "2026-05-01T11:00:00Z"),
    ).toBeNull();
  });
});

describe("isTightTurnover", () => {
  it("flags a 4-hour turn at default 6h threshold", () => {
    expect(
      isTightTurnover("2026-05-01T11:00:00Z", "2026-05-01T15:00:00Z"),
    ).toBe(true);
  });

  it("does not flag a 24-hour turn", () => {
    expect(
      isTightTurnover("2026-05-01T11:00:00Z", "2026-05-02T15:00:00Z"),
    ).toBe(false);
  });

  it("respects a custom threshold", () => {
    // 5h turn with a 4h threshold is not tight
    expect(
      isTightTurnover("2026-05-01T10:00:00Z", "2026-05-01T15:00:00Z", 240),
    ).toBe(false);
  });
});

describe("formatTurnoverWindow", () => {
  it("returns null for null input", () => {
    expect(formatTurnoverWindow(null)).toBeNull();
  });

  it("formats hours + minutes", () => {
    expect(formatTurnoverWindow(245)).toBe("4h 5m");
  });

  it("drops minutes when zero", () => {
    expect(formatTurnoverWindow(240)).toBe("4h");
  });

  it("drops hours when zero", () => {
    expect(formatTurnoverWindow(45)).toBe("45m");
  });
});
