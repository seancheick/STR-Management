import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), getProperties: vi.fn(), getReservations: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock("@/lib/hostex/client", () => ({ getProperties: mocks.getProperties, getReservations: mocks.getReservations }));
vi.mock("@/lib/notifications/notification-service", () => ({ sendNotification: vi.fn() }));
import { syncHostexReservations } from "@/lib/hostex/reservation-sync";

type Row = Record<string, unknown>;
function database(tables: Record<string, Row[]>) {
  const pages: Array<{ table: string; from: number; to: number }> = [];
  mocks.from.mockImplementation((table: string) => {
    let rows = tables[table] ?? [];
    const query = {
      select: () => query,
      upsert: async () => ({ error: null }),
      eq: (key: string, value: unknown) => { rows = rows.filter((r) => r[key] === value); return query; },
      not: (key: string, _op: string, value: unknown) => { rows = rows.filter((r) => r[key] !== value); return query; },
      in: (key: string, values: unknown[]) => { rows = rows.filter((r) => values.includes(r[key])); return query; },
      or: () => query,
      order: () => query,
      range: async (from: number, to: number) => { pages.push({ table, from, to }); return { data: rows.slice(from, to + 1), error: null }; },
    };
    return query;
  });
  return pages;
}
const property = (owner: string, id: string, hostex: number) => ({ id, owner_id: owner, hostex_property_id: hostex, physical_unit_id: null, active: true, timezone: "America/New_York" });
const stay = (code: string, property: number, checkout = "2035-01-03") => ({ reservation_code: code, stay_code: code, property_id: property, channel_type: "airbnb", check_in_date: "2035-01-01", check_out_date: checkout, status: "accepted" });

describe("Hostex service boundaries", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
  it("restricts manual sync to the requested owner", async () => {
    vi.stubEnv("HOSTEX_API_TOKEN", "fixture");
    database({ properties: [property("one", "unit-one", 101), property("two", "unit-two", 102)] });
    mocks.getProperties.mockResolvedValue([{ id: 101 }, { id: 102 }]);
    mocks.getReservations.mockResolvedValue([stay("ONE", 101), stay("TWO", 102)]);
    const result = await syncHostexReservations({ ownerId: "one", dryRun: true, now: new Date("2035-01-01T12:00:00Z") });
    expect(result.ok).toBe(true);
    expect(result.plan?.creates.map((c) => c.ownerId)).toEqual(["one"]);
    expect(result.plan?.reservations.map((r) => r.owner_id)).toEqual(["one"]);
  });

  it("does not bypass global mapping ambiguity during owner-scoped sync", async () => {
    vi.stubEnv("HOSTEX_API_TOKEN", "fixture");
    database({ properties: [property("one", "unit-one", 101), property("two", "unit-two", 101)] });
    mocks.getProperties.mockResolvedValue([{ id: 101 }]);
    mocks.getReservations.mockResolvedValue([stay("ONE", 101)]);
    const result = await syncHostexReservations({ ownerId: "one", dryRun: true, now: new Date("2035-01-01T12:00:00Z") });
    expect(result.ok).toBe(true);
    expect(result.plan?.reservations).toEqual([]);
    expect(result.plan?.creates).toEqual([]);
    expect(result.plan?.summary.ignored).toBe(1);
  });

  it("reports successful mutations rather than planned creates after a race", async () => {
    vi.stubEnv("HOSTEX_API_TOKEN", "fixture");
    database({ properties: [property("one", "unit", 101)] });
    mocks.getProperties.mockResolvedValue([{ id: 101 }]);
    mocks.getReservations.mockResolvedValue([stay("ONE", 101)]);
    mocks.rpc.mockResolvedValue({ data: { id: "concurrently-created", created: false, revived: false }, error: null });
    const result = await syncHostexReservations({ ownerId: "one", now: new Date("2035-01-01T12:00:00Z") });
    expect(result.ok).toBe(true);
    expect(result.summary?.created).toBe(0);
  });

  it("reads all job and payout pages before deciding financial locks", async () => {
    vi.stubEnv("HOSTEX_API_TOKEN", "fixture");
    const assignments = Array.from({ length: 1201 }, (_, i) => ({ id: `job-${i}`, owner_id: "one", property_id: "unit", assignment_type: "cleaning", status: "assigned", source_type: "hostex",
      hostex_reservation_code: i === 1200 ? "TARGET" : `OTHER-${i}`, hostex_stay_code: i === 1200 ? "TARGET" : `OTHER-${i}`,
      checkout_at: "2035-01-02T16:00:00Z", due_at: "2035-01-02T20:00:00Z", cleaner_id: "cleaner", paid_at: null, ledger_entry_id: null, reservation_cancelled_at: null }));
    const pages = database({ properties: [property("one", "unit", 101)], assignments,
      payout_entries: [...Array.from({ length: 1100 }, (_, i) => ({ id: `entry-${i}`, assignment_id: "job-1200" }))],
    });
    mocks.getProperties.mockResolvedValue([{ id: 101 }]);
    mocks.getReservations.mockResolvedValue([stay("TARGET", 101)]);
    const result = await syncHostexReservations({ dryRun: true, now: new Date("2035-01-01T12:00:00Z") });
    expect(result.ok).toBe(true);
    expect(pages).toContainEqual({ table: "assignments", from: 1000, to: 1499 });
    expect(pages).toContainEqual({ table: "payout_entries", from: 1000, to: 1499 });
    expect(result.plan?.moves).toEqual([]);
    expect(result.plan?.flags.map((f) => f.jobId)).toEqual(["job-1200"]);
  });
});
