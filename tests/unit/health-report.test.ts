import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ queries: [] as Array<{ table: string; calls: Array<[string, unknown[]]> }>, fail: "", role: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ requireRole: mocks.role }));
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: () => ({
  from: (table: string) => {
    const query = { table, calls: [] as Array<[string, unknown[]]> };
    mocks.queries.push(query);
    let single = false;
    const response = () => {
      if (mocks.fail === table) return { data: null, count: null, error: { message: "Query failed" } };
      let data: unknown = [];
      if (table === "property_calendar_sources") data = [{ id: "source", platform: "airbnb", last_synced_at: "2026-10-21T10:00:00Z", properties: { name: "My property" } }];
      if (table === "calendar_sync_logs") data = single ? { result: "failed", synced_at: "2026-10-21T11:00:00Z", conflict_count: 0, events_found: 0, assignments_created: 0, error_message: "Fetch failed" } : [];
      return { data, count: 3, error: null };
    };
    const chain: unknown = new Proxy({}, { get: (_target, method: string) => {
      if (method === "then") return (resolve: (result: unknown) => void) => Promise.resolve(response()).then(resolve);
      return (...args: unknown[]) => { query.calls.push([method, args]); if (method === "maybeSingle") single = true; return chain; };
    } });
    return chain;
  },
}) }));
import { getHealthReport } from "@/lib/queries/health";
beforeEach(() => { mocks.queries.length = 0; mocks.fail = ""; mocks.role.mockResolvedValue({ owner_id: "owner-1" }); });
it("authorizes the caller and tenant-scopes every privileged query", async () => {
  const report = await getHealthReport();
  expect(mocks.role).toHaveBeenCalledWith(["owner", "admin"]);
  for (const query of mocks.queries) {
    expect(query.calls).toContainEqual(["eq", [query.table === "device_subscriptions" ? "users.owner_id" : "owner_id", "owner-1"]]);
  }
  expect(report.calendarSources[0].sync_logs?.result).toBe("failed");
});
it("reports query failures as unavailable rather than zero", async () => {
  mocks.fail = "properties";
  const report = await getHealthReport();
  expect(report.database.total_properties).toBeNull();
  expect(report.unavailableChecks).toContain("Properties");
});
it("does not infer a recurring-task run from overdue notifications", async () => {
  const report = await getHealthReport();
  expect(report.crons.last_recurring_tasks_at).toBeNull();
  expect(mocks.queries.some((query) => query.calls.some(([method, args]) => method === "eq" && args[1] === "overdue"))).toBe(false);
});
it("ages pending review by completion time, not the cleaning deadline", async () => {
  await getHealthReport();
  const query = mocks.queries.find((query) => query.calls.some(([method, args]) => method === "eq" && args[1] === "completed_pending_review"));
  expect(query?.calls.some(([method, args]) => method === "lt" && args[0] === "completed_at")).toBe(true);
});
