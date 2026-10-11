import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ client: vi.fn(), range: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: mocks.client }));
import { countUnreadNotifications } from "../../src/lib/queries/notifications";

describe("cleaner notification badge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const query = { eq: vi.fn(), order: vi.fn(), range: mocks.range };
    query.eq.mockReturnValue(query); query.order.mockReturnValue(query);
    mocks.client.mockResolvedValue({ from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(query) }) });
  });
  const offer = (id: string, status = "assigned", ack = "pending") => ({
    assignment_id: id, notification_type: "new_assignment", seen_at: null,
    assignment: { status, ack_status: ack },
  });
  it("counts actionable offers without revoked, answered or duplicate delivery copies", async () => {
    mocks.range.mockResolvedValue({ data: [offer("one"), offer("one"), offer("old", "unassigned"), offer("answered", "confirmed", "accepted"), { ...offer("removed"), assignment: null }] });
    expect(await countUnreadNotifications("cleaner")).toBe(1);
  });
  it("reads beyond the database's 1,000-row page limit", async () => {
    mocks.range.mockResolvedValueOnce({ data: Array.from({ length: 1000 }, (_, i) => offer(`old-${i}`, "unassigned")) })
      .mockResolvedValueOnce({ data: [offer("current")] });
    expect(await countUnreadNotifications("cleaner")).toBe(1);
    expect(mocks.range).toHaveBeenNthCalledWith(2, 1000, 1999);
  });
});
