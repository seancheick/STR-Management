import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reschedule: vi.fn(),
  recordPayment: vi.fn(),
  writeLog: vi.fn(),
  job: {} as Record<string, unknown>,
  inScope: vi.fn(),
  scopePreview: vi.fn(),
  scopeCorrect: vi.fn(),
  saveExtra: vi.fn(),
  removeExtra: vi.fn(),
  jobPay: vi.fn(),
  adjustment:vi.fn(),dateCorrection:vi.fn(),verify:vi.fn(),history:vi.fn(),csvImport:vi.fn(),historyRead:vi.fn(),statement:vi.fn(),summaries:vi.fn(),cleaners:vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/app/(admin)/dashboard/assignments/actions", () => ({ bulkAssignCleanerAction: vi.fn(), restoreCancelledCleaningAction: vi.fn() }));
vi.mock("@/app/(admin)/dashboard/schedule/actions", () => ({
  bulkMarkPaidAction: vi.fn(), cancelAssignmentAction: vi.fn(), markUnpaidAction: vi.fn(),
  rescheduleAssignmentAction: mocks.reschedule, unassignCleanerAction: vi.fn(),
}));
vi.mock("@/app/actions/assignments", () => ({ fetchAssignmentDetail: vi.fn(), getCleanerSuggestionsAction: vi.fn() }));
vi.mock("@/app/actions/cleaning-scope", () => ({ getCleaningScopeAction: mocks.scopePreview, correctCleaningScopeAction: mocks.scopeCorrect }));
vi.mock("@/app/actions/cleaner-payments", () => ({ recordCleanerPaymentAction: mocks.recordPayment, voidCleanerPaymentAction: vi.fn(),verifyCleanerPaymentAction:mocks.verify }));
vi.mock("@/app/actions/cleaner-account-adjustments",()=>({postCleanerAccountAdjustmentAction:mocks.adjustment}));
vi.mock("@/app/actions/cleaning-date",()=>({correctCleaningDateAction:mocks.dateCorrection}));
vi.mock("@/app/actions/reservation-history",()=>({importReservationHistoryAction:mocks.history,importReservationCsvAction:mocks.csvImport,getReservationHistoryAction:mocks.historyRead}));
vi.mock("@/app/actions/job-extras", () => ({ saveJobExtraAction: mocks.saveExtra, removeJobExtraAction: mocks.removeExtra, getJobPayAction: mocks.jobPay }));
vi.mock("@/lib/queries/assignments", () => ({ listUpcomingUnassignedCleanings: vi.fn(async () => [{ id: "job" }]) }));
vi.mock("@/lib/queries/cleaner-finance", () => ({ getCleanerFinancialSummary: mocks.statement, listCleanerFinancialSummaries: mocks.summaries }));
vi.mock("@/lib/queries/properties", () => ({ listProperties: vi.fn() }));
vi.mock("@/lib/queries/schedule", () => ({ getScheduleRange: vi.fn() }));
vi.mock("@/lib/queries/team", () => ({ listActiveCleaners: vi.fn(), listCleaners: mocks.cleaners }));
vi.mock("@/lib/supabase/server", () => ({
  runWithSupabaseClient: (client: unknown, fn: () => Promise<unknown>) => { mocks.inScope(client); return fn(); },
  createServerSupabaseClient: async () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.job, error: null }) }) }) }),
  }),
}));
vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: () => ({ from: () => ({ insert: async (row: unknown) => { mocks.writeLog(row); return { error: null }; } }) }),
}));
vi.mock("@/lib/agent/tokens", async (original) => ({
  ...(await original<typeof import("@/lib/agent/tokens")>()),
  ownerSession: vi.fn(async () => "owner-client"),
  authenticateAgent: vi.fn(async (header: string | null) =>
    header === "Bearer tf_write" ? { tokenId: "t1", ownerId: "o1", label: "Claude", scope: "write" }
      : header === "Bearer tf_read" ? { tokenId: "t2", ownerId: "o1", label: "Muse", scope: "read" } : null),
}));

import { POST as mcp } from "@/app/api/mcp/route";
import { GET as openapi } from "@/app/api/agent/v1/openapi.json/route";
import { POST as rest } from "@/app/api/agent/v1/tools/[name]/route";
import { executeAgentTool } from "@/lib/agent/execute";
import { bearerToken, hashAgentToken, newAgentToken } from "@/lib/agent/tokens";
import { BusinessRuleError } from "@/lib/domain/business-error";
import { agentTools, toolInputSchema } from "@/lib/agent/tools";
import { calculateCleanerFinancialSummary } from "@/lib/services/cleaner-finance";
import type { CleanerPayment } from "@/lib/domain/payments";

const write = { tokenId: "t1", ownerId: "o1", label: "Claude", scope: "write" as const };
const read = { ...write, tokenId: "t2", scope: "read" as const };
const cleaner = "6f1c2a8e-1111-4222-8333-944455556666";
const job = "7a2b3c4d-1111-4222-8333-944455556666";

// Successful write fixtures explicitly represent owner-approved operations.
function executeApprovedAgentTool(auth:typeof write,name:string,input:Record<string,unknown>) {
 return executeAgentTool(auth,name,{...input,approved:true});
}

function rpc(body: unknown, token = "tf_write") {
  return mcp(new Request("http://localhost/api/mcp", { method: "POST", headers: { authorization: `Bearer ${token}` }, body: JSON.stringify(body) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.job = { id: job, status: "assigned", cleaner_id: cleaner, due_at: "2026-10-21T15:00:00+00:00", checkout_at: "2026-10-21T15:00:00+00:00",
    priority: "normal", expected_duration_min: 120, fixed_payout_amount: 90, access_code: "1234" };
});

describe("agent tokens", () => {
  it("issues prefixed random tokens and stores only a stable hash", () => {
    const a = newAgentToken(), b = newAgentToken();
    expect(a.token).toMatch(/^tf_[A-Za-z0-9_-]{43}$/);
    expect(a.token).not.toBe(b.token);
    expect(a.hash).toBe(hashAgentToken(a.token));
    expect(a.hash).not.toContain(a.token);
    expect(a.prefix).toBe(a.token.slice(0, 9));
  });
  it("accepts only Bearer agent tokens", () => {
    expect(bearerToken("Bearer tf_abc")).toBe("tf_abc");
    expect(bearerToken("bearer tf_abc")).toBe("tf_abc");
    expect(bearerToken("Bearer eyJhbGci")).toBeNull();
    expect(bearerToken("tf_abc")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});

describe("agent tool execution", () => {
  it("previews and corrects scope through the same guarded actions as the UI", async () => {
    mocks.scopePreview.mockResolvedValue({ currentTotal: 90, currentScopeId: job });
    expect(await executeAgentTool(read, "get_cleaning_scope", { assignmentId: job })).toMatchObject({ ok: true, result: { currentTotal: 90 } });
    const input = { requestId: job, assignmentId: job, scopePropertyId: cleaner, total: 120, expectedScopePropertyId: job, expectedCurrentTotal: 90, reason: "Guest used three bedrooms." };
    mocks.scopeCorrect.mockResolvedValue({ error: null, receipt: { id: job, new_total: 120 } });
    expect(await executeApprovedAgentTool(write, "correct_cleaning_scope", input)).toMatchObject({ ok: true, result: { new_total: 120 } });
    expect(mocks.scopeCorrect).toHaveBeenCalledWith(input);
    expect(mocks.writeLog).toHaveBeenCalledWith(expect.objectContaining({ tool: "correct_cleaning_scope", error: null }));
    expect(await executeAgentTool(read, "correct_cleaning_scope", input)).toMatchObject({ ok: false, status: 403 });
  });

  it("requires explicit approval for every write while keeping reads open", async()=>{
    expect(await executeAgentTool(write,"add_job_extra",{requestId:job,assignmentId:cleaner,description:"Supplies",amount:5,kind:"service"})).toMatchObject({ok:false,status:400});
    expect(mocks.saveExtra).not.toHaveBeenCalled();
    for(const tool of agentTools.filter(t=>t.scope==="write")) expect(toolInputSchema(tool).required).toContain("approved");
  });
  it("preserves structured imported history refusals through REST",async()=>{
    mocks.jobPay.mockRejectedValueOnce(new BusinessRuleError("Imported history.","imported_history","post_cleaner_adjustment"));
    const response=await rest(new Request("http://localhost/api/agent/v1/tools/get_job_pay",{method:"POST",headers:{authorization:"Bearer tf_read"},body:JSON.stringify({assignmentId:job})}),{params:Promise.resolve({name:"get_job_pay"})});
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({details:{lockReason:"imported_history",correctionPath:"post_cleaner_adjustment"}});
  });
  it("every tool has a unique name and a JSON schema", () => {
    expect(new Set(agentTools.map((t) => t.name)).size).toBe(agentTools.length);
    for (const t of agentTools) expect(toolInputSchema(t)).toMatchObject({ type: "object" });
  });

  it("refuses write tools for read tokens without running or logging them", async () => {
    const out = await executeAgentTool(read, "record_cleaner_payment", {});
    expect(out).toMatchObject({ ok: false, status: 403 });
    expect(mocks.recordPayment).not.toHaveBeenCalled();
    expect(mocks.writeLog).not.toHaveBeenCalled();
  });

  it("runs read tools as the owner session", async () => {
    expect(await executeAgentTool(read, "list_unassigned_cleanings", {})).toEqual({ ok: true, result: [{ id: "job" }] });
    expect(mocks.inScope).toHaveBeenCalledWith("owner-client");
  });

  it("rejects payment amounts that would be rounded", async () => {
    const out = await executeApprovedAgentTool(write, "record_cleaner_payment", { requestId: job, cleanerId: cleaner, amount: 10.005, date: "2026-10-20", method: "zelle" });
    expect(out).toMatchObject({ ok: false, status: 400 });
    expect(mocks.recordPayment).not.toHaveBeenCalled();
  });

  it("records payments through the existing action with the requestId as idempotency key and logs the write", async () => {
    mocks.recordPayment.mockResolvedValue({ error: null, balance: 40 });
    const input = { requestId: job, cleanerId: cleaner, amount: 50.1, date: "2026-10-20", method: "zelle" };
    expect(await executeApprovedAgentTool(write, "record_cleaner_payment", input)).toEqual({ ok: true, result: { paymentId: job, balance: 40 } });
    expect(mocks.recordPayment).toHaveBeenCalledWith({ id: job, cleanerId: cleaner, amount: "50.10", date: "2026-10-20", method: "zelle", reference: "", note: "", verified:false });
    expect(mocks.writeLog).toHaveBeenCalledWith({ token_id: "t1", tool: "record_cleaner_payment", input: { ...input, reference: "", note: "", verified:false, approved:true }, error: null });
  });

  it("surfaces guard errors from the database and logs them", async () => {
    mocks.recordPayment.mockResolvedValue({ error: "Payment date must be after the reconciled history." });
    const out = await executeApprovedAgentTool(write, "record_cleaner_payment", { requestId: job, cleanerId: cleaner, amount: 5, date: "2020-01-01", method: "cash" });
    expect(out).toEqual({ ok: false, status: 422, error: "Payment date must be after the reconciled history." });
    expect(mocks.writeLog).toHaveBeenCalledWith(expect.objectContaining({ error: "Payment date must be after the reconciled history." }));
  });

  it("reschedule keeps every field the agent did not change, including cleaner and pay", async () => {
    mocks.reschedule.mockResolvedValue({ status: "success", message: "Assignment updated." });
    await executeApprovedAgentTool(write, "reschedule_cleaning", { assignmentId: job, dueAt: "2026-10-22T16:00:00-04:00" });
    const sent = Object.fromEntries((mocks.reschedule.mock.calls[0][1] as FormData).entries());
    expect(sent).toEqual({ assignmentId: job, dueAt: "2026-10-22T16:00:00-04:00", checkoutAt: "2026-10-21T15:00:00+00:00", cleanerId: cleaner,
      priority: "normal", expectedDurationMin: "120", fixedPayoutAmount: "90", originalPayoutAmount: "90", accessCode: "1234" });
  });

  it("maps a requireRole redirect to a 403 instead of a crash", async () => {
    mocks.reschedule.mockRejectedValue(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/sign-in;307;" }));
    expect(await executeApprovedAgentTool(write, "reschedule_cleaning", { assignmentId: job })).toMatchObject({ ok: false, status: 403 });
  });
});

describe("reconciliation tools",()=>{
 it("routes exact signed corrections and payment verification through shared actions",async()=>{
   mocks.adjustment.mockResolvedValue({error:null,balance:644});
   const input={requestId:job,cleanerId:cleaner,date:"2026-05-03",amount:30,kind:"charge_correction",reason:"Verified 3 bedroom turnover"};
   expect(await executeApprovedAgentTool(write,"post_cleaner_adjustment",input)).toMatchObject({ok:true,result:{balance:644}});
   expect(mocks.adjustment).toHaveBeenCalledWith(input);
   expect(await executeApprovedAgentTool(write,"post_cleaner_adjustment",{...input,amount:30.000001})).toMatchObject({ok:false,status:400});
   mocks.verify.mockResolvedValue({error:null});
   expect(await executeApprovedAgentTool(write,"verify_cleaner_payment",{paymentId:job})).toMatchObject({ok:true});
   expect(mocks.verify).toHaveBeenCalledWith(job);
 });
 it("keeps date corrections separate from checkout and imports reference-only data",async()=>{
   const date={assignmentId:job,cleanedOn:"2026-10-19",reason:"Owner confirmed work day",requestId:cleaner};mocks.dateCorrection.mockResolvedValue({error:null,cleanedOn:date.cleanedOn});
   expect(await executeApprovedAgentTool(write,"correct_cleaning_date",date)).toMatchObject({ok:true});expect(mocks.dateCorrection).toHaveBeenCalledWith(date);
   const history={requestId:job,listingId:cleaner,channel:"airbnb",stays:[{sourceReference:"ABC",guestName:"Joe Tanzi",checkIn:"2026-05-01",checkOut:"2026-05-03",status:"completed"}]};
   mocks.history.mockResolvedValue({imported:1,createsCleanings:false,createsCharges:false});
   expect(await executeApprovedAgentTool(write,"import_reservation_history",history)).toMatchObject({ok:true,result:{createsCharges:false}});expect(mocks.history).toHaveBeenCalledWith(history);
 });
 it("returns full statement totals and requested date grouping",async()=>{
   mocks.statement.mockResolvedValue({cleanerId:cleaner,balance:644,summary:{},statementTotals:{chargedTotal:12984,paidTotal:12340,balance:644},statementEntries:[],payments:[]});
   expect(await executeAgentTool(read,"get_cleaner_statement",{cleanerId:cleaner,dateBasis:"checkout"})).toMatchObject({ok:true,result:{totals:{chargedTotal:12984,paidTotal:12340},dateBasis:"checkout"}});
   expect(mocks.statement).toHaveBeenCalledWith(cleaner,"checkout");
 });
 it("exports reconciliation with the same totals and balance as get_cleaner_statement for every cleaner fixture",async()=>{
   const pay=(id:string,amount:number,verified:boolean,extra:Partial<CleanerPayment>={}):CleanerPayment=>({id,owner_id:"o1",cleaner_id:"c",amount,payment_date:"2026-10-17",method:"zelle",reference:`ZELLE-${id}`,note:null,assignment_id:null,source_key:null,created_at:"2026-10-17T12:00Z",created_by:"o1",voided_at:null,verified,...extra});
   const history=[{id:"charges",entry_date:"2026-09-30",sequence:1,kind:"cleaning" as const,description:"Imported charges",amount:12924},{id:"paid",entry_date:"2026-09-30",sequence:2,kind:"payment" as const,description:"Imported payments",amount:-12340}];
   const work=(id:string,amount:number,extra={})=>({id,fixed_payout_amount:amount,due_at:"2026-10-05T19:00:00Z",checkout_at:"2026-10-05T15:00:00Z",paid_at:null,...extra});
   const fixtures=[
     calculateCleanerFinancialSummary({reconciledThrough:"2026-09-30",ledgerEntries:history,entries:[],jobs:[],accountAdjustments:[{id:"may",cleaner_id:"c",amount:30,entry_date:"2026-05-03",reason:"Verified charge",kind:"charge_correction"},{id:"bank",cleaner_id:"c",amount:-25,entry_date:"2026-06-01",reason:"Missed Zelle",kind:"payment_correction"}]}),
     calculateCleanerFinancialSummary({reconciledThrough:null,ledgerEntries:[],entries:[],jobs:[work("a",95,{assignment_extras:[{id:"x",description:"Laundry",amount:15}]}),work("b",120,{paid_at:"2026-10-06T12:00:00Z"})],payments:[pay("p1",50,true),pay("p2",20,false),pay("void",999,true,{voided_at:"2026-10-18T00:00Z"})]}),
     calculateCleanerFinancialSummary({reconciledThrough:null,ledgerEntries:[],entries:[{id:"e",assignment_id:"r",amount:120,status:"included",paid_at:null,assignments:{due_at:"2026-10-05T19:00:00Z"},payout_batches:{status:"approved"}}],jobs:[work("r",90),work("s",120,{financial_base_amount:90,paid_at:"2026-10-14T12:00:00Z",cleaning_scope_total:120})],adjustments:[{id:"adj",assignment_id:"s",cleaner_id:"c",amount:30,entry_date:"2026-10-15",reason:"Three bedrooms used"}],payments:[pay("job-pay",90,true,{assignment_id:"r"})]}),
     calculateCleanerFinancialSummary({reconciledThrough:null,ledgerEntries:[],entries:[],jobs:[],payments:[pay("credit",100,true)]}),
   ].map((s,i)=>({cleanerId:`${cleaner.slice(0,-1)}${i}`,ledger:null,...s}));
   mocks.cleaners.mockResolvedValue([]);
   mocks.summaries.mockResolvedValue(fixtures);
   const exported=await executeAgentTool(read,"export_reconciliation",{});
   if(!exported.ok) throw new Error("export failed");
   const rows=(exported.result as {cleaners:{cleanerId:string;balance:number;totals:unknown;lineTotal:number;verifiedPaidTotal:number;charges:{amount:number}[];payments:{amount:number;reference:string|null;verified:boolean|null}[];adjustments:{amount:number}[]}[]}).cleaners;
   expect(rows).toHaveLength(fixtures.length);
   for(const [i,fixture] of fixtures.entries()){
     mocks.statement.mockResolvedValueOnce(fixture);
     const statement=await executeAgentTool(read,"get_cleaner_statement",{cleanerId:fixture.cleanerId});
     if(!statement.ok) throw new Error("statement failed");
     const s=statement.result as {balance:number;totals:{balance:number}};
     expect(rows[i]).toMatchObject({cleanerId:fixture.cleanerId,balance:s.balance,totals:s.totals,lineTotal:s.totals.balance});
     const cents=(xs:{amount:number}[])=>xs.reduce((sum,x)=>sum+Math.round(x.amount*100),0);
     expect(cents(rows[i].charges)+cents(rows[i].payments)+cents(rows[i].adjustments)).toBe(Math.round(s.totals.balance*100));
   }
   expect(rows[1].payments.map(p=>[p.reference,p.verified])).toEqual(expect.arrayContaining([["ZELLE-p1",true],["ZELLE-p2",false],[null,null]]));
   expect(rows.map(r=>[r.charges.length,r.payments.length,r.adjustments.length])).toEqual([[1,1,2],[3,3,0],[2,2,1],[0,1,0]]);
   expect(rows[1].verifiedPaidTotal).toBe(50);
   expect(rows[1].payments.some(p=>p.reference==="ZELLE-void")).toBe(false);
   expect(mocks.summaries).toHaveBeenCalledWith(undefined,"cleanedOn");
 });
});

describe("job extra tools", () => {
  it("reports a missing cleaning as a tool refusal instead of a server failure", async () => {
    mocks.jobPay.mockRejectedValueOnce(new Error("Cleaning not found."));
    expect(await executeAgentTool(read, "get_job_pay", { assignmentId: job })).toMatchObject({ ok: false, status: 422, error: "Cleaning not found." });
  });
  it("adds an extra through the existing action with requestId as its id and returns the new pay", async () => {
    mocks.saveExtra.mockResolvedValue({ error: null });
    mocks.jobPay.mockResolvedValue({ total: 120, extras: [{ id: job, amount: 30 }] });
    const out = await executeApprovedAgentTool(write, "add_job_extra", { requestId: job, assignmentId: cleaner, description: "Extra bedroom", amount: 30, kind: "service" });
    expect(mocks.saveExtra).toHaveBeenCalledWith({ assignmentId: cleaner, id: job, description: "Extra bedroom", amount: "30.00", kind: "service" });
    expect(out).toEqual({ ok: true, result: { extraId: job, extraState: "present", total: 120, extras: [{ id: job, amount: 30 }] } });
  });

  it("rejects rounded amounts, read tokens, and surfaces the paid-job lock", async () => {
    expect(await executeApprovedAgentTool(write, "add_job_extra", { requestId: job, assignmentId: cleaner, description: "x", amount: 1.005, kind: "service" })).toMatchObject({ ok: false, status: 400 });
    expect(await executeAgentTool(read, "add_job_extra", { requestId: job, assignmentId: cleaner, description: "x", amount: 1, kind: "service" })).toMatchObject({ ok: false, status: 403 });
    mocks.removeExtra.mockResolvedValue({ error: "Paid or reconciled job pay is locked." });
    expect(await executeApprovedAgentTool(write, "remove_job_extra", { assignmentId: cleaner, extraId: job })).toEqual({ ok: false, status: 422, error: "Paid or reconciled job pay is locked." });
    expect(await executeApprovedAgentTool(write, "add_job_extra", { requestId: job, assignmentId: cleaner, description: "Supplies", amount: 1.000000001, kind: "reimbursement" })).toMatchObject({ ok: false, status: 400 });
    expect(mocks.saveExtra).not.toHaveBeenCalled();
  });
  it("reports a removed extra accurately when an old successful add request is replayed", async () => {
    mocks.saveExtra.mockResolvedValue({ error: null });
    mocks.jobPay.mockResolvedValue({ total: 90, extras: [] });
    expect(await executeApprovedAgentTool(write, "add_job_extra", { requestId: job, assignmentId: cleaner, description: "Supplies", amount: 30, kind: "reimbursement" })).toMatchObject({ ok: true, result: { extraId: job, extraState: "removed", total: 90 } });
  });
});

describe("MCP endpoint", () => {
  it("rejects invalid JSON-RPC versions and request ids", async () => {
    expect((await rpc({ id: 1, method: "ping" })).status).toBe(400);
    expect((await rpc({ jsonrpc: "2.0", id: {}, method: "ping" })).status).toBe(400);
  });

  it("marks write tools as potentially destructive", async () => {
    const body = await (await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" })).json();
    expect(body.result.tools.find((t: { name: string }) => t.name === "cancel_cleaning").annotations.destructiveHint).toBe(true);
  });

  it("requires a token", async () => {
    const res = await rpc({ jsonrpc: "2.0", id: 1, method: "ping" }, "nope");
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("Bearer");
  });

  it("negotiates the protocol version and advertises tools", async () => {
    const body = await (await rpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } })).json();
    expect(body.result).toMatchObject({ protocolVersion: "2025-06-18", capabilities: { tools: {} } });
    const unknown = await (await rpc({ jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } })).json();
    expect(unknown.result.protocolVersion).toBe("2025-11-25");
  });

  it("acknowledges notifications with 202", async () => {
    expect((await rpc({ jsonrpc: "2.0", method: "notifications/initialized" })).status).toBe(202);
  });

  it("hides write tools from read tokens", async () => {
    const readTools = (await (await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "tf_read")).json()).result.tools;
    const writeTools = (await (await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" })).json()).result.tools;
    expect(readTools.map((t: { name: string }) => t.name)).not.toContain("record_cleaner_payment");
    expect(writeTools.map((t: { name: string }) => t.name)).toContain("record_cleaner_payment");
    expect(writeTools.find((t: { name: string }) => t.name === "get_schedule")).toMatchObject({ annotations: { readOnlyHint: true }, inputSchema: { required: ["start", "end"] } });
  });

  it("returns tool errors as isError results", async () => {
    const body = await (await rpc({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "record_cleaner_payment", arguments: {} } }, "tf_read")).json();
    expect(body.result.isError).toBe(true);
    const unknown = await (await rpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "nope" } })).json();
    expect(unknown.error.code).toBe(-32602);
  });
});

describe("REST endpoint and OpenAPI", () => {
  it("runs a tool over REST with the same token rules", async () => {
    const call = (token: string, name: string, body = "{}") =>
      rest(new Request(`http://localhost/api/agent/v1/tools/${name}`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body }), { params: Promise.resolve({ name }) });
    expect(await (await call("tf_read", "list_unassigned_cleanings")).json()).toEqual({ result: [{ id: "job" }] });
    expect((await call("tf_read", "cancel_cleaning")).status).toBe(403);
    expect((await call("bad", "list_unassigned_cleanings")).status).toBe(401);
    expect((await call("tf_read", "list_unassigned_cleanings", "{not json")).status).toBe(400);
  });

  it("describes every tool in the OpenAPI document", async () => {
    const doc = await openapi(new Request("https://ops.example.com/api/agent/v1/openapi.json")).json();
    expect(doc.servers[0].url).toBe("https://ops.example.com/api/agent/v1");
    expect(Object.keys(doc.paths)).toHaveLength(agentTools.length);
    expect(doc.paths["/tools/assign_cleaner"].post.operationId).toBe("assign_cleaner");
  });
});
