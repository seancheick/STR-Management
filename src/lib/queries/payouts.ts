import "server-only";
import { withListingConfiguration } from "@/lib/services/booking-configuration";
import { getCleanerFinancialSummary, listCleanerFinancialSummaries } from "@/lib/queries/cleaner-finance";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AssignmentExtraRecord, AssignmentListRecord } from "@/lib/queries/assignments";

export type PayoutBatchRecord = {
  payout_entries?: {cleaner_id:string;status:string}[];
  id: string;
  owner_id: string;
  label: string;
  period_start: string;
  period_end: string;
  cleaner_filter: string | null;
  status: "draft" | "approved" | "paid" | "cancelled";
  total_amount: number;
  entry_count: number;
  notes: string | null;
  approved_at: string | null;
  approved_by_id: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  cleaner_filter_user?: { full_name: string } | null;
};

export type PayoutEntryRecord = {
  id: string;
  batch_id: string;
  owner_id: string;
  cleaner_id: string;
  assignment_id: string;
  property_id: string;
  amount: number;
  status: "included" | "excluded" | "disputed";
  notes: string | null;
  paid_at: string | null;
  paid_by_id: string | null;
  created_at: string;
  cleaners?: { full_name: string } | null;
  properties?: { name: string; timezone?: string | null } | null;
  assignments?: {
    due_at: string;
    assignment_type: string;
    expected_duration_min: number | null;
    assignment_extras?: AssignmentExtraRecord[];
    paid_at?: string | null;
  } | null;
};

export async function listPayoutBatches(): Promise<PayoutBatchRecord[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("payout_batches")
    .select(
      `*, payout_entries(cleaner_id,status), cleaner_filter_user:cleaners!payout_batches_cleaner_filter_fkey(full_name)`,
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PayoutBatchRecord[];
}

export async function getPayoutBatch(
  batchId: string,
): Promise<PayoutBatchRecord | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("payout_batches")
    .select(
      `*, payout_entries(cleaner_id,status), cleaner_filter_user:cleaners!payout_batches_cleaner_filter_fkey(full_name)`,
    )
    .eq("id", batchId)
    .single();
  if (error) return null;
  return data as unknown as PayoutBatchRecord;
}

export async function listPayoutEntries(
  batchId: string,
): Promise<PayoutEntryRecord[]> {
  const supabase = await createServerSupabaseClient();
  const entries:PayoutEntryRecord[]=[];
  for(let offset=0;;offset+=1000){
  const { data, error } = await supabase
    .from("payout_entries")
    .select(
      `*,
       cleaners:cleaners!payout_entries_cleaner_id_fkey(full_name),
       properties:property_id(name, timezone),
       assignments(due_at, assignment_type, expected_duration_min, paid_at, assignment_extras(id, assignment_id, description, amount, kind, created_at))`,
    )
    .eq("batch_id", batchId)
    .order("created_at", { ascending: true }).order("id").range(offset,offset+999);
  if (error) throw new Error(error.message);
  entries.push(...((data??[]) as unknown as PayoutEntryRecord[]));
  if((data?.length??0)<1000)break;
  }
  return entries.sort((a, b) =>
    (a.assignments?.due_at ?? a.created_at ?? "").localeCompare(
      b.assignments?.due_at ?? b.created_at ?? "",
    ),
  );
}

/** Entries visible to a cleaner (RLS limits cleaners to approved/paid batches). */
export async function listMyPayoutEntries(
  cleanerId: string,
): Promise<PayoutEntryRecord[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("payout_entries")
    .select(
      `*,
       properties:property_id(name, timezone),
       assignments(due_at, assignment_type, expected_duration_min, paid_at)`,
    )
    .eq("cleaner_id", cleanerId)
    .eq("status", "included")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PayoutEntryRecord[];
}

const CLEANER_PENDING_PAYOUT_ASSIGNMENT_SELECT = `
  id, owner_id, property_id, listing_property_id, cleaning_scope_property_id, cleaning_scope_total, cleaner_id, assignment_type,
  status, ack_status, priority, checkout_at, due_at,
  expected_duration_min, fixed_payout_amount, paid_at, created_at,
  properties:property_id ( name, address_line_1, city, timezone ),
  listing_properties:assignments_listing_property_fk ( name, address_line_1, city, timezone ),cleaning_scope_properties:assignments_cleaning_scope_property_fk ( name, address_line_1, city, timezone ),
  cleaners:cleaner_id ( full_name )
`.trim();

export async function listPendingCleanerPayoutAssignments(
  cleanerId: string,
): Promise<AssignmentListRecord[]> {
  const supabase = await createServerSupabaseClient();

  const { data: payoutEntries, error: entriesError } = await supabase
    .from("payout_entries")
    .select("assignment_id")
    .eq("cleaner_id", cleanerId)
    .eq("status", "included");

  if (entriesError) throw new Error(entriesError.message);

  const paidAssignmentIds = new Set(
    ((payoutEntries as Array<{ assignment_id: string }> | null) ?? []).map(
      (entry) => entry.assignment_id,
    ),
  );

  const { data, error } = await supabase
    .from("assignments")
    .select(CLEANER_PENDING_PAYOUT_ASSIGNMENT_SELECT)
    .eq("cleaner_id", cleanerId)
    .in("status", ["completed_pending_review", "approved"])
    .not("fixed_payout_amount", "is", null)
    .order("due_at", { ascending: false });

  if (error) throw new Error(error.message);

  return ((data as unknown as AssignmentListRecord[] | null) ?? []).map(withListingConfiguration).filter(
    (assignment) => !paidAssignmentIds.has(assignment.id),
  );
}

/** Completed assignments in a date range not yet included in any batch. */
export type EligibleAssignment = {
  id: string;
  property_id: string;
  cleaner_id: string;
  due_at: string;
  fixed_payout_amount: number | null;
  expected_duration_min: number | null;
  properties: { name: string } | null;
  cleaners: { full_name: string } | null;
};

export async function listEligibleAssignments(
  periodStart: string,
  periodEnd: string,
  cleanerFilter: string | null,
): Promise<EligibleAssignment[]> {
  const supabase = await createServerSupabaseClient();
  let q = supabase
    .from("assignments")
    .select(
      `id, property_id, cleaner_id, due_at, fixed_payout_amount, expected_duration_min,
       properties:property_id(name),
       cleaners:cleaners!assignments_cleaner_id_fkey(full_name)`,
    )
    .in("status", ["approved", "completed_pending_review"])
    .gte("due_at", periodStart)
    .lte("due_at", periodEnd)
    // Exclude assignments already in a batch
    .not(
      "id",
      "in",
      `(select assignment_id from payout_entries where status = 'included')`,
    );

  if (cleanerFilter) {
    q = q.eq("cleaner_id", cleanerFilter);
  }

  const { data, error } = await q.order("due_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as EligibleAssignment[];
}

/** Group entries by cleaner for statement rendering. */
export type CleanerStatement = {
  cleaner_id: string;
  cleaner_name: string;
  entries: PayoutEntryRecord[];
  subtotal: number;
};

/**
 * Total dollars owed but not yet paid: sum of included entries with no paid_at
 * plus approved assignments with a fixed_payout_amount that are not yet in any
 * included entry. Used for the dashboard pending-payout tile.
 */
export async function getPendingPayoutTotal(): Promise<{
  amount: number;
  unpaidEntries: number;
  orphanAssignments: number;
  reconciledLedgers: number;
}> {
  const summaries = await listCleanerFinancialSummaries();
  return {
    amount: Math.round(summaries.reduce((sum, summary) => sum + Math.round(summary.balance * 100), 0)) / 100,
    unpaidEntries: summaries.reduce((sum, summary) => sum + summary.unpaidEntries, 0),
    orphanAssignments: summaries.reduce((sum, summary) => sum + summary.orphanAssignments, 0),
    reconciledLedgers: summaries.filter((summary) => summary.ledger).length,
  };
}

/**
 * All payout entries for a given cleaner in a given year, for tax/1099
 * preparation. Includes property name and due date from the assignment.
 */
/** One payment to a cleaner, dated by when it was actually paid. */
export type CleanerYearPayment = {
  id: string;
  paidAt: string;
  amount: number;
  propertyName: string;
  assignmentType: string | null;
  dueAt: string | null;
};

/**
 * Payments made to a cleaner in a calendar year (cash basis, for 1099s):
 * report entries that were paid (entry stamp, or the report marked paid) plus
 * jobs paid directly from the schedule outside any report. Draft, approved-but-
 * unpaid and cancelled reports don't count. Year bounds use the app zone.
 */
export async function listCleanerPayoutsForYear(
  cleanerId: string,
  year: number,
): Promise<CleanerYearPayment[]> {
  const financial=await getCleanerFinancialSummary(cleanerId);
  return financial.statementEntries.filter(entry=>entry.kind==="payment"&&entry.entry_date.startsWith(`${year}-`)).map(entry=>({
    id:entry.id,paidAt:`${entry.entry_date}T12:00:00Z`,amount:-Number(entry.amount),propertyName:entry.description,assignmentType:null,dueAt:null,
  })).sort((a,b)=>a.paidAt.localeCompare(b.paidAt));
}

export function groupEntriesByClean(
  entries: PayoutEntryRecord[],
): CleanerStatement[] {
  const map = new Map<string, CleanerStatement>();
  for (const e of entries) {
    if (e.status !== "included") continue;
    const key = e.cleaner_id;
    if (!map.has(key)) {
      map.set(key, {
        cleaner_id: key,
        cleaner_name: e.cleaners?.full_name ?? "Unknown",
        entries: [],
        subtotal: 0,
      });
    }
    const stmt = map.get(key)!;
    stmt.entries.push(e);
    stmt.subtotal += Number(e.amount);
  }
  return Array.from(map.values()).sort((a, b) =>
    a.cleaner_name.localeCompare(b.cleaner_name),
  );
}
