import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AssignmentListRecord } from "@/lib/queries/assignments";

export type PayoutBatchRecord = {
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
  properties?: { name: string } | null;
  assignments?: {
    due_at: string;
    assignment_type: string;
    expected_duration_min: number | null;
  } | null;
};

export async function listPayoutBatches(): Promise<PayoutBatchRecord[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("payout_batches")
    .select(
      `*, cleaner_filter_user:users!payout_batches_cleaner_filter_fkey(full_name)`,
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
      `*, cleaner_filter_user:users!payout_batches_cleaner_filter_fkey(full_name)`,
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
  const { data, error } = await supabase
    .from("payout_entries")
    .select(
      `*,
       cleaners:users!payout_entries_cleaner_id_fkey(full_name),
       properties(name),
       assignments(due_at, assignment_type, expected_duration_min)`,
    )
    .eq("batch_id", batchId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PayoutEntryRecord[];
}

/** Entries visible to a cleaner (approved/paid batches only). */
export async function listMyPayoutEntries(
  cleanerId: string,
): Promise<PayoutEntryRecord[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("payout_entries")
    .select(
      `*,
       properties(name),
       assignments(due_at, assignment_type, expected_duration_min)`,
    )
    .eq("cleaner_id", cleanerId)
    .eq("status", "included")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PayoutEntryRecord[];
}

const CLEANER_PENDING_PAYOUT_ASSIGNMENT_SELECT = `
  id, owner_id, property_id, cleaner_id, assignment_type,
  status, ack_status, priority, checkout_at, due_at,
  expected_duration_min, fixed_payout_amount, created_at,
  properties:property_id ( name, address_line_1, city ),
  cleaners:cleaner_id ( full_name )
`.trim();

export async function listPendingCleanerPayoutAssignments(
  cleanerId: string,
): Promise<AssignmentListRecord[]> {
  const supabase = await createServerSupabaseClient();

  const { data: payoutEntries } = await supabase
    .from("payout_entries")
    .select("assignment_id")
    .eq("cleaner_id", cleanerId)
    .eq("status", "included");

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

  return (((data as unknown) as AssignmentListRecord[] | null) ?? []).filter(
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
       properties(name),
       cleaners:users!assignments_cleaner_id_fkey(full_name)`,
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
