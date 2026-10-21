import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getProperties: vi.fn(), getPricingRatios: vi.fn(), getListingCalendars: vi.fn(),
  updateListingPrices: vi.fn(), updateListingRestrictions: vi.fn(), from: vi.fn(),
  mapped: true,
  existing: null as Record<string, unknown> | null,
  updates: [] as Record<string, unknown>[],
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireRole: vi.fn(async () => ({ id: "user", owner_id: "owner" })) }));
vi.mock("@/lib/services/bookability-runner", () => ({ localDate: () => "2026-10-21" }));
vi.mock("@/lib/hostex/client", () => mocks);
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: () => ({ from: mocks.from }) }));

import { applyCalendarChange, previewCalendarChange, verifyCalendarChange } from "@/lib/services/calendar-changes";

const input = { channelType: "airbnb", listingId: "listing", kind: "price" as const, requestId: "request", ranges: [{ start_date: "2026-11-01", end_date: "2026-11-01", price: 150 }] };
const listing = { channel_type: "airbnb", listing_id: "listing", hostex_property_id: 1, pricing_authority: "manual", price_readonly: false };
const calendar = { channel_type: "airbnb", listing_id: "listing", calendar: [{ date: "2026-11-01", price: 150, inventory: 1, restrictions: {} }] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.existing = null;
  mocks.mapped = true;
  mocks.updates = [];
  mocks.getProperties.mockResolvedValue([{ id: 1, channels: [{ channel_type: "airbnb", listing_id: "listing" }] }]);
  mocks.getPricingRatios.mockResolvedValue([{ channel_type: "airbnb", listing_id: "listing", readonly: false }]);
  mocks.getListingCalendars.mockResolvedValue([calendar]);
  mocks.updateListingPrices.mockResolvedValue(undefined);
  mocks.from.mockImplementation((table: string) => {
    let mutation: Record<string, unknown> | null = null;
    const query = {
      select: () => query, eq: () => query,
      insert: (value: Record<string, unknown>) => { mutation = { ...value, submitted_at: new Date().toISOString() }; mocks.existing = mutation; return query; },
      update: (value: Record<string, unknown>) => { mocks.updates.push(value); mutation = { ...mocks.existing, ...value }; mocks.existing = mutation; return query; },
      single: async () => ({ data: mutation, error: null }),
      maybeSingle: async () => ({ data: table === "channel_listings" ? listing : table === "properties" ? (mocks.mapped ? { id: "property" } : null) : mocks.existing, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: mutation, error: null }).then(resolve),
    };
    return query;
  });
});

describe("calendar write safeguards", () => {
  it("keeps a timed-out submission verifiable and does not resend its requestId", async () => {
    mocks.updateListingPrices.mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"));
    await expect(applyCalendarChange(input)).rejects.toThrow(/outcome is uncertain/);
    expect(mocks.updates).toEqual([{ error: "Timed out" }]);
    expect(mocks.existing?.status).toBe("submitted");
    const retry = await applyCalendarChange(input);
    expect(retry.retried).toBe(true);
    expect(mocks.updateListingPrices).toHaveBeenCalledTimes(1);
    const verified = await verifyCalendarChange(input.requestId);
    expect(verified.status).toBe("verified");
  });

  it("refuses a disconnected listing even when its cached row exists", async () => {
    mocks.getProperties.mockResolvedValue([{ id: 1, channels: [] }]);
    await expect(applyCalendarChange(input)).rejects.toThrow(/no longer connected/);
    expect(mocks.updateListingPrices).not.toHaveBeenCalled();
  });

  it("uses fresh readonly metadata rather than the cached permission", async () => {
    mocks.getPricingRatios.mockResolvedValue([{ channel_type: "airbnb", listing_id: "listing", readonly: true }]);
    await expect(applyCalendarChange(input)).rejects.toThrow(/readonly/);
    expect(mocks.updateListingPrices).not.toHaveBeenCalled();
  });

  it("marks a preview invalid when current date coverage is absent", async () => {
    mocks.getListingCalendars.mockResolvedValue([{ ...calendar, calendar: [] }]);
    const preview = await previewCalendarChange(input);
    expect(preview.valid).toBe(false);
    await expect(applyCalendarChange(input)).rejects.toThrow(/no current calendar/);
    expect(mocks.updateListingPrices).not.toHaveBeenCalled();
  });
});

it("refuses writes after the tenant property mapping is removed or deactivated", async () => {
  mocks.mapped = false;
  await expect(applyCalendarChange(input)).rejects.toThrow(/no longer actively mapped/);
  expect(mocks.updateListingPrices).not.toHaveBeenCalled();
});
it("fails closed when current price control is absent", async () => {
  mocks.getPricingRatios.mockResolvedValue([]);
  await expect(applyCalendarChange(input)).rejects.toThrow(/price control is unknown/);
  expect(mocks.updateListingPrices).not.toHaveBeenCalled();
});
