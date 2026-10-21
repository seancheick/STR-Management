import {beforeEach,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({job:{} as Record<string,unknown>,rpc:vi.fn(),role:vi.fn(),refresh:vi.fn()}));
vi.mock("server-only",()=>({}));vi.mock("next/cache",()=>({revalidatePath:mocks.refresh}));
vi.mock("@/lib/auth/session",()=>({requireRole:mocks.role}));
vi.mock("@/lib/supabase/server",()=>({createServerSupabaseClient:async()=>({rpc:mocks.rpc,from:()=>{const chain:unknown=new Proxy({},{get:(_t,key)=>key==="maybeSingle"?async()=>({data:mocks.job,error:null}):()=>chain});return chain;}})}));
import {getJobPayAction,saveJobExtraAction} from "@/app/actions/job-extras";
const id="11111111-1111-4111-8111-111111111111";
beforeEach(()=>{vi.clearAllMocks();mocks.role.mockResolvedValue({owner_id:"owner"});mocks.rpc.mockResolvedValue({data:false,error:null});mocks.job={status:"approved",cleaner_id:"cleaner",fixed_payout_amount:90,cleaning_scope_total:null,assignment_extras:[]};});
it("previews editable approved work and financial locks authoritatively",async()=>{
 expect(await getJobPayAction(id)).toMatchObject({total:90,canEditExtras:true,editRestriction:null});
 mocks.rpc.mockResolvedValue({data:true,error:null});expect(await getJobPayAction(id)).toMatchObject({canEditExtras:false});
 expect(mocks.rpc).toHaveBeenCalledWith("cleaning_scope_financial_locked",{target_assignment:id});
});
it("shows effective scoped pay and directs agents to scope corrections",async()=>{
 mocks.job.cleaning_scope_total=120;expect(await getJobPayAction(id)).toMatchObject({total:120,scopeCorrected:true,canEditExtras:false,editRestriction:expect.stringContaining("correct_cleaning_scope")});
});
it("rejects fractional cents in shared app mutations",async()=>{
 expect((await saveJobExtraAction({assignmentId:id,id,description:"Supplies",amount:"1.000000001",kind:"reimbursement"})).error).toBeTruthy();expect(mocks.rpc).not.toHaveBeenCalled();
});
it("does not report an editable job if lock verification fails",async()=>{
 mocks.rpc.mockResolvedValue({data:null,error:{message:"unavailable"}});await expect(getJobPayAction(id)).rejects.toThrow("Could not verify");
});
