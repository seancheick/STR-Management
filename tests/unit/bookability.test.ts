import { describe, expect, it } from "vitest";

import type { HostexCalendarDay } from "@/lib/hostex/client";
import { scanBookability, scanIsStale, toRanges, type ListingSettings, type PriceLabsSync } from "@/lib/services/bookability";

const NOW = new Date("2026-10-21T12:00:00Z");
const DATES = ["2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24"];
const open = (n: number) => ({ min_stay_on_arrival: 2, max_stay_on_arrival: 0, min_stay_through: 0, max_stay_through: 0, exact_stay_on_arrival: 0, closed_on_arrival: false, closed_on_departure: false, ...(n >= 7 ? { min_stay_on_arrival: n } : {}) });
const days = (prices: Array<number | null>, patch: Partial<HostexCalendarDay> = {}): HostexCalendarDay[] =>
  DATES.map((date, i) => ({ date, price: prices[i] ?? null, inventory: 1, restrictions: open(2), ...patch }));
const listing = (id: string, channel = "booking.com", over: Partial<ListingSettings> = {}): ListingSettings => ({
  channel_type: channel, listing_id: id, hostex_property_id: 1, pricing_authority: "manual", intentionally_closed: false,
  expected_ratio: null, authority_changed_at: "2026-10-01T00:00:00Z", price_snapshot: null, prices_changed_at: null, ...over,
});
const allOpen = new Map([[1, new Map(DATES.map((d) => [d, true]))]]);
const AIRBNB = { channel_type: "airbnb", listing_id: "air", calendar: days([100, 100, 200, 100]) };

function scan(listings: ListingSettings[], calendars: Array<{ channel_type: string; listing_id: string; calendar: HostexCalendarDay[] }>, availability = allOpen, now = NOW) {
  return scanBookability({ listings: [listing("air", "airbnb"), ...listings], calendars: [AIRBNB, ...calendars], availability, now });
}
const rules = (r: ReturnType<typeof scan>) => r.findings.map((f) => `${f.subject}:${f.rule}`);

describe("bookability guardian", () => {
  it("flags an unpriced rate plan as critical across its whole open range", () => {
    const r = scan([listing("40652986")], [{ channel_type: "booking.com", listing_id: "40652986", calendar: days([null, null, null, null]) }]);
    const f = r.findings.find((x) => x.rule === "missing_price")!;
    expect(f.severity).toBe("critical");
    expect(f.detail.ranges).toEqual([{ start: "2026-10-21", end: "2026-10-24", days: 4 }]);
  });

  it("points channel-derived plans at the extranet instead of an API price push", () => {
    const r = scan([listing("nr", "booking.com", { price_readonly: true })], [{ channel_type: "booking.com", listing_id: "nr", calendar: days([null, null, null, null]) }]);
    expect(r.findings[0]).toMatchObject({ rule: "missing_price", severity: "critical", detail: { priceReadonly: true } });
    expect(r.findings[0]!.detail.action).toMatch(/extranet/);
  });

  it("ignores booked or blocked nights", () => {
    const booked = new Map([[1, new Map(DATES.map((d) => [d, false]))]]);
    expect(rules(scan([listing("b")], [{ channel_type: "booking.com", listing_id: "b", calendar: days([null, null, null, null], { inventory: 0 }) }], booked))).toEqual([]);
  });

  it("does not alert on an intentionally closed calendar", () => {
    const cal = [{ channel_type: "booking.com", listing_id: "c", calendar: days([90, 90, 180, 90], { inventory: 0 }) }];
    expect(rules(scan([listing("c", "booking.com", { intentionally_closed: true })], cal))).toEqual([]);
    expect(rules(scan([listing("c")], cal))).toEqual(["c:closed_while_available"]);
  });

  it("accepts a stable derived plan and warns when one night breaks its ratio", () => {
    expect(rules(scan([listing("d")], [{ channel_type: "booking.com", listing_id: "d", calendar: days([68, 68, 136, 68]) }]))).toEqual([]);
    const r = scan([listing("d")], [{ channel_type: "booking.com", listing_id: "d", calendar: days([68, 68, 136, 100]) }]);
    expect(rules(r)).toEqual(["d:ratio_drift"]);
    expect(r.findings[0]!.detail.ranges).toEqual([{ start: "2026-10-24", end: "2026-10-24", days: 1 }]);
  });

  it("uses a configured multiplier instead of the observed one", () => {
    expect(rules(scan([listing("e", "booking.com", { expected_ratio: 0.77 })], [{ channel_type: "booking.com", listing_id: "e", calendar: days([68, 68, 136, 68]) }]))).toEqual(["e:ratio_drift"]);
  });

  it("reports 7-night minimum stays as information", () => {
    const r = scan([listing("f")], [{ channel_type: "booking.com", listing_id: "f", calendar: days([90, 90, 180, 90], { restrictions: open(7) }) }]);
    expect(r.findings.map((f) => [f.rule, f.severity])).toEqual([["far_out_min_stay", "info"]]);
  });

  it("warns on closed-to-arrival and min above max on open dates", () => {
    const cal = days([90, 90, 180, 90]);
    cal[0]!.restrictions = { ...cal[0]!.restrictions, closed_on_arrival: true };
    cal[2]!.restrictions = { ...cal[2]!.restrictions, min_stay_on_arrival: 4, max_stay_on_arrival: 3 };
    const r = scan([listing("g")], [{ channel_type: "booking.com", listing_id: "g", calendar: cal }]);
    expect(r.findings.find((f) => f.rule === "restriction_conflict")!.detail.ranges).toEqual([
      { start: "2026-10-21", end: "2026-10-21", days: 1 }, { start: "2026-10-23", end: "2026-10-23", days: 1 },
    ]);
  });

  it("flags a pricing authority whose prices have not moved for 72 hours, never a manual one", () => {
    const old = "2026-10-17T00:00:00Z";
    const snapshot = Object.fromEntries(DATES.map((d, i) => [d, [90, 90, 180, 90][i]!]));
    const cal = [{ channel_type: "booking.com", listing_id: "h", calendar: days([90, 90, 180, 90]) }];
    const stale = scan([listing("h", "booking.com", { pricing_authority: "pricelabs", price_snapshot: snapshot, prices_changed_at: old })], cal);
    expect(stale.findings.find((f) => f.rule === "pricing_stale")).toMatchObject({ subject: "pricelabs", severity: "critical" });
    expect(stale.updates.find((u) => u.listing_id === "h")!.prices_changed_at).toBe(old);
    expect(rules(scan([listing("h", "booking.com", { price_snapshot: snapshot, prices_changed_at: old })], cal))).toEqual([]);
  });

  it("restarts the staleness clock when prices change or the authority is newly assigned", () => {
    const cal = [{ channel_type: "booking.com", listing_id: "i", calendar: days([90, 95, 180, 90]) }];
    const before = Object.fromEntries(DATES.map((d) => [d, 90]));
    const moved = scan([listing("i", "booking.com", { pricing_authority: "pricelabs", price_snapshot: before, prices_changed_at: "2026-10-01T00:00:00Z" })], cal);
    expect(moved.findings.some((f) => f.rule === "pricing_stale")).toBe(false);
    expect(moved.updates.find((u) => u.listing_id === "i")!.prices_changed_at).toBe(NOW.toISOString());
    const same = Object.fromEntries(DATES.map((d, i) => [d, [90, 95, 180, 90][i]!]));
    const handedOver = scan([listing("i", "booking.com", { pricing_authority: "pricelabs", price_snapshot: same, prices_changed_at: "2026-10-01T00:00:00Z", authority_changed_at: "2026-10-21T02:00:00Z" })], cal);
    expect(handedOver.findings.some((f) => f.rule === "pricing_stale")).toBe(false);
  });

  it("ignores the sliding window when comparing price snapshots", () => {
    const cal = [{ channel_type: "booking.com", listing_id: "j", calendar: days([90, 90, 180, 90]) }];
    const shifted = { "2026-10-20": 50, "2026-10-21": 90, "2026-10-22": 90, "2026-10-23": 180 };
    const r = scan([listing("j", "booking.com", { price_snapshot: shifted, prices_changed_at: "2026-10-10T00:00:00Z" })], cal);
    expect(r.updates.find((u) => u.listing_id === "j")!.prices_changed_at).toBe("2026-10-10T00:00:00Z");
  });

  describe("PriceLabs push record", () => {
    // Prices never change in these cases: staleness must come from PriceLabs' own push time.
    const snapshot = Object.fromEntries(DATES.map((d, i) => [d, [100, 100, 200, 100][i]!]));
    const owned = (over: Partial<ListingSettings> = {}) => listing("air", "airbnb", { pricing_authority: "pricelabs", price_snapshot: snapshot, prices_changed_at: "2026-10-01T00:00:00Z", ...over });
    const run = (pricelabs: PriceLabsSync | undefined, over: Partial<ListingSettings> = {}) =>
      scanBookability({ listings: [owned(over)], calendars: [AIRBNB], availability: allOpen, now: NOW, pricelabs }).findings.filter((f) => f.rule === "pricing_stale");
    const synced = (lastPushed: string | null, push_enabled = true, channel_ids = ["air"]): PriceLabsSync =>
      ({ ok: true, listings: [{ name: "1st FL 2BD", push_enabled, last_date_pushed: lastPushed, channel_ids }] });

    it("trusts a recent push even when no price changed", () => {
      expect(run(synced("2026-10-21T02:00:00Z"))).toEqual([]);
    });

    it("flags a property PriceLabs has not pushed for 36 hours", () => {
      const [f] = run(synced("2026-10-17T12:47:00Z"));
      expect(f).toMatchObject({ severity: "critical", subject: "pricelabs" });
      expect(f!.detail.cause).toBe("1st FL 2BD: no push in 95 hours");
    });

    it("flags sync turned off and properties missing from PriceLabs", () => {
      expect(run(synced("2026-10-21T02:00:00Z", false))[0]!.detail.cause).toBe("1st FL 2BD: sync turned off in PriceLabs");
      expect(run(synced("2026-10-21T02:00:00Z", true, ["other"]))[0]!.detail.cause).toBe("Hostex property 1: not found in PriceLabs");
    });

    it("matches a property that only has a Booking.com calendar", () => {
      const booking = listing("673162101-19469074", "booking.com", { pricing_authority: "pricelabs", price_snapshot: snapshot, prices_changed_at: "2026-10-01T00:00:00Z" });
      const sync = (ids: string[]): PriceLabsSync => ({ ok: true, listings: [{ name: "Booking-only", push_enabled: true, last_date_pushed: "2026-10-21T02:00:00Z", channel_ids: ids }] });
      const run1 = (s: PriceLabsSync) => scanBookability({ listings: [booking], calendars: [{ channel_type: "booking.com", listing_id: "673162101-19469074", calendar: days([110, 110, 220, 110]) }], availability: allOpen, now: NOW, pricelabs: s }).findings.filter((f) => f.rule === "pricing_stale");
      expect(run1(sync(["673162101-19469074"]))).toEqual([]);
      expect(run1(sync(["other"]))[0]!.detail.cause).toBe("Hostex property 1: not found in PriceLabs");
    });

    it("gives a newly assigned authority 36 hours before alerting", () => {
      expect(run(synced("2026-10-17T12:47:00Z"), { authority_changed_at: "2026-10-21T00:00:00Z" })).toEqual([]);
    });

    it("warns instead of guessing when the PriceLabs API cannot be read", () => {
      expect(run({ ok: false, error: "PriceLabs /v1/listings failed: API_KEY_INVALID" })).toMatchObject([{ severity: "warning", subject: "pricelabs" }]);
    });

    it("falls back to price changes when no PriceLabs key is configured", () => {
      expect(run(undefined)).toMatchObject([{ severity: "critical", detail: { problem: "PriceLabs has not changed any price in 492 hours" } }]);
    });
  });

  it("raises a critical finding when Hostex returns no calendar for a listing", () => {
    expect(scan([listing("k")], []).findings.map((f) => [f.subject, f.rule, f.severity])).toEqual([["k", "missing_price", "critical"]]);
  });

  it("treats a scanner without a success in 26 hours as stale", () => {
    expect(scanIsStale(null, NOW)).toBe(true);
    expect(scanIsStale("2026-10-20T09:00:00Z", NOW)).toBe(true);
    expect(scanIsStale("2026-10-21T08:00:00Z", NOW)).toBe(false);
  });

  it("groups dates into ranges across month boundaries", () => {
    expect(toRanges(["2026-11-01", "2026-10-31", "2026-11-03"])).toEqual([
      { start: "2026-10-31", end: "2026-11-01", days: 2 }, { start: "2026-11-03", end: "2026-11-03", days: 1 },
    ]);
  });
});
