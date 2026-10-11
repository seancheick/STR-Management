import { describe, expect, it } from "vitest";
import { calendarDate, calendarDayKey, calendarInstantKey, calendarRangeLabel, reservationColumns, calendarWindow, calendarWindowContains, calendarListingId, calendarEdgeDirection } from "@/lib/services/calendar-display";

describe("calendar display", () => {
  it("formats same-month and cross-year ranges without incomplete Intl skeletons", () => {
    expect(calendarRangeLabel(calendarDate("2026-10-10"), calendarDate("2026-10-23"))).toBe("Oct 10 – 23, 2026");
    expect(calendarRangeLabel(calendarDate("2026-12-28"), calendarDate("2027-01-10"))).toBe("Dec 28, 2026 – Jan 10, 2027");
  });
  it("keeps civil cells independent of UTC midnight conversion", () => {
    expect(calendarDayKey(calendarDate("2026-10-11"))).toBe("2026-10-11");
    expect(calendarInstantKey("2026-10-12T01:00:00Z", "America/New_York")).toBe("2026-10-11");
    expect(calendarInstantKey("2026-10-12T01:00:00Z", "UTC")).toBe("2026-10-12");
  });
  it("includes checkout and adjacent checkin on the same day, including midnight departures", () => {
    const days = ["2026-10-10", "2026-10-11", "2026-10-12"];
    expect(reservationColumns("2026-10-10T19:00:00Z", "2026-10-11T15:00:00Z", days, "America/New_York")).toMatchObject({ startCol: 0, endCol: 1 });
    expect(reservationColumns("2026-10-11T19:00:00Z", "2026-10-12T15:00:00Z", days, "America/New_York")).toMatchObject({ startCol: 1, endCol: 2 });
    expect(reservationColumns("2026-10-10T19:00:00Z", "2026-10-11T04:00:00Z", days, "America/New_York")).toMatchObject({ startCol: 0, endCol: 1 });
  });
  it("clips by civil date across DST and hides outside-window bookings", () => {
    const days = ["2026-10-31", "2026-11-01", "2026-11-02"];
    expect(reservationColumns("2026-10-30T19:00:00Z", "2026-11-02T16:00:00Z", days, "America/New_York")).toEqual({ startCol: 0, endCol: 2, startsInWindow: false, endsInWindow: true });
    expect(reservationColumns("2026-11-03T20:00:00Z", "2026-11-04T16:00:00Z", days, "America/New_York")).toBeNull();
  });
});


describe("calendar export windows", () => {
  it("rejects impossible, reversed, and non-civil date inputs", () => {
    expect(calendarWindow("2026-02-30", "2026-03-01")).toBeNull();
    expect(calendarWindow("2026-10-12", "2026-10-11")).toBeNull();
    expect(calendarWindow("2026-10-11T00:00:00Z", "2026-10-12")).toBeNull();
    expect(calendarWindow("", "2026-10-12")).toBeNull();
  });
  it("includes the final local day even when the instant is tomorrow in UTC", () => {
    const window = calendarWindow("2026-10-10", "2026-10-23")!;
    const finalEvening = "2026-10-24T03:30:00Z";
    expect(finalEvening >= window.queryStart && finalEvening <= window.queryEnd).toBe(true);
    expect(calendarWindowContains(finalEvening, window.start, window.end, "America/New_York")).toBe(true);
    expect(calendarWindowContains("2026-10-24T04:00:00Z", window.start, window.end, "America/New_York")).toBe(false);
    expect(calendarWindowContains("2026-10-10T03:59:00Z", window.start, window.end, "America/New_York")).toBe(false);
  });
  it("supports a one-day window and leap-year dates", () => {
    expect(calendarWindow("2028-02-29", "2028-02-29")).not.toBeNull();
    expect(calendarWindowContains("2028-03-01T04:30:00Z", "2028-02-29", "2028-02-29", "America/New_York")).toBe(true);
  });
});


it("preserves listing configuration identity independently of physical-floor deduplication", () => {
  expect(calendarListingId({ property_id: "first-floor", listing_property_id: "first-floor-3bed" })).toBe("first-floor-3bed");
  expect(calendarListingId({ property_id: "first-floor", listing_property_id: "first-floor" })).toBe("first-floor");
  expect(calendarListingId({ property_id: "first-floor" })).toBe("first-floor");
});


describe("horizontal calendar paging", () => {
  it("requires an outward gesture at the corresponding edge", () => {
    expect(calendarEdgeDirection(0, 2180, 900, -40)).toBe("previous");
    expect(calendarEdgeDirection(1280, 2180, 900, 40)).toBe("next");
    expect(calendarEdgeDirection(0, 2180, 900, 40)).toBeNull();
    expect(calendarEdgeDirection(1280, 2180, 900, -40)).toBeNull();
    expect(calendarEdgeDirection(600, 2180, 900, 40)).toBeNull();
  });
  it("cannot page from initial scrolling or a viewport without horizontal overflow", () => {
    expect(calendarEdgeDirection(0, 2180, 900, 0)).toBeNull();
    expect(calendarEdgeDirection(0, 900, 900, -40)).toBeNull();
    expect(calendarEdgeDirection(1279.5, 2180, 900, 20)).toBe("next");
  });
});
