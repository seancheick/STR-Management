import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getProperties: vi.fn(), getPricingRatios: vi.fn(), getListingCalendars: vi.fn(), getAvailabilities: vi.fn(), from: vi.fn(), getOwnerPriceLabsListings: vi.fn(), priceAuthority: false, priorPricingCritical: false, mutations: [] as Array<{ table: string; fields: Record<string, unknown> }> }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/hostex/client", () => mocks);
vi.mock("@/lib/notifications/notification-service", () => ({ sendNotification: vi.fn(async () => undefined) }));
vi.mock("@/lib/pricelabs/client", () => ({ getOwnerPriceLabsListings: mocks.getOwnerPriceLabsListings }));
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: () => ({ from: mocks.from }) }));
import { runBookabilityScan } from "@/lib/services/bookability-runner";

const active = { hostex_property_id: 1, channel_type: "airbnb", listing_id: "active", pricing_authority: "manual", authority_changed_at: "2026-10-01", expected_ratio: null };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mutations = [];
  mocks.priceAuthority = false; mocks.priorPricingCritical = false;
  mocks.getOwnerPriceLabsListings.mockResolvedValue(undefined);
  mocks.getProperties.mockResolvedValue([{ id: 1, title: "Property", timezone: "UTC", channels: [{ channel_type: "airbnb", listing_id: "active", currency: "USD" }] }]);
  mocks.getPricingRatios.mockResolvedValue([{ channel_type: "airbnb", listing_id: "active", readonly: false, ratio: 100 }]);
  mocks.getListingCalendars.mockImplementation(async (_listings, date) => [{ channel_type: "airbnb", listing_id: "active", calendar: [{ date, price: 100, inventory: 1, restrictions: {} }] }]);
  mocks.getAvailabilities.mockImplementation(async (_ids, date) => [{ id: 1, availabilities: [{ date, available: true }] }]);
  mocks.from.mockImplementation((table: string) => {
    const data = table === "properties" ? [{ id: "property", hostex_property_id: 1 }]
      : table === "channel_listings" ? [{...active, pricing_authority: mocks.priceAuthority ? "pricelabs" : "manual"}, { ...active, listing_id: "disconnected" }]
      : table === "bookability_findings" ? [mocks.priorPricingCritical ? {id:"pricing-critical",rule:"pricing_stale",subject:"pricelabs",channel_type:null,severity:"critical",detail:{cause:"prior stopped push"}} : { id: "old-critical", rule: "missing_price", channel_type: "airbnb", subject: "active" }] : [];
    const query = {
      select: () => query, eq: () => query, not: () => query, in: () => query, is: () => query,
      insert: (fields: Record<string, unknown>) => { mocks.mutations.push({ table, fields }); return query; },
      upsert: () => query,
      update: (fields: Record<string, unknown>) => { mocks.mutations.push({ table, fields }); return query; },
      single: async () => ({ data: { id: "scan" }, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve),
    };
    return query;
  });
});

describe("scan reconciliation safeguards", () => {
  it("scans only channels present in current Hostex discovery", async () => {
    const result = await runBookabilityScan("owner", 1);
    expect(result.ok).toBe(true);
    expect(mocks.getListingCalendars.mock.calls[0][0]).toEqual([{ channel_type: "airbnb", listing_id: "active" }]);
  });

  it.each(["missing availability", "partial calendar"])("preserves prior findings after %s", async (failure) => {
    if (failure === "missing availability") mocks.getAvailabilities.mockResolvedValue([]);
    else mocks.getListingCalendars.mockResolvedValue([{ channel_type: "airbnb", listing_id: "active", calendar: [] }]);
    const result = await runBookabilityScan("owner", 1);
    expect(result.ok).toBe(false);
    expect(mocks.mutations.some((m) => m.table === "bookability_findings" && "resolved_at" in m.fields)).toBe(false);
    expect(mocks.mutations.some((m) => m.table === "bookability_scans" && m.fields.result === "success")).toBe(false);
  });
});

it("preserves findings if discovery omits an actively mapped property", async () => {
  mocks.getProperties.mockResolvedValue([{ id: 2, channels: [] }]);
  const result = await runBookabilityScan("owner", 1);
  expect(result.ok).toBe(false);
  expect(mocks.mutations.some((m) => m.table === "bookability_findings" && "resolved_at" in m.fields)).toBe(false);
});

it("preserves critical PriceLabs evidence while direct verification is unavailable", async()=>{
  mocks.priceAuthority=true; mocks.priorPricingCritical=true;
  mocks.getOwnerPriceLabsListings.mockRejectedValue(new Error("secret provider error"));
  expect((await runBookabilityScan("owner",1)).ok).toBe(true);
  expect(mocks.getOwnerPriceLabsListings).toHaveBeenCalledWith("owner");
  const update=mocks.mutations.find(m=>m.table==="bookability_findings"&&m.fields.severity==="critical");
  expect(update?.fields.detail).toMatchObject({unverified:true,previousCriticalEvidence:{cause:"prior stopped push"}});
  expect(JSON.stringify(mocks.mutations)).not.toContain("secret provider error");
});
it("resolves a prior PriceLabs critical finding after verified recovery",async()=>{
  mocks.priceAuthority=true; mocks.priorPricingCritical=true;
  mocks.getOwnerPriceLabsListings.mockResolvedValue([{id:"p",pms:"hostex",name:"Property",push_enabled:true,last_date_pushed:new Date().toISOString(),channel_listing_details:[{channel_name:"airbnb",channel_listing_id:"active"}]}]);
  expect((await runBookabilityScan("owner",1)).ok).toBe(true);
  expect(mocks.mutations.some(m=>m.table==="bookability_findings"&&"resolved_at" in m.fields)).toBe(true);
});

it("does not resolve prior critical sync evidence after disconnect", async()=>{
 mocks.priceAuthority=true; mocks.priorPricingCritical=true;
 mocks.getOwnerPriceLabsListings.mockResolvedValue(undefined);
 expect((await runBookabilityScan("owner",1)).ok).toBe(true);
 expect(mocks.mutations.some(m=>m.table==="bookability_findings"&&"resolved_at" in m.fields)).toBe(false);
});
