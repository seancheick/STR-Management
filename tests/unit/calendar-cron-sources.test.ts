import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), range: vi.fn(), eq: vi.fn(), is: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: () => ({ from: mocks.from }) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn() }));
import { listCalendarSourcesForSync } from "@/lib/queries/calendar";
beforeEach(() => {
  vi.resetAllMocks();
  const query = { select: vi.fn().mockReturnThis(), eq: mocks.eq.mockReturnThis(), is: mocks.is.mockReturnThis(), order: vi.fn().mockReturnThis(), range: mocks.range };
  mocks.from.mockReturnValue(query);
});
it("loads every active source page and excludes retired feeds and inactive properties", async () => {
  const row = { id: "feed", owner_id: "owner", property_id: "property", ical_url: "private", properties: { primary_checklist_template_id: null } };
  mocks.range.mockResolvedValueOnce({ data: Array.from({ length: 1000 }, () => row), error: null }).mockResolvedValueOnce({ data: [{ ...row, id: "last" }], error: null });
  const sources = await listCalendarSourcesForSync();
  expect(sources).toHaveLength(1001); expect(sources.at(-1)?.id).toBe("last");
  expect(mocks.eq).toHaveBeenCalledWith("active", true); expect(mocks.eq).toHaveBeenCalledWith("properties.active", true);
  expect(mocks.is).toHaveBeenCalledWith("retired_at", null); expect(mocks.range).toHaveBeenLastCalledWith(1000, 1999);
});
it("rejects partial source lists if a later database page fails", async () => {
  mocks.range.mockResolvedValueOnce({ data: Array(1000).fill({}), error: null }).mockResolvedValueOnce({ data: null, error: { message: "failure" } });
  await expect(listCalendarSourcesForSync()).rejects.toThrow("Could not load calendar sources");
});
