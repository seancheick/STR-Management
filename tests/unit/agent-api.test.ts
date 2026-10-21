import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  reschedule: vi.fn(),
  recordPayment: vi.fn(),
  writeLog: vi.fn(),
  job: {} as Record<string, unknown>,
  inScope: vi.fn(),
  scopePreview: vi.fn(),
  scopeCorrect: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/app/(admin)/dashboard/assignments/actions", () => ({ bulkAssignCleanerAction: vi.fn(), restoreCancelledCleaningAction: vi.fn() }));
vi.mock("@/app/(admin)/dashboard/schedule/actions", () => ({
  bulkMarkPaidAction: vi.fn(), cancelAssignmentAction: vi.fn(), markUnpaidAction: vi.fn(),
  rescheduleAssignmentAction: mocks.reschedule, unassignCleanerAction: vi.fn(),
}));
vi.mock("@/app/actions/assignments", () => ({ fetchAssignmentDetail: vi.fn(), getCleanerSuggestionsAction: vi.fn() }));
vi.mock("@/app/actions/cleaning-scope", () => ({ getCleaningScopeAction: mocks.scopePreview, correctCleaningScopeAction: mocks.scopeCorrect }));
vi.mock("@/app/actions/cleaner-payments", () => ({ recordCleanerPaymentAction: mocks.recordPayment, voidCleanerPaymentAction: vi.fn() }));
vi.mock("@/lib/queries/assignments", () => ({ listUpcomingUnassignedCleanings: vi.fn(async () => [{ id: "job" }]) }));
vi.mock("@/lib/queries/cleaner-finance", () => ({ getCleanerFinancialSummary: vi.fn(), listCleanerFinancialSummaries: vi.fn() }));
vi.mock("@/lib/queries/properties", () => ({ listProperties: vi.fn() }));
vi.mock("@/lib/queries/schedule", () => ({ getScheduleRange: vi.fn() }));
vi.mock("@/lib/queries/team", () => ({ listActiveCleaners: vi.fn(), listCleaners: vi.fn() }));
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
import { agentTools, toolInputSchema } from "@/lib/agent/tools";

const write = { tokenId: "t1", ownerId: "o1", label: "Claude", scope: "write" as const };
const read = { ...write, tokenId: "t2", scope: "read" as const };
const cleaner = "6f1c2a8e-1111-4222-8333-944455556666";
const job = "7a2b3c4d-1111-4222-8333-944455556666";

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
    expect(await executeAgentTool(write, "correct_cleaning_scope", input)).toMatchObject({ ok: true, result: { new_total: 120 } });
    expect(mocks.scopeCorrect).toHaveBeenCalledWith(input);
    expect(mocks.writeLog).toHaveBeenCalledWith(expect.objectContaining({ tool: "correct_cleaning_scope", error: null }));
    expect(await executeAgentTool(read, "correct_cleaning_scope", input)).toMatchObject({ ok: false, status: 403 });
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
    const out = await executeAgentTool(write, "record_cleaner_payment", { requestId: job, cleanerId: cleaner, amount: 10.005, date: "2026-10-20", method: "zelle" });
    expect(out).toMatchObject({ ok: false, status: 400 });
    expect(mocks.recordPayment).not.toHaveBeenCalled();
  });

  it("records payments through the existing action with the requestId as idempotency key and logs the write", async () => {
    mocks.recordPayment.mockResolvedValue({ error: null, balance: 40 });
    const input = { requestId: job, cleanerId: cleaner, amount: 50.1, date: "2026-10-20", method: "zelle" };
    expect(await executeAgentTool(write, "record_cleaner_payment", input)).toEqual({ ok: true, result: { paymentId: job, balance: 40 } });
    expect(mocks.recordPayment).toHaveBeenCalledWith({ id: job, cleanerId: cleaner, amount: "50.10", date: "2026-10-20", method: "zelle", reference: "", note: "" });
    expect(mocks.writeLog).toHaveBeenCalledWith({ token_id: "t1", tool: "record_cleaner_payment", input: { ...input, reference: "", note: "" }, error: null });
  });

  it("surfaces guard errors from the database and logs them", async () => {
    mocks.recordPayment.mockResolvedValue({ error: "Payment date must be after the reconciled history." });
    const out = await executeAgentTool(write, "record_cleaner_payment", { requestId: job, cleanerId: cleaner, amount: 5, date: "2020-01-01", method: "cash" });
    expect(out).toEqual({ ok: false, status: 422, error: "Payment date must be after the reconciled history." });
    expect(mocks.writeLog).toHaveBeenCalledWith(expect.objectContaining({ error: "Payment date must be after the reconciled history." }));
  });

  it("reschedule keeps every field the agent did not change, including cleaner and pay", async () => {
    mocks.reschedule.mockResolvedValue({ status: "success", message: "Assignment updated." });
    await executeAgentTool(write, "reschedule_cleaning", { assignmentId: job, dueAt: "2026-10-22T16:00:00-04:00" });
    const sent = Object.fromEntries((mocks.reschedule.mock.calls[0][1] as FormData).entries());
    expect(sent).toEqual({ assignmentId: job, dueAt: "2026-10-22T16:00:00-04:00", checkoutAt: "2026-10-21T15:00:00+00:00", cleanerId: cleaner,
      priority: "normal", expectedDurationMin: "120", fixedPayoutAmount: "90", originalPayoutAmount: "90", accessCode: "1234" });
  });

  it("maps a requireRole redirect to a 403 instead of a crash", async () => {
    mocks.reschedule.mockRejectedValue(Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/sign-in;307;" }));
    expect(await executeAgentTool(write, "reschedule_cleaning", { assignmentId: job })).toMatchObject({ ok: false, status: 403 });
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
