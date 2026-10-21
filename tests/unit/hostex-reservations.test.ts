import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ from: vi.fn(), getProperties: vi.fn(), getReservations: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: () => ({ from: mocks.from }) }));
vi.mock("@/lib/notifications/notification-service", () => ({ sendNotification: vi.fn() }));

import type { HostexReservation } from "@/lib/hostex/client";
import { planHostexReconciliation, type HostexPlanInput, type HostexPlanJob } from "@/lib/hostex/reservation-plan";
import { hostexChannel } from "@/lib/reservations/channel";
import { withoutHostexMirrors } from "@/lib/services/calendar-history";

const tz = "America/New_York";
const listings = [
  { id: "two-bed", ownerId: "owner", hostexPropertyId: 101, unitId: "unit", timeZone: tz },
  { id: "three-bed", ownerId: "owner", hostexPropertyId: 102, unitId: "unit", timeZone: tz },
  { id: "basement", ownerId: "owner", hostexPropertyId: 103, unitId: "basement", timeZone: tz },
];
const stay = (code: string, property: number, checkIn: string, checkOut: string, extra: Partial<HostexReservation> = {}): HostexReservation => ({
  reservation_code: code, stay_code: code, channel_id: code, property_id: property, channel_type: "airbnb", listing_id: "1",
  check_in_date: checkIn, check_out_date: checkOut, status: "accepted", guest_name: "Example Guest", ...extra,
});
// 11:00 EDT checkout and 15:00 EDT deadline, as the iCal parser stores date-only stays.
const job = (id: string, day: string, extra: Partial<HostexPlanJob> = {}): HostexPlanJob => ({
  id, ownerId: "owner", propertyId: "unit", status: "unassigned", sourceType: "ical", checkoutAt: `${day}T15:00:00.000Z`, dueAt: `${day}T19:00:00.000Z`,
  cleanerId: null, hostexReservationCode: null, bookingChannel: "hostex", reservationCancelledAt: null, locked: false, ...extra,
});
const plan = (overrides: Partial<HostexPlanInput>) => planHostexReconciliation({
  stays: [], tokenPropertyIds: [101, 102, 103], listings, jobs: [], cutoffs: { owner: "2026-10-10" }, now: new Date("2026-10-21T12:00:00Z"), ...overrides,
});

describe("Hostex reservations drive cleanings", () => {
  it("links the iCal job on the same physical unit and checkout day instead of duplicating it", () => {
    const result = plan({ stays: [stay("HM1", 102, "2026-10-24", "2026-10-26")], jobs: [job("ical-job", "2026-10-26")] });
    expect(result.creates).toEqual([]);
    expect(result.links).toEqual([{ jobId: "ical-job", ownerId: "owner", code: "HM1", patch: { hostex_reservation_code: "HM1", booking_channel: "airbnb" } }]);
    expect(result.reservations[0]).toMatchObject({ property_id: "unit", listing_property_id: "three-bed", source_type: "hostex", source_reference: "hostex:HM1",
      platform: "airbnb", guest_name: "Example Guest", start_at: "2026-10-24T19:00:00.000Z", end_at: "2026-10-26T15:00:00.000Z" });
  });

  it("re-running after the link or create writes nothing new", () => {
    const stays = [stay("HM1", 101, "2026-10-24", "2026-10-26"), stay("HM2", 103, "2026-10-27", "2026-10-29")];
    const first = plan({ stays, jobs: [job("ical-job", "2026-10-26")] });
    expect(first.creates.map((c) => c.code)).toEqual(["HM2"]);
    const second = plan({ stays, jobs: [
      job("ical-job", "2026-10-26", { hostexReservationCode: "HM1", bookingChannel: "airbnb" }),
      job("hostex-job", "2026-10-29", { propertyId: "basement", sourceType: "hostex", hostexReservationCode: "HM2", bookingChannel: "airbnb" }),
    ] });
    expect([second.links, second.creates, second.moves, second.cancels, second.flags].flat()).toEqual([]);
    expect(second.summary.matched).toBe(2);
  });

  it("dedupes a stay repeated across pages and never creates two jobs for one unit and day", () => {
    const result = plan({ stays: [stay("HM1", 101, "2026-10-24", "2026-10-26"), stay("HM1", 101, "2026-10-24", "2026-10-26"), stay("HM9", 102, "2026-10-25", "2026-10-26")] });
    expect(result.reservations).toHaveLength(2);
    expect(result.creates).toHaveLength(1);
    expect(result.creates[0]).toMatchObject({ unitId: "unit", listingId: "two-bed", checkoutAt: "2026-10-26T15:00:00.000Z", dueAt: "2026-10-26T19:00:00.000Z" });
  });

  it("maps Hostex channel types to booking channels", () => {
    expect(["airbnb", "booking.com", "vrbo", "hostex_direct", "agoda", "constructor"].map(hostexChannel)).toEqual(["airbnb", "booking", "vrbo", "hostex", "other", "other"]);
    expect(plan({ stays: [stay("B1", 103, "2026-10-24", "2026-10-25", { channel_type: "booking.com" })] }).creates[0].channel).toBe("booking");
  });

  it("never creates a job on or before the reconciled-through date", () => {
    const result = plan({ now: new Date("2026-10-01T12:00:00Z"), stays: [stay("OLD", 103, "2026-10-07", "2026-10-10"), stay("NEW", 103, "2026-10-08", "2026-10-11")] });
    expect(result.summary.skippedBeforeCutoff).toBe(1);
    expect(result.creates.map((c) => c.code)).toEqual(["NEW"]);
  });

  it("does not create a job whose deadline has passed", () => {
    const result = plan({ cutoffs: {}, stays: [stay("TODAY", 103, "2026-10-19", "2026-10-21")], now: new Date("2026-10-21T20:00:00Z") });
    expect(result.creates).toEqual([]);
    expect(result.summary.skippedPast).toBe(1);
  });

  it("ignores stays outside the token's properties, unmapped, or mapped by two tenants", () => {
    const result = plan({
      tokenPropertyIds: [101, 103, 104],
      listings: [...listings, { id: "intruder", ownerId: "other", hostexPropertyId: 103, unitId: "theirs", timeZone: tz }],
      stays: [stay("NOT-TOKEN", 102, "2026-10-24", "2026-10-26"), stay("SHARED", 103, "2026-10-24", "2026-10-26"), stay("UNMAPPED", 104, "2026-10-24", "2026-10-26"), stay("OK", 101, "2026-10-24", "2026-10-26")],
    });
    expect(result.summary.ignored).toBe(3);
    expect(result.creates.map((c) => c.code)).toEqual(["OK"]);
    expect(result.reservations.map((r) => r.source_reference)).toEqual(["hostex:OK"]);
  });

  it("cancels an unstarted job for a cancelled stay and flags a started or paid one", () => {
    const cancelled = (code: string, out: string) => stay(code, 101, "2026-10-22", out, { status: "cancelled" });
    const result = plan({
      stays: [cancelled("C1", "2026-10-24"), cancelled("C2", "2026-10-25"), cancelled("C3", "2026-10-26"), cancelled("C4", "2026-10-27")],
      jobs: [
        job("unstarted", "2026-10-24", { hostexReservationCode: "C1", cleanerId: "mary" }),
        job("started", "2026-10-25", { hostexReservationCode: "C2", status: "in_progress" }),
        job("paid", "2026-10-26", { locked: true }),
        job("flagged-before", "2026-10-27", { status: "completed", reservationCancelledAt: "2026-10-20T00:00:00Z" }),
      ],
    });
    expect(result.cancels).toEqual([{ jobId: "unstarted", ownerId: "owner", code: "C1", cleanerId: "mary", dueAt: "2026-10-24T19:00:00.000Z" }]);
    expect(result.flags.map((f) => f.jobId)).toEqual(["started", "paid"]);
    expect(result.removedReservations.map((r) => r.sourceReference)).toEqual(["hostex:C1", "hostex:C2", "hostex:C3", "hostex:C4"]);
  });

  it("keeps a job that another accepted stay on the same unit still needs", () => {
    // Real case: a cancelled Booking.com stay and a live Airbnb stay check out of 1st floor on Nov 8.
    const result = plan({
      stays: [stay("BOOKING", 101, "2026-11-07", "2026-11-08", { status: "cancelled" }), stay("AIRBNB", 101, "2026-11-05", "2026-11-08")],
      jobs: [job("ical-job", "2026-11-08")],
    });
    expect(result.cancels).toEqual([]);
    expect(result.flags).toEqual([]);
    expect(result.links[0]).toMatchObject({ jobId: "ical-job", code: "AIRBNB" });
  });

  it("only cancels unlinked automated jobs when the cancelled stay has no linked job", () => {
    const result = plan({
      stays: [stay("C1", 101, "2026-10-22", "2026-10-24", { status: "cancelled" })],
      jobs: [job("manual", "2026-10-24", { sourceType: "manual" }), job("feed", "2026-10-24")],
    });
    expect(result.cancels.map((c) => c.jobId)).toEqual(["feed"]);
  });

  it("moves an unstarted job when the guest changes dates, and flags a started one", () => {
    const moved = stay("HM1", 101, "2026-10-26", "2026-10-28");
    const movable = plan({ stays: [moved], jobs: [job("old", "2026-10-26", { hostexReservationCode: "HM1", bookingChannel: "airbnb", cleanerId: "mary" })] });
    expect(movable.moves).toEqual([{ jobId: "old", ownerId: "owner", code: "HM1", cleanerId: "mary", previousDueAt: "2026-10-26T19:00:00.000Z",
      patch: { checkout_at: "2026-10-28T15:00:00.000Z", due_at: "2026-10-28T19:00:00.000Z", next_checkin_at: null } }]);
    expect([movable.creates, movable.cancels].flat()).toEqual([]);
    const started = plan({ stays: [moved], jobs: [job("old", "2026-10-26", { hostexReservationCode: "HM1", status: "in_progress" })] });
    expect(started.creates.map((c) => c.code)).toEqual(["HM1"]);
    expect(started.flags.map((f) => f.jobId)).toEqual(["old"]);
  });

  it("carries the next arrival on the physical unit onto created jobs", () => {
    const result = plan({ stays: [stay("A", 101, "2026-10-22", "2026-10-25"), stay("B", 102, "2026-10-25", "2026-10-27")] });
    expect(result.creates.find((c) => c.code === "A")?.nextCheckinAt).toBe("2026-10-25T19:00:00.000Z");
  });
});

describe("Hostex reservations and iCal mirrors on the calendar", () => {
  it("hides the iCal row for a stay Hostex already reports on the same listing", () => {
    const row = (source_type: string, listing: string) => ({ source_type, property_id: "unit", listing_property_id: listing, start_at: "2026-10-24T19:00:00Z", end_at: "2026-10-26T15:00:00Z" });
    expect(withoutHostexMirrors([row("ical", "three-bed"), row("hostex", "three-bed"), row("ical", "two-bed")]).map((r) => [r.source_type, r.listing_property_id]))
      .toEqual([["hostex", "three-bed"], ["ical", "two-bed"]]);
  });
});

describe("Hostex client reservations", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it("reads every page with GET, within 180-day check-out windows", async () => {
    vi.stubEnv("HOSTEX_API_TOKEN", "test-token");
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      expect(init.method ?? "GET").toBe("GET");
      calls.push(url);
      const q = new URL(url).searchParams;
      const total = q.get("start_check_out_date") === "2026-10-01" ? 250 : 3;
      const count = Math.max(0, Math.min(100, total - Number(q.get("offset"))));
      return new Response(JSON.stringify({ error_code: 200, data: { reservations: Array.from({ length: count }, (_, i) => ({ stay_code: `${q.get("offset")}-${i}` })) } }));
    }));
    const { getReservations } = await import("@/lib/hostex/client");
    expect(await getReservations("2026-10-01", "2027-10-01")).toHaveLength(256); // 366 days: windows of 180, 180 and 6 days
    expect(calls).toHaveLength(5);
    for (const url of calls) {
      const q = new URL(url).searchParams;
      expect(q.get("limit")).toBe("100");
      expect((Date.parse(q.get("end_check_out_date")!) - Date.parse(q.get("start_check_out_date")!)) / 86_400_000).toBeLessThan(180);
    }
  });
});

describe("Hostex API failure", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.doUnmock("@/lib/hostex/client"); });
  it("falls back to the iCal result without writing anything", async () => {
    vi.stubEnv("HOSTEX_API_TOKEN", "test-token");
    vi.resetModules();
    vi.doMock("@/lib/hostex/client", () => ({ getProperties: mocks.getProperties, getReservations: mocks.getReservations }));
    mocks.getProperties.mockRejectedValue(new Error("Hostex /properties failed: HTTP 503"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { syncHostexReservations } = await import("@/lib/hostex/reservation-sync");
    expect(await syncHostexReservations()).toEqual({ ok: false, dryRun: false, summary: null, error: "Hostex is unavailable; iCal feeds remain in effect." });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.getReservations).not.toHaveBeenCalled();
  });
  it("does nothing without a configured token", async () => {
    vi.stubEnv("HOSTEX_API_TOKEN", "");
    const { syncHostexReservations } = await import("@/lib/hostex/reservation-sync");
    expect((await syncHostexReservations()).ok).toBe(false);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
