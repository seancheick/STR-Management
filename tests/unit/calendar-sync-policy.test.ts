import { describe, expect, it } from "vitest";
import { shouldImportTurnover, nextArrivalAfterCheckout } from "@/lib/services/calendar-sync-policy";
import type { TurnoverCandidate } from "@/lib/ical/parser";

const now = new Date("2026-10-11T12:00:00Z");
const future = { dueAt: "2026-10-12T19:00:00Z" } as TurnoverCandidate;

describe("calendar cleaning import policy", () => {
  it("keeps old feeds from recreating overdue unassigned work", () => {
    expect(shouldImportTurnover({ ...future, dueAt: now.toISOString() }, [], now)).toBe(false);
    expect(shouldImportTurnover({ ...future, dueAt: "2026-10-01T19:00:00Z" }, [], now)).toBe(false);
  });
  it.each(["unassigned", "assigned", "confirmed", "in_progress", "completed_pending_review", "approved", "needs_reclean"])("preserves the existing %s cleaning despite another feed UID", (status) => {
    expect(shouldImportTurnover(future, [{ status }], now)).toBe(false);
  });
  it("creates upcoming work only when there is no active cleaning", () => {
    expect(shouldImportTurnover(future, [], now)).toBe(true);
    expect(shouldImportTurnover(future, [{ status: "cancelled" }], now)).toBe(true);
  });
});


describe("physical unit next arrival", () => {
  it("uses the alternate listing same-day arrival instead of the current feed's later stay", () => {
    expect(nextArrivalAfterCheckout("2026-10-12T15:00:00Z", ["2026-10-01T19:00:00Z", "2026-10-20T19:00:00Z", "2026-10-12T19:00:00Z"])).toBe("2026-10-12T19:00:00Z");
  });
  it("returns null when every reservation started before checkout", () => {
    expect(nextArrivalAfterCheckout("2026-10-12T15:00:00Z", ["2026-10-01T19:00:00Z"])).toBeNull();
  });
});
