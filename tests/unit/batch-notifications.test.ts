import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ push: vi.fn(), client: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: mocks.client }));
vi.mock("@/lib/notifications/push", () => ({ sendPushToUser: mocks.push }));
import { sendAssignmentBatchNotification } from "../../src/lib/notifications/notification-service";

describe("batch phone alerts", () => {
  let update: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.clearAllMocks();
    const query = { eq: vi.fn(), in: vi.fn().mockResolvedValue({ data: [{ id: "offer1" }, { id: "offer2" }], error: null }) };
    query.eq.mockReturnValue(query);
    update = vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ error: null }) });
    mocks.client.mockReturnValue({ from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(query), update }) });
  });
  it("sends one batch alert linking to individual inbox responses", async () => {
    mocks.push.mockResolvedValue([{ success: true }]);
    await sendAssignmentBatchNotification("owner", "cleaner", ["job1", "job2"]);
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith("cleaner", expect.objectContaining({ title: "2 new cleaning assignments", url: "/jobs/inbox" }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "sent" }));
  });
  it("records an honest delivery failure without removing inbox offers", async () => {
    mocks.push.mockResolvedValue([{ success: false, error: "No active push subscriptions." }]);
    await sendAssignmentBatchNotification("owner", "cleaner", ["job1"]);
    expect(update).toHaveBeenCalledWith({ status: "failed", sent_at: null, error_message: "No active push subscriptions." });
  });
});
