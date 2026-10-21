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
import { postCleanerAccountAdjustmentAction } from "@/app/actions/cleaner-account-adjustments";
import { correctCleaningDateAction } from "@/app/actions/cleaning-date";
import { importReservationHistoryAction, importReservationCsvAction, getReservationHistoryAction } from "@/app/actions/reservation-history";
import { recordCleanerPaymentAction, verifyCleanerPaymentAction, voidCleanerPaymentAction } from "@/app/actions/cleaner-payments";
import { getJobPayAction, removeJobExtraAction, saveJobExtraAction } from "@/app/actions/job-extras";
import type { AgentScope } from "@/lib/agent/tokens";
import { listUpcomingUnassignedCleanings } from "@/lib/queries/assignments";
import { getCleanerFinancialSummary, listCleanerFinancialSummaries } from "@/lib/queries/cleaner-finance";
import { runBookabilityScanAction, updateChannelListingSettings } from "@/app/(admin)/dashboard/health/actions";
import { getBookabilityReport } from "@/lib/queries/bookability";
import { applyCalendarChange, listCalendarChanges, previewCalendarChange, verifyCalendarChange } from "@/lib/services/calendar-changes";
import type { ChangeRange } from "@/lib/services/calendar-change-rules";
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

import { AgentToolError } from "@/lib/agent/errors";

export { AgentToolError };

const id = z.guid();
const paymentMethod = z.enum(["zelle", "venmo", "cash", "check", "bank_transfer", "other"]);
const dateTime = z.iso.datetime({ offset: true }).describe("ISO 8601 with offset, e.g. 2026-10-21T11:00:00-04:00");

function tool<S extends z.ZodObject>(def: { name: string; description: string; scope: AgentScope; input: S; run: (input: z.output<S>) => Promise<unknown> }): AgentTool {
  if(def.scope === "write") {
    return {...def, input:def.input.extend({approved:z.literal(true).describe("Set true only after the owner explicitly approves this change.")}),
      run:(input:never)=>{const {approved: _approved,...args}=input as Record<string,unknown>;void _approved;return def.run(args as z.output<S>);},
    } as AgentTool;
  }
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

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD, inclusive");
const calendarChangeInput = z.object({
  channelType: z.string().describe("From get_bookability_report listings, e.g. booking.com or airbnb"),
  listingId: z.string(),
  kind: z.enum(["price", "restrictions"]),
  ranges: z.array(z.object({
    startDate: isoDay, endDate: isoDay,
    price: z.number().int().positive().optional().describe("Whole amount in the listing currency (price changes only)"),
    minStayOnArrival: z.number().int().min(0).optional(), maxStayOnArrival: z.number().int().min(0).optional(),
    minStayThrough: z.number().int().min(0).optional(), maxStayThrough: z.number().int().min(0).optional(),
    closedOnArrival: z.boolean().optional(), closedOnDeparture: z.boolean().optional(),
  })).min(1).max(50),
});

function toChange(input: z.output<typeof calendarChangeInput>) {
  const ranges = input.ranges.map((r) => Object.fromEntries(Object.entries({
    start_date: r.startDate, end_date: r.endDate, price: r.price,
    min_stay_on_arrival: r.minStayOnArrival, max_stay_on_arrival: r.maxStayOnArrival,
    min_stay_through: r.minStayThrough, max_stay_through: r.maxStayThrough,
    closed_on_arrival: r.closedOnArrival, closed_on_departure: r.closedOnDeparture,
  }).filter(([, v]) => v !== undefined)) as ChangeRange);
  return { channelType: input.channelType, listingId: input.listingId, kind: input.kind, ranges };
}

export const agentTools: AgentTool[] = [
  tool({
    name:"post_cleaner_adjustment",scope:"write",
    description:"Append a dated standalone cleaner account correction, including imported history. Never rewrites original lines. Signed amount is a BALANCE DELTA: positive increases owed, negative decreases owed. charge_correction changes charges; payment_correction changes paid total (negative adds paid, positive reverses paid). Requires reason and new requestId, reused only for identical retries. Read statement before and after.",
    input:z.object({requestId:id,cleanerId:id,date:z.iso.date(),amount:z.number().finite().refine(n=>n!==0&&Math.abs(n)<=100000&&Number(n.toFixed(2))===n,"Use a nonzero signed amount with at most two decimal places."),kind:z.enum(["charge_correction","payment_correction"]),reason:z.string().trim().min(3).max(1000)}),
    run:async(input)=>check(await postCleanerAccountAdjustmentAction(input)),
  }),
  tool({
    name:"correct_cleaning_date",scope:"write",
    description:"Correct the actual cleanedOn day for a completed real job without changing checkout, completion evidence, payment or reconciliation ownership. Requires owner-confirmed date, reason and stable retry requestId. Use post_cleaner_adjustment for imported history instead.",
    input:z.object({assignmentId:id,cleanedOn:z.iso.date(),reason:z.string().trim().min(3).max(500),requestId:id}),
    run:async(input)=>check(await correctCleaningDateAction(input)),
  }),
  tool({
    name:"verify_cleaner_payment",scope:"write",
    description:"Mark an existing nonvoided payment verified only after the owner checks it against bank records. Does not create a payment or change its amount/date/reference.",
    input:z.object({paymentId:id}),run:async(input)=>check(await verifyCleanerPaymentAction(input.paymentId)),
  }),
  tool({
    name:"get_reservation_history",scope:"read",
    description:"Find the stay served by a property's cleaning date using live calendar and imported channel history. Pass physical propertyId and booked listingId when known. Returns matched, ambiguous or not_found with candidates; never assumes one listing when ambiguous. Looks back at most two days from cleaningDate.",
    input:z.object({propertyId:id,cleaningDate:z.iso.date(),listingId:id.optional()}),run:getReservationHistoryAction,
  }),
  tool({
    name:"import_reservation_history",scope:"write",
    description:"Atomically import reference-only historical stays for ONE booked listing and channel. Never creates cleaning jobs or charges. Use original channel reservation ID as sourceReference, ISO dates, and canonical status. Reuse requestId only for an identical import. Import each listing separately; cancelled/no_show stays are not cleaning matches.",
    input:z.object({requestId:id,listingId:id,channel:z.enum(["airbnb","booking","vrbo","other"]),stays:z.array(z.object({sourceReference:z.string().trim().min(1).max(200),guestName:z.string().trim().min(1).max(200),checkIn:z.iso.date(),checkOut:z.iso.date(),status:z.enum(["confirmed","completed","cancelled","no_show"])})).min(1).max(5000)}),
    run:importReservationHistoryAction,
  }),
  tool({
    name:"import_reservation_csv",scope:"write",
    description:"Import a per-listing channel CSV as reference stays only. Supply exact header names in columns and every raw exported status in statusMap mapped to confirmed/completed/cancelled/no_show. Dates must be ISO YYYY-MM-DD. Inspect headers first; ambiguous dates are refused. Does not create jobs or charges. Stable requestId supports exact retries.",
    input:z.object({requestId:id,listingId:id,channel:z.enum(["airbnb","booking","vrbo","other"]),csv:z.string().min(1).max(5000000),columns:z.object({sourceReference:z.string(),guestName:z.string(),checkIn:z.string(),checkOut:z.string(),status:z.string()}),statusMap:z.record(z.string(),z.enum(["confirmed","completed","cancelled","no_show"]))}),
    run:importReservationCsvAction,
  }),
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
    name: "get_bookability_report",
    description: "Open bookability findings for every Hostex channel calendar (missing prices, closed inventory, rate-plan ratio drift, restriction conflicts, 7+ night minimums, stale pricing) plus each calendar's pricing authority and the scanner heartbeat. Read-only; it never changes rates.",
    scope: "read",
    input: z.object({}),
    run: async () => getBookabilityReport(),
  }),
  tool({
    name: "run_bookability_scan",
    description: "Re-read every Hostex channel calendar now and refresh bookability findings. Read-only toward Hostex (it never changes rates). Use after a pricing or restriction change, or when get_bookability_report says the scan is stale.",
    scope: "read",
    input: z.object({}),
    run: async () => runBookabilityScanAction(),
  }),
  tool({
    name: "update_channel_listing",
    description: "Change one channel calendar's TurnFlow settings: pricingAuthority (pricelabs | turnflow | manual: the one system allowed to publish its rates), intentionallyClosed (silences closed-inventory alerts), expectedRatio (price relative to Airbnb, e.g. 0.77; null to use the observed ratio). Does not change anything in Hostex.",
    scope: "write",
    input: z.object({
      channelType: z.string().describe("From get_bookability_report listings, e.g. booking.com or airbnb"),
      listingId: z.string(),
      pricingAuthority: z.enum(["pricelabs", "turnflow", "manual"]).optional(),
      intentionallyClosed: z.boolean().optional(),
      expectedRatio: z.number().positive().max(10).nullable().optional(),
    }),
    run: async (input) => updateChannelListingSettings(input),
  }),
  tool({
    name: "preview_calendar_change",
    description: "Dry run of a Hostex price or restriction change for one channel calendar. Returns every validation error, large-change warnings and the current values that would be replaced. Nothing is sent. Refuses channel-derived (readonly) rate plans, calendars owned by PriceLabs, past dates, overlaps and non-integer prices.",
    scope: "read",
    input: calendarChangeInput,
    run: async (input) => previewCalendarChange(toChange(input)),
  }),
  tool({
    name: "apply_calendar_change",
    description: "Send an owner-approved price or restriction change to Hostex for one channel calendar. Always preview first and show the owner. requestId is an idempotency key: retry only with the identical requestId and details. Hostex applies changes asynchronously; call verify_calendar_change afterwards. The prior values are stored so a reversal can be previewed and applied as a new change.",
    scope: "write",
    input: calendarChangeInput.extend({ requestId: id.describe("New UUID per approved change; reuse only to retry the same change") }),
    run: async (input) => applyCalendarChange({ ...toChange(input), requestId: input.requestId }),
  }),
  tool({
    name: "verify_calendar_change",
    description: "Read a submitted calendar change back from the live channel calendar. status: verified (live), submitted (not visible yet; check again shortly), mismatch (still different 15 minutes after submission; investigate, do not resend blindly) or failed.",
    scope: "read",
    input: z.object({ requestId: id }),
    run: async (input) => verifyCalendarChange(input.requestId),
  }),
  tool({
    name: "list_calendar_changes",
    description: "Recent Hostex calendar changes with their status, requested values and the values they replaced (before). Use to audit or to prepare a reversal.",
    scope: "read",
    input: z.object({ limit: z.number().int().min(1).max(100).default(20) }),
    run: async (input) => listCalendarChanges(input.limit),
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
    input: z.object({ cleanerId: id, dateBasis:z.enum(["cleanedOn","checkout"]).default("cleanedOn") }),
    run: async (input) => {
      const s = await getCleanerFinancialSummary(input.cleanerId,input.dateBasis);
      return { cleanerId: s.cleanerId, balance: s.balance, summary: s.summary, totals:s.statementTotals, dateBasis:input.dateBasis, statement: s.statementEntries, payments: s.payments };
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
    description: "Record money paid to a cleaner on their account (not tied to one job). Store the bank confirmation in reference; duplicate normalized references are blocked and similar same-amount payments near the date may be blocked for review. requestId makes retries safe: reuse the same requestId when retrying the same payment, and a new one for every new payment.",
    scope: "write",
    input: z.object({
      requestId: id.describe("A new random UUID per payment; reuse it only to retry"),
      cleanerId: id,
      amount: z.number().positive().max(100000)
        .refine((n) => Number(n.toFixed(2)) === n, "Use at most two decimal places.")
        .describe("Dollars, up to two decimals"),
      date: z.iso.date().describe("Payment date, YYYY-MM-DD, not in the future"),
      method: paymentMethod,
      reference: z.string().max(120).default(""),
      note: z.string().max(500).default(""),
      verified:z.boolean().default(false).describe("True only after the owner confirms this payment against bank records."),
    }),
    run: async (input) => {
      const result = check(await recordCleanerPaymentAction({
        id: input.requestId, cleanerId: input.cleanerId, amount: input.amount.toFixed(2),
        date: input.date, method: input.method, reference: input.reference, note: input.note, verified:input.verified,
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
