import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ list: vi.fn(), sync: vi.fn(), auth: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth/cron", () => ({ isAuthorizedCronRequest: mocks.auth }));
vi.mock("@/lib/queries/calendar", () => ({ listCalendarSourcesForSync: mocks.list }));
vi.mock("@/lib/ical/sync-service", () => ({ syncCalendarSource: mocks.sync }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { GET } from "@/app/api/cron/sync-calendars/route";
const sources = ["two-bed", "three-bed"].map(id => ({ id, owner_id: "owner", property_id: id, primary_checklist_template_id: null }));
const success = { assignmentsCreated: 0, assignmentsSkipped: 1, assignmentsRescheduled: 0, assignmentsCancelled: 0, conflictCount: 0 };
const request = () => new NextRequest("https://example.com/api/cron/sync-calendars");
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockReturnValue(true); mocks.list.mockResolvedValue(sources); mocks.sync.mockResolvedValue(success); });
describe("automatic calendar sync", () => {
  it("rejects unauthorized calls before reading sources", async () => { mocks.auth.mockReturnValue(false); expect((await GET(request())).status).toBe(401); expect(mocks.list).not.toHaveBeenCalled(); });
  it("finishes each listing before starting the next to avoid shared-unit races", async () => {
    let finish!: (value: typeof success) => void;
    mocks.sync.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = GET(request()); await vi.waitFor(() => expect(mocks.sync).toHaveBeenCalled());
    expect(mocks.sync).toHaveBeenCalledTimes(1); finish(success);
    expect((await pending).status).toBe(200); expect(mocks.sync).toHaveBeenCalledTimes(2);
    expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard");
  });
  it("reports returned feed failures and still syncs the remaining listings", async () => {
    mocks.sync.mockResolvedValueOnce({ ...success, error: "Fetch error: https://private.example/secret" });
    const response = await GET(request()); const body = await response.json();
    expect(response.status).toBe(502); expect(body.synced).toBe(1); expect(body.results[0].ok).toBe(false);
    expect(JSON.stringify(body)).not.toContain("private.example"); expect(mocks.sync).toHaveBeenCalledTimes(2);
  });
  it("handles thrown failures without leaking feed credentials", async () => {
    mocks.sync.mockRejectedValueOnce(new Error("https://private.example/secret"));
    const response = await GET(request()); expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain("private.example"); expect(mocks.sync).toHaveBeenCalledTimes(2);
  });
  it("does not report a failed source lookup as an empty successful sync", async () => {
    mocks.list.mockRejectedValue(new Error("database unavailable"));
    expect((await GET(request())).status).toBe(503); expect(mocks.sync).not.toHaveBeenCalled();
  });
});
