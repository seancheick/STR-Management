import { describe, expect, it } from "vitest";

import type { HostexCalendarDay } from "@/lib/hostex/client";
import { beforeSnapshot, compareReadback, priceWarnings, samePayload, validateChange, type ChangeTarget } from "@/lib/services/calendar-change-rules";

const TODAY = "2026-10-21";
const writable: ChangeTarget = { pricing_authority: "manual", price_readonly: false, channel_type: "booking.com" };
const day = (date: string, price: number | null, min = 2): HostexCalendarDay => ({
  date, price, inventory: 1,
  restrictions: { min_stay_on_arrival: min, max_stay_on_arrival: 0, min_stay_through: 0, max_stay_through: 0, exact_stay_on_arrival: 0, closed_on_arrival: false, closed_on_departure: false },
});
const cal = (...days: HostexCalendarDay[]) => new Map(days.map((d) => [d.date, d]));

describe("calendar change rules", () => {
  it("accepts a valid whole-dollar price change", () => {
    expect(validateChange("price", [{ start_date: "2026-11-01", end_date: "2026-11-03", price: 150 }], writable, TODAY)).toEqual([]);
  });

  it("refuses channel-derived plans, PriceLabs-owned calendars and unscanned calendars", () => {
    const r = [{ start_date: "2026-11-01", end_date: "2026-11-01", price: 150 }];
    expect(validateChange("price", r, { ...writable, price_readonly: true }, TODAY).join()).toMatch(/derivation/);
    expect(validateChange("price", r, { ...writable, pricing_authority: "pricelabs" }, TODAY).join()).toMatch(/PriceLabs/);
    expect(validateChange("price", r, { ...writable, price_readonly: null }, TODAY).join()).toMatch(/run_bookability_scan/);
  });

  it("allows restriction changes on derived plans and PriceLabs calendars", () => {
    expect(validateChange("restrictions", [{ start_date: "2026-11-01", end_date: "2026-11-30", min_stay_on_arrival: 2 }], { ...writable, price_readonly: true, pricing_authority: "pricelabs" }, TODAY)).toEqual([]);
  });

  it("refuses decimal prices, past dates, reversed ranges, overlaps and mixed changes", () => {
    const errors = validateChange("price", [
      { start_date: "2026-11-01", end_date: "2026-11-05", price: 149.5 },
      { start_date: "2026-10-20", end_date: "2026-10-22", price: 150 },
      { start_date: "2026-11-09", end_date: "2026-11-08", price: 150 },
      { start_date: "2026-11-05", end_date: "2026-11-06", price: 150, min_stay_on_arrival: 2 },
    ], writable, TODAY).join(" | ");
    expect(errors).toMatch(/integers only/);
    expect(errors).toMatch(/past/);
    expect(errors).toMatch(/before start_date/);
    expect(errors).toMatch(/overlaps another range on 2026-11-05/);
    expect(errors).toMatch(/cannot also change restrictions/);
  });

  it("refuses empty or contradictory restriction changes", () => {
    expect(validateChange("restrictions", [{ start_date: "2026-11-01", end_date: "2026-11-01" }], writable, TODAY).join()).toMatch(/at least one/);
    expect(validateChange("restrictions", [{ start_date: "2026-11-01", end_date: "2026-11-01", min_stay_on_arrival: 5, max_stay_on_arrival: 3 }], writable, TODAY).join()).toMatch(/above max/);
    expect(validateChange("restrictions", [{ start_date: "2026-11-01", end_date: "2026-11-01", closed_on_arrival: 1 as unknown as boolean }], writable, TODAY).join()).toMatch(/closed_on_arrival is invalid/);
  });

  it("refuses dates more than three years out", () => {
    expect(validateChange("price", [{ start_date: "2029-10-20", end_date: "2029-10-22", price: 100 }], writable, TODAY).join()).toMatch(/three years/);
  });

  it("warns on price swings over 40%", () => {
    const w = priceWarnings([{ start_date: "2026-11-01", end_date: "2026-11-02", price: 300 }], cal(day("2026-11-01", 150), day("2026-11-02", 290)));
    expect(w).toEqual(["2026-11-01–2026-11-02: 1 nights change by more than 40% from the current price."]);
  });

  it("verifies only when every requested date reads back with the requested value", () => {
    const r = [{ start_date: "2026-11-01", end_date: "2026-11-02", price: 150 }];
    expect(compareReadback("price", r, cal(day("2026-11-01", 150), day("2026-11-02", 150)))).toEqual([]);
    expect(compareReadback("price", r, cal(day("2026-11-01", 150), day("2026-11-02", null)))).toEqual([{ date: "2026-11-02", field: "price", requested: 150, observed: null }]);
    expect(compareReadback("restrictions", [{ start_date: "2026-11-01", end_date: "2026-11-01", min_stay_on_arrival: 2 }], cal(day("2026-11-01", 150, 7)))).toEqual([{ date: "2026-11-01", field: "min_stay_on_arrival", requested: 2, observed: 7 }]);
  });

  it("snapshots the values being replaced for a later reversal", () => {
    expect(beforeSnapshot("price", [{ start_date: "2026-11-01", end_date: "2026-11-02", price: 150 }], cal(day("2026-11-01", 140)))).toEqual({ "2026-11-01": 140, "2026-11-02": null });
    expect(beforeSnapshot("restrictions", [{ start_date: "2026-11-01", end_date: "2026-11-01", min_stay_on_arrival: 2 }], cal(day("2026-11-01", 140, 7)))["2026-11-01"]).toMatchObject({ min_stay_on_arrival: 7, closed_on_arrival: false });
  });

  it("treats a retry as identical regardless of jsonb key order", () => {
    const sent = { channelType: "booking.com", listingId: "x", kind: "price", ranges: [{ start_date: "2026-11-01", end_date: "2026-11-02", price: 150 }] };
    const stored = { kind: "price", ranges: [{ price: 150, end_date: "2026-11-02", start_date: "2026-11-01" }], listingId: "x", channelType: "booking.com" };
    expect(samePayload(stored, sent)).toBe(true);
    expect(samePayload(stored, { ...sent, ranges: [{ ...sent.ranges[0], price: 151 }] })).toBe(false);
  });
});
