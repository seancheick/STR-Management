import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ role: vi.fn(), owner: vi.fn(), sync: vi.fn(), hostex: vi.fn(), refresh: vi.fn(), query: vi.fn(), filters: [] as unknown[][] }));
vi.mock("@/lib/hostex/reservation-sync", () => ({ syncHostexReservations: mocks.hostex }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.refresh }));
vi.mock("@/lib/auth/session", () => ({ requireRole: mocks.role }));
vi.mock("@/lib/queries/properties", () => ({ resolveOwnerId: mocks.owner }));
vi.mock("@/lib/ical/sync-service", () => ({ syncCalendarSource: mocks.sync }));
vi.mock("@/lib/ical/url-guard", () => ({ assertPublicHttpsUrl: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ from: () => {
  const chain: unknown = new Proxy({}, { get: (_t, key) => key === "range" ? mocks.query : (...args: unknown[]) => { mocks.filters.push([key, ...args]); return chain; } });
  return chain;
} }) }));
import { syncAllCalendarsAction } from "@/app/(admin)/dashboard/calendar/actions";
const result = { eventsFound: 2, assignmentsCreated: 1, assignmentsSkipped: 1, assignmentsRescheduled: 2, assignmentsCancelled: 1, reservationsUpserted: 2, conflictCount: 1, conflicts: [] };
const feed = (id: string) => ({ id, property_id: `property-${id}`, name: `Feed ${id}`, properties: { name: "1st floor", primary_checklist_template_id: null } });
beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("HOSTEX_API_TOKEN", "test"); mocks.filters = []; mocks.owner.mockResolvedValue("owner"); mocks.hostex.mockResolvedValue({ok:true,summary:{created:0,moved:0,cancelled:0}}); mocks.query.mockResolvedValue({ data: [], error: null }); mocks.sync.mockResolvedValue(result); });
it("restricts the owner-scoped feed list to active, nonretired sources and active properties", async () => {
  await syncAllCalendarsAction();
  expect(mocks.role).toHaveBeenCalledWith(["owner", "admin", "supervisor"]);
  expect(mocks.filters).toEqual(expect.arrayContaining([["eq", "owner_id", "owner"], ["eq", "active", true], ["is", "retired_at", null], ["eq", "properties.active", true]]));
});
it("attempts every feed sequentially, aggregates mutations and hides provider errors", async () => {
  mocks.query.mockResolvedValue({ data: [feed("a"), feed("b"), feed("c")], error: null });
  let active = 0;
  mocks.sync.mockImplementation(async ({ calendarSourceId }: { calendarSourceId: string }) => {
    active++; expect(active).toBe(1); await Promise.resolve(); active--;
    if (calendarSourceId === "b") throw new Error("https://private.example/calendar?secret=token");
    return result;
  });
  const output = await syncAllCalendarsAction();
  expect(mocks.sync).toHaveBeenCalledTimes(3);
  expect(output).toMatchObject({ attempted: 3, succeeded: 2, assignmentsCreated: 2, assignmentsRescheduled: 4, assignmentsCancelled: 2, conflictCount: 2, failures: [{ sourceId: "b", sourceName: "Feed b", propertyName: "1st floor" }] });
  expect(JSON.stringify(output)).not.toContain("private.example");
  expect(mocks.refresh).toHaveBeenCalledWith("/dashboard/schedule");
});
it("paginates without syncing until the complete feed list is safely loaded", async () => {
  mocks.query.mockResolvedValueOnce({ data: Array.from({ length: 1000 }, (_, i) => feed(String(i))), error: null }).mockResolvedValueOnce({ data: null, error: { message: "query failed" } });
  expect(await syncAllCalendarsAction()).toMatchObject({ error: expect.any(String), attempted: 0 });
  expect(mocks.query).toHaveBeenNthCalledWith(2, 1000, 1999);
  expect(mocks.sync).not.toHaveBeenCalled();
});
it("counts partial sync mutations even when a feed reports failure", async () => {
  mocks.query.mockResolvedValue({ data: [feed("a")], error: null });
  mocks.sync.mockResolvedValue({ ...result, error: "Feed failed https://secret.example" });
  expect(await syncAllCalendarsAction()).toMatchObject({ attempted: 1, succeeded: 0, assignmentsCreated: 1, failures: [{ sourceId: "a" }] });
});
it("does not read or sync feeds when the caller lacks permission", async () => {
  mocks.role.mockRejectedValueOnce(new Error("Forbidden"));
  await expect(syncAllCalendarsAction()).rejects.toThrow("Forbidden");
  expect(mocks.owner).not.toHaveBeenCalled();
  expect(mocks.query).not.toHaveBeenCalled();
  expect(mocks.sync).not.toHaveBeenCalled();
});

it("includes owner-scoped Hostex reconciliation after all fallback feeds", async () => {
  mocks.query.mockResolvedValue({data:[feed("a")],error:null});
  mocks.hostex.mockResolvedValue({ok:true,summary:{created:2,moved:1,cancelled:0}});
  const output=await syncAllCalendarsAction();
  expect(mocks.hostex).toHaveBeenCalledWith({ownerId:"owner"});
  expect(mocks.hostex.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.sync.mock.invocationCallOrder[0]);
  expect(output.assignmentsCreated).toBe(3); expect(output.assignmentsRescheduled).toBe(3);
});
it("exposes a Hostex failure even when all iCal feeds succeeded", async () => {
 mocks.hostex.mockResolvedValue({ok:false,error:"secret provider failure",summary:null});
 const output=await syncAllCalendarsAction();
 expect(output.error).toMatch(/Hostex/); expect(output.error).not.toContain("secret provider");
 expect(mocks.refresh).toHaveBeenCalledWith("/dashboard/schedule");
});
