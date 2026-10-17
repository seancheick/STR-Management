import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({client:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/lib/supabase/server",()=>({createServerSupabaseClient:mocks.client}));
import {listPayoutEntries} from "@/lib/queries/payouts";
describe("report entry pagination",()=>{
 beforeEach(()=>vi.resetAllMocks());
 it("loads every row in a report larger than the default API page",async()=>{
  const rows=Array.from({length:1001},(_,id)=>({id:String(id),amount:75}));
  const q={select:vi.fn(),eq:vi.fn(),order:vi.fn(),range:vi.fn(async(start:number,end:number)=>({data:rows.slice(start,end+1),error:null}))};
  q.select.mockReturnValue(q);q.eq.mockReturnValue(q);q.order.mockReturnValue(q);
  mocks.client.mockResolvedValue({from:vi.fn(()=>q)});
  const result=await listPayoutEntries("report-id");
  expect(result).toHaveLength(1001);expect(result[1000].id).toBe("1000");expect(q.range).toHaveBeenCalledTimes(2);
 });
 it("surfaces an unreadable report instead of returning an empty list",async()=>{
  const q={select:vi.fn(),eq:vi.fn(),order:vi.fn(),range:vi.fn(async()=>({data:null,error:{message:"Read failed"}}))};
  q.select.mockReturnValue(q);q.eq.mockReturnValue(q);q.order.mockReturnValue(q);mocks.client.mockResolvedValue({from:()=>q});
  await expect(listPayoutEntries("report-id")).rejects.toThrow("Read failed");
 });
});
