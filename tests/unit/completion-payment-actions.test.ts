import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),role:vi.fn(),refresh:vi.fn(),summary:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:mocks.refresh}));
vi.mock("@/lib/auth/session",()=>({requireRole:mocks.role}));
vi.mock("@/lib/supabase/server",()=>({createServerSupabaseClient:async()=>({rpc:mocks.rpc})}));
vi.mock("@/lib/queries/cleaner-finance",()=>({getCleanerFinancialSummary:mocks.summary}));
import {recordCleanerPaymentAction,verifyCleanerPaymentAction} from "@/app/actions/cleaner-payments";
import {correctCleaningDateAction} from "@/app/actions/cleaning-date";
const id="11111111-1111-4111-8111-111111111111";
const payment={id,cleanerId:id,amount:"1000.00",date:"2026-10-20",method:"zelle" as const,reference:"ABC123",note:""};
beforeEach(()=>{vi.clearAllMocks();mocks.rpc.mockResolvedValue({error:null});mocks.summary.mockResolvedValue({balance:644});});
it("records bank references without implicitly verifying them",async()=>{
 expect(await recordCleanerPaymentAction(payment)).toEqual({error:null,balance:644});
 expect(mocks.rpc).toHaveBeenCalledTimes(1);expect(mocks.rpc).toHaveBeenCalledWith("record_cleaner_payment",expect.objectContaining({payment_reference:"ABC123"}));
});
it("verifies only after explicit owner confirmation and stops on duplicate",async()=>{
 await recordCleanerPaymentAction({...payment,verified:true});expect(mocks.rpc).toHaveBeenLastCalledWith("verify_cleaner_payment",{payment_id:id});
 mocks.rpc.mockClear();mocks.rpc.mockResolvedValue({error:{message:"Likely duplicate payment"}});
 expect(await recordCleanerPaymentAction({...payment,verified:true})).toEqual({error:"Likely duplicate payment"});expect(mocks.rpc).toHaveBeenCalledTimes(1);
});
it("rejects invalid date corrections and verifies authorization",async()=>{
 expect((await correctCleaningDateAction({assignmentId:id,cleanedOn:"yesterday",reason:"owner confirmed",requestId:id})).error).toBeTruthy();expect(mocks.rpc).not.toHaveBeenCalled();
 expect(await correctCleaningDateAction({assignmentId:id,cleanedOn:"2026-10-19",reason:"Owner checked ledger",requestId:id})).toMatchObject({error:null,cleanedOn:"2026-10-19"});
 expect(mocks.rpc).toHaveBeenCalledWith("correct_cleaning_date",{target_assignment:id,actual_date:"2026-10-19",correction_reason:"Owner checked ledger",request_id:id});expect(mocks.role).toHaveBeenCalledWith(["owner","admin"]);
});
it("rejects invalid verification ids",async()=>{expect((await verifyCleanerPaymentAction("invalid")).error).toBeTruthy();expect(mocks.rpc).not.toHaveBeenCalled();});
