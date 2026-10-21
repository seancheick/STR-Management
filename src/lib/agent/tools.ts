import "server-only";

import { z } from "zod/v4";

import {
  bulkAssignCleanerAction,
  restoreCancelledCleaningAction,
} from "@/app/(admin)/dashboard/assignments/actions";
import {
  bulkMarkPaidAction,
  cancelAssignmentAction,
  markUnpaidAction,
  rescheduleAssignmentAction,
  unassignCleanerAction,
} from "@/app/(admin)/dashboard/schedule/actions";
import { fetchAssignmentDetail, getCleanerSuggestionsAction } from "@/app/actions/assignments";
import { correctCleaningScopeAction, getCleaningScopeAction } from "@/app/actions/cleaning-scope";
import { cleaningScopeCorrectionSchema } from "@/lib/validations/cleaning-scope";
import { recordCleanerPaymentAction, voidCleanerPaymentAction } from "@/app/actions/cleaner-payments";
import { getJobPayAction, removeJobExtraAction, saveJobExtraAction } from "@/app/actions/job-extras";
import type { AgentScope } from "@/lib/agent/tokens";
import { listUpcomingUnassignedCleanings } from "@/lib/queries/assignments";
import { getCleanerFinancialSummary, listCleanerFinancialSummaries } from "@/lib/queries/cleaner-finance";
import { listProperties } from "@/lib/queries/properties";
import { getScheduleRange } from "@/lib/queries/schedule";
import { listActiveCleaners, listCleaners } from "@/lib/queries/team";
import { calendarWindow } from "@/lib/services/calendar-display";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Every tool an agent can call, shared by MCP (/api/mcp) and REST
 * (/api/agent/v1). Each one delegates to the same query or server action the
 * web app uses, so validation, RLS and RPC guards are identical.
 */
export type AgentTool = {
  name: string;
  description: string;
  scope: AgentScope;
  input: z.ZodObject;
  run: (input: never) => Promise<unknown>;
};

/** Thrown for an expected refusal (validation, guard); shown to the agent as-is. */
export class AgentToolError extends Error {}

const id = z.guid();
const paymentMethod = z.enum(["zelle", "venmo", "cash", "check", "bank_transfer", "other"]);
const dateTime = z.iso.datetime({ offset: true }).describe("ISO 8601 with offset, e.g. 2026-10-21T11:00:00-04:00");

function tool<S extends z.ZodObject>(def: { name: string; description: string; scope: AgentScope; input: S; run: (input: z.output<S>) => Promise<unknown> }): AgentTool {
  return def as AgentTool;
}

function form(values: Record<string, string | number | null | undefined>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value == null ? "" : String(value));
  return data;
}

function check<T extends { status?: string; message?: string | null; error?: string | null }>(result: T) {
  if (result.status === "error" || result.error) throw new AgentToolError(result.message ?? result.error ?? "Request failed.");
  return result;
}

async function agentJobPay(assignmentId: string) {
  try { return await getJobPayAction(assignmentId); }
  catch (error) {
    if (error instanceof Error && error.message === "Cleaning not found.") throw new AgentToolError(error.message);
    throw error;
  }
}

async function currentCleaning(assignmentId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("assignments")
    .select("id, status, cleaner_id, due_at, checkout_at, priority, expected_duration_min, fixed_payout_amount, access_code")
    .eq("id", assignmentId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new AgentToolError("Cleaning not found.");
  return data;
}

export const agentTools: AgentTool[] = [
  tool({
    name: "get_cleaning_scope",
    description: "Preview one cleaning's booked listing, original guest stay, actual cleaning configuration, current total, same-unit scope options and correction history. Match the guest stay and checkout date using get_schedule, then read this preview before correcting scope. A booked two-bedroom stay can have three-bedroom actual cleaning without rewriting the booking.",
    scope: "read",
    input: z.object({ assignmentId: id }),
    run: async (input) => {
      const preview = await getCleaningScopeAction(input.assignmentId);
      if (!preview) throw new AgentToolError("This job cannot have its cleaning scope corrected.");
      return preview;
    },
  }),
  tool({
    name: "correct_cleaning_scope",
    description: "Correct actual cleaning configuration and total pay for one stay, including approved historical work. Read get_cleaning_scope first, verify guest/checkout, choose an option from the same physical unit, pass expectedCurrentTotal and expectedScopePropertyId (currentScopeId) from that preview and an explicit reason. Preserves the booked listing, completion evidence and payment history; creates a separate financial adjustment when history is locked. requestId makes retries safe. Do not use reschedule_cleaning for this correction. Re-read scope and cleaner statement afterward to verify.",
    scope: "write",
    input: cleaningScopeCorrectionSchema,
    run: async (input) => {
      const result = check(await correctCleaningScopeAction(input));
      return result.receipt;
    },
  }),

  tool({
    name: "list_properties",
    description: "List the owner's properties (listings) with ids, names, addresses and timezones.",
    scope: "read",
    input: z.object({}),
    run: async () => {
      const result = await listProperties();
      if (result.error) throw new Error(result.error);
      return result.data;
    },
  }),
  tool({
    name: "get_schedule",
    description: "Cleanings (assignments) and guest reservations between two dates, inclusive, at most one year apart. Same data as the owner calendar.",
    scope: "read",
    input: z.object({
      start: z.iso.date().describe("First day, YYYY-MM-DD"),
      end: z.iso.date().describe("Last day, YYYY-MM-DD"),
      propertyId: id.optional(),
      cleanerId: z.union([id, z.literal("unassigned")]).optional().describe("A cleaner id, or 'unassigned'"),
    }),
    run: async (input) => {
      const window = calendarWindow(input.start, input.end);
      if (!window || Date.parse(window.end) - Date.parse(window.start) > 366 * 86400000) {
        throw new AgentToolError("Use a valid date range of at most one year.");
      }
      return getScheduleRange({ start: window.start, end: window.end, property: input.propertyId, cleaner: input.cleanerId });
    },
  }),
  tool({
    name: "list_unassigned_cleanings",
    description: "Upcoming cleanings that have no cleaner yet, soonest first.",
    scope: "read",
    input: z.object({}),
    run: () => listUpcomingUnassignedCleanings(),
  }),
  tool({
    name: "get_cleaning",
    description: "Full detail for one cleaning: property, cleaner, checklist progress, photos, notes and reported issues.",
    scope: "read",
    input: z.object({ assignmentId: id }),
    run: async (input) => (await fetchAssignmentDetail(input.assignmentId)) ?? Promise.reject(new AgentToolError("Cleaning not found.")),
  }),
  tool({
    name: "list_cleaners",
    description: "Active cleaners on the team. Use these ids for assigning and payments.",
    scope: "read",
    input: z.object({}),
    run: () => listActiveCleaners(),
  }),
  tool({
    name: "suggest_cleaners",
    description: "Rank cleaners for one cleaning: the property's default cleaner and who has no overlapping job.",
    scope: "read",
    input: z.object({ assignmentId: id }),
    run: (input) => getCleanerSuggestionsAction(input.assignmentId),
  }),
  tool({
    name: "get_cleaner_balances",
    description: "What the owner owes each cleaner (balance in dollars; positive means owed to the cleaner), with paid and awaiting totals.",
    scope: "read",
    input: z.object({ cleanerId: id.optional() }),
    run: async (input) => {
      const [summaries, cleaners] = await Promise.all([
        listCleanerFinancialSummaries(input.cleanerId ? [input.cleanerId] : undefined),
        listCleaners(),
      ]);
      const names = new Map(cleaners.map((cleaner) => [cleaner.id, cleaner.full_name]));
      return summaries.map((s) => ({
        cleanerId: s.cleanerId,
        name: names.get(s.cleanerId) ?? null,
        balance: s.balance,
        recordedPaymentsTotal: s.recordedPaymentsTotal,
        ...s.summary,
      }));
    },
  }),
  tool({
    name: "get_cleaner_statement",
    description: "One cleaner's running statement: every charge and payment line, recorded payments with their ids (needed to void one), and the balance.",
    scope: "read",
    input: z.object({ cleanerId: id }),
    run: async (input) => {
      const s = await getCleanerFinancialSummary(input.cleanerId);
      return { cleanerId: s.cleanerId, balance: s.balance, summary: s.summary, statement: s.statementEntries, payments: s.payments };
    },
  }),

  tool({
    name: "assign_cleaner",
    description: "Assign a cleaner to one or more unassigned cleanings and notify them. mode 'request' asks the cleaner to accept; 'direct' assigns without asking. Cleanings that are no longer unassigned are skipped.",
    scope: "write",
    input: z.object({ assignmentIds: z.array(id).min(1).max(100), cleanerId: id, mode: z.enum(["request", "direct"]).default("request") }),
    run: async (input) => {
      const result = check(await bulkAssignCleanerAction(input.assignmentIds, input.cleanerId, input.mode));
      return { assigned: result.assigned, skipped: new Set(input.assignmentIds).size - result.assigned };
    },
  }),
  tool({
    name: "unassign_cleaner",
    description: "Remove the cleaner from an assigned or confirmed cleaning, returning it to unassigned.",
    scope: "write",
    input: z.object({ assignmentId: id }),
    run: async (input) => {
      check(await unassignCleanerAction({ status: "idle", message: null }, form({ assignmentId: input.assignmentId })));
      const after = await currentCleaning(input.assignmentId);
      if (after.status !== "unassigned") throw new AgentToolError(`Cleaning is ${after.status}; only assigned or confirmed cleanings can be unassigned.`);
      return { status: after.status };
    },
  }),
  tool({
    name: "reschedule_cleaning",
    description: "Edit timing or details of an unassigned, assigned, confirmed or needs-reclean job. Approved and started jobs cannot be rescheduled. To correct actual rooms used or historical pay, use get_cleaning_scope then correct_cleaning_scope. Omitted fields keep their current value.",
    scope: "write",
    input: z.object({
      assignmentId: id,
      dueAt: dateTime.optional().describe("When the cleaning must be done (next check-in)"),
      checkoutAt: dateTime.nullable().optional().describe("Guest checkout time; null to clear"),
      expectedDurationMin: z.number().int().positive().optional(),
      priority: z.enum(["normal", "high", "urgent"]).optional(),
      accessCode: z.string().max(64).nullable().optional(),
      fixedPayoutAmount: z.number().positive().optional().describe("Total pay in dollars"),
    }),
    run: async (input) => {
      const job = await currentCleaning(input.assignmentId);
      const pick = <T,>(next: T | undefined, current: T) => (next === undefined ? current : next);
      check(await rescheduleAssignmentAction({ status: "idle", message: null }, form({
        assignmentId: job.id,
        dueAt: pick(input.dueAt, job.due_at),
        checkoutAt: pick(input.checkoutAt, job.checkout_at),
        cleanerId: job.cleaner_id,
        priority: pick(input.priority, job.priority),
        expectedDurationMin: pick(input.expectedDurationMin, job.expected_duration_min),
        fixedPayoutAmount: pick(input.fixedPayoutAmount, job.fixed_payout_amount),
        originalPayoutAmount: job.fixed_payout_amount,
        accessCode: pick(input.accessCode, job.access_code),
      })));
      return currentCleaning(job.id);
    },
  }),
  tool({
    name: "cancel_cleaning",
    description: "Cancel a cleaning that has not started (unassigned, assigned, confirmed or needs re-clean). It can be restored later with restore_cleaning.",
    scope: "write",
    input: z.object({ assignmentId: id }),
    run: async (input) => {
      check(await cancelAssignmentAction({ status: "idle", message: null }, form({ assignmentId: input.assignmentId })));
      const after = await currentCleaning(input.assignmentId);
      if (after.status !== "cancelled") throw new AgentToolError(`Cleaning is ${after.status}; it can no longer be cancelled.`);
      return { status: after.status };
    },
  }),
  tool({
    name: "restore_cleaning",
    description: "Restore a cancelled cleaning.",
    scope: "write",
    input: z.object({ assignmentId: id }),
    run: async (input) => {
      check(await restoreCancelledCleaningAction(input.assignmentId));
      return { status: (await currentCleaning(input.assignmentId)).status };
    },
  }),
  tool({
    name: "record_cleaner_payment",
    description: "Record money paid to a cleaner on their account (not tied to one job). requestId makes retries safe: reuse the same requestId when retrying the same payment, and a new one for every new payment.",
    scope: "write",
    input: z.object({
      requestId: id.describe("A new random UUID per payment; reuse it only to retry"),
      cleanerId: id,
      amount: z.number().positive().max(100000)
        .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, "Use at most two decimal places.")
        .describe("Dollars, up to two decimals"),
      date: z.iso.date().describe("Payment date, YYYY-MM-DD, not in the future"),
      method: paymentMethod,
      reference: z.string().max(120).default(""),
      note: z.string().max(500).default(""),
    }),
    run: async (input) => {
      const result = check(await recordCleanerPaymentAction({
        id: input.requestId, cleanerId: input.cleanerId, amount: input.amount.toFixed(2),
        date: input.date, method: input.method, reference: input.reference, note: input.note,
      }));
      return { paymentId: input.requestId, balance: "balance" in result ? result.balance : null };
    },
  }),
  tool({
    name: "void_cleaner_payment",
    description: "Undo a recorded account payment (by its payment id from get_cleaner_statement). Requires a reason.",
    scope: "write",
    input: z.object({ paymentId: id, reason: z.string().min(3).max(1000) }),
    run: async (input) => {
      check(await voidCleanerPaymentAction(input.paymentId, input.reason));
      return { voided: input.paymentId };
    },
  }),
  tool({
    name: "mark_cleanings_paid",
    description: "Mark completed cleanings as paid with a method and optional reference.",
    scope: "write",
    input: z.object({ assignmentIds: z.array(id).min(1).max(100), method: paymentMethod, reference: z.string().max(120).default("") }),
    run: async (input) => {
      const result = await bulkMarkPaidAction({ assignmentIds: input.assignmentIds, paymentMethod: input.method, paymentReference: input.reference });
      if (!result.ok) throw new AgentToolError(result.error ?? "Could not mark paid.");
      return { marked: result.count };
    },
  }),
  tool({
    name: "mark_cleaning_unpaid",
    description: "Undo a paid mark on one cleaning.",
    scope: "write",
    input: z.object({ assignmentId: id }),
    run: async (input) => {
      check(await markUnpaidAction(input.assignmentId));
      return { status: "unpaid" };
    },
  }),
  tool({
    name: "get_job_pay",
    description: "Preview one cleaning's total, itemized extras and whether new extras can be edited (canEditExtras / editRestriction). Use those extra ids to remove an item.",
    scope: "read",
    input: z.object({ assignmentId: id }),
    run: (input) => agentJobPay(input.assignmentId),
  }),
  tool({
    name: "add_job_extra",
    description: "Add an itemized extra to one cleaning's pay: 'service' for extra work (e.g. laundry, deep clean) or 'reimbursement' for supplies the cleaner bought. Works on completed jobs while their pay is editable. Read get_job_pay first: paid, reconciled, report-linked and scope-corrected jobs reject new extras. Not for rooms actually used; use correct_cleaning_scope for that. requestId makes retries safe: a new UUID per extra, reused only to retry. A replay after that extra was removed returns extraState removed and never recreates the charge.",
    scope: "write",
    input: z.object({
      requestId: id.describe("A new random UUID per extra; reuse it only to retry"),
      assignmentId: id,
      description: z.string().trim().min(1).max(200),
      amount: z.number().positive().max(100000)
        .refine((n) => Number(n.toFixed(2)) === n, "Use at most two decimal places.")
        .describe("Dollars, up to two decimals"),
      kind: z.enum(["service", "reimbursement"]),
    }),
    run: async (input) => {
      check(await saveJobExtraAction({
        assignmentId: input.assignmentId, id: input.requestId, description: input.description,
        amount: input.amount.toFixed(2), kind: input.kind,
      }));
      const pay = await agentJobPay(input.assignmentId);
      return { extraId: input.requestId, extraState: pay.extras.some(extra => extra.id === input.requestId) ? "present" : "removed", ...pay };
    },
  }),
  tool({
    name: "remove_job_extra",
    description: "Remove an itemized extra by its id from get_job_pay while pay is editable. Paid, reconciled, report-linked and scope-corrected jobs reject new removals. Repeating an already completed removal is safe.",
    scope: "write",
    input: z.object({ assignmentId: id, extraId: id }),
    run: async (input) => {
      check(await removeJobExtraAction(input.assignmentId, input.extraId));
      return agentJobPay(input.assignmentId);
    },
  }),
];

export function findAgentTool(name: string) {
  return agentTools.find((t) => t.name === name) ?? null;
}

export function toolInputSchema(t: AgentTool) {
  const schema = z.toJSONSchema(t.input, { io: "input" }) as Record<string, unknown>;
  delete schema.$schema;
  return schema;
}
