import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ push: vi.fn(), client: vi.fn(),payee:vi.fn() }));
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
    mocks.payee.mockResolvedValue({data:{user_id:"cleaner",active:true,owner_id:"owner"},error:null});
    mocks.client.mockReturnValue({ from: vi.fn((table:string)=>table==="cleaners"?{select:()=>({eq:()=>({maybeSingle:mocks.payee})})}:{ select: vi.fn().mockReturnValue(query), update }) });
  });
  it("sends one batch alert linking to individual inbox responses", async () => {
    mocks.push.mockResolvedValue([{ success: true }]);
    await sendAssignmentBatchNotification("owner", "cleaner", ["job1", "job2"]);
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith("cleaner", expect.objectContaining({ title: "2 new cleaning assignments", url: "/jobs/inbox" }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ status: "sent" }));
  });
  it("direct assignments notify without asking for acceptance", async () => {
    mocks.push.mockResolvedValue([{success:true}]);
    await sendAssignmentBatchNotification("owner","cleaner",["job1"],"direct");
    expect(mocks.push).toHaveBeenCalledWith("cleaner",expect.objectContaining({url:"/jobs/schedule",body:expect.not.stringContaining("accept or decline")}));
  });
  it("maps a linked contractor to their actual login for phone notifications",async()=>{
    mocks.payee.mockResolvedValue({data:{user_id:"new-login",active:true,owner_id:"owner"},error:null});mocks.push.mockResolvedValue([{success:true}]);
    await sendAssignmentBatchNotification("owner","original-contractor",["job1"],"direct");
    expect(mocks.push).toHaveBeenCalledWith("new-login",expect.anything());
  });
  it("skips a no-login contractor instead of creating undeliverable notifications",async()=>{
    mocks.payee.mockResolvedValue({data:{user_id:null,active:true,owner_id:"owner"},error:null});
    await sendAssignmentBatchNotification("owner","contractor",["job1"],"direct");expect(mocks.push).not.toHaveBeenCalled();expect(update).not.toHaveBeenCalled();
  });
  it("records an honest delivery failure without removing inbox offers", async () => {
    mocks.push.mockResolvedValue([{ success: false, error: "No active push subscriptions." }]);
    await sendAssignmentBatchNotification("owner", "cleaner", ["job1"]);
    expect(update).toHaveBeenCalledWith({ status: "failed", sent_at: null, error_message: "No active push subscriptions." });
  });
});
