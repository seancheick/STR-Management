import { beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),role:vi.fn(),refresh:vi.fn(),from:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("next/cache",()=>({revalidatePath:mocks.refresh}));
vi.mock("@/lib/auth/session",()=>({requireRole:mocks.role}));
vi.mock("@/lib/supabase/server",()=>({createServerSupabaseClient:async()=>({rpc:mocks.rpc,from:mocks.from})}));
import { correctCleaningScopeAction, getCleaningScopeAction } from "@/app/actions/cleaning-scope";
const input={requestId:"11111111-1111-4111-8111-111111111111",assignmentId:"22222222-2222-4222-8222-222222222222",scopePropertyId:"33333333-3333-4333-8333-333333333333",total:120,expectedScopePropertyId:"44444444-4444-4444-8444-444444444444",expectedCurrentTotal:90,reason:"Guest used the third bedroom."};
beforeEach(()=>{vi.clearAllMocks();mocks.role.mockResolvedValue({role:"owner",owner_id:"owner"});mocks.rpc.mockResolvedValue({data:{id:input.requestId,new_total:120},error:null});});
it("uses one guarded idempotent correction RPC and refreshes all app consumers",async()=>{
 const result=await correctCleaningScopeAction(input);
 expect(result.error).toBeNull();
 expect(mocks.rpc).toHaveBeenCalledWith("correct_cleaning_scope",{request_id:input.requestId,target_assignment:input.assignmentId,target_scope:input.scopePropertyId,corrected_total:120,correction_reason:input.reason,expected_current_total:90,expected_current_scope:input.expectedScopePropertyId});
 expect(mocks.refresh).toHaveBeenCalledWith("/dashboard","layout");expect(mocks.refresh).toHaveBeenCalledWith("/jobs","layout");
});
it("refuses money precision loss before reaching the database",async()=>{
 expect((await correctCleaningScopeAction({...input,total:120.005})).error).toBeTruthy();expect(mocks.rpc).not.toHaveBeenCalled();
});
it("surfaces stale previews and database refusals without claiming success",async()=>{
 mocks.rpc.mockResolvedValue({error:{message:"Cleaning pay changed. Refresh the preview."},data:null});
 expect((await correctCleaningScopeAction(input)).error).toBe("Cleaning pay changed. Refresh the preview.");expect(mocks.refresh).not.toHaveBeenCalled();
});

it("uses the authoritative financial lock preview rather than inferring from payment stamps",async()=>{
 mocks.rpc.mockResolvedValue({data:true,error:null});
 mocks.from.mockImplementation((table:string)=>{
  const value=table==="assignments"?{id:input.assignmentId,status:"approved",assignment_type:"cleaning",property_id:input.expectedScopePropertyId,listing_property_id:input.expectedScopePropertyId,cleaning_scope_property_id:null,cleaning_scope_total:null,fixed_payout_amount:90,paid_at:null,ledger_entry_id:null,booked:{name:"2 bedrooms",bedrooms:2}}:[];
  const result={data:value,error:null};
  const chain:unknown=new Proxy({}, {get:(_t,key)=>key==="then"?(resolve:(v:unknown)=>void)=>Promise.resolve(result).then(resolve):()=>chain});return chain;
 });
 const preview=await getCleaningScopeAction(input.assignmentId);
 expect(preview?.financialHistoryLocked).toBe(true);
 expect(mocks.rpc).toHaveBeenCalledWith("cleaning_scope_financial_locked",{target_assignment:input.assignmentId});
});
