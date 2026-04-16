import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type GenerateBatchInput = {
  ownerId: string;
  label: string;
  periodStart: string; // ISO date string YYYY-MM-DD
  periodEnd: string;
  cleanerFilter: string | null;
  notes: string | null;
};

export type GenerateBatchResult =
  | { success: true; batchId: string; entryCount: number }
  | { success: false; error: string };

/**
 * Creates a draft payout batch and populates entries from approved/reviewed
 * assignments in the period. Uses `fixed_payout_amount` when set; falls back
 * to 0 (owner adjusts manually before approving).
 */
export async function generatePayoutBatch(
  input: GenerateBatchInput,
): Promise<GenerateBatchResult> {
  const supabase = await createServerSupabaseClient();

  // 1. Create the batch in draft status
  const { data: batch, error: batchErr } = await supabase
    .from("payout_batches")
    .insert({
      owner_id: input.ownerId,
      label: input.label,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      cleaner_filter: input.cleanerFilter,
      notes: input.notes,
      status: "draft",
    })
    .select("id")
    .single();

  if (batchErr) return { success: false, error: batchErr.message };

  // 2. Find eligible assignments (approved / completed_pending_review in period)
  let q = supabase
    .from("assignments")
    .select(
      "id, property_id, cleaner_id, fixed_payout_amount, owner_id",
    )
    .in("status", ["approved", "completed_pending_review"])
    .gte("due_at", `${input.periodStart}T00:00:00Z`)
    .lte("due_at", `${input.periodEnd}T23:59:59Z`)
    .not("cleaner_id", "is", null);

  if (input.cleanerFilter) {
    q = q.eq("cleaner_id", input.cleanerFilter);
  }

  const { data: assignments, error: assignErr } = await q;
  if (assignErr) {
    // Clean up the empty batch
    await supabase.from("payout_batches").delete().eq("id", batch.id);
    return { success: false, error: assignErr.message };
  }

  if (!assignments || assignments.length === 0) {
    // Leave draft batch with 0 entries — owner can add manually or delete
    return { success: true, batchId: batch.id, entryCount: 0 };
  }

  // 3. Exclude assignments already in another batch
  const assignmentIds = assignments.map((a) => a.id);
  const { data: existing } = await supabase
    .from("payout_entries")
    .select("assignment_id")
    .in("assignment_id", assignmentIds)
    .eq("status", "included");

  const alreadyBatched = new Set((existing ?? []).map((e) => e.assignment_id));
  const eligible = assignments.filter((a) => !alreadyBatched.has(a.id));

  if (eligible.length === 0) {
    return { success: true, batchId: batch.id, entryCount: 0 };
  }

  // 4. Insert entries
  const entries = eligible.map((a) => ({
    batch_id: batch.id,
    owner_id: input.ownerId,
    cleaner_id: a.cleaner_id as string,
    assignment_id: a.id,
    property_id: a.property_id,
    amount: Number(a.fixed_payout_amount ?? 0),
    status: "included" as const,
  }));

  const { error: entryErr } = await supabase
    .from("payout_entries")
    .insert(entries);

  if (entryErr) {
    await supabase.from("payout_batches").delete().eq("id", batch.id);
    return { success: false, error: entryErr.message };
  }

  // 5. Recalculate batch totals
  await supabase.rpc("recalculate_payout_batch", { p_batch_id: batch.id });

  return { success: true, batchId: batch.id, entryCount: eligible.length };
}

export type UpdateBatchStatusResult =
  | { success: true }
  | { success: false; error: string };

export async function approveBatch(
  batchId: string,
  approvedById: string,
): Promise<UpdateBatchStatusResult> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("payout_batches")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      approved_by_id: approvedById,
    })
    .eq("id", batchId)
    .eq("status", "draft");
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function markBatchPaid(
  batchId: string,
): Promise<UpdateBatchStatusResult> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("payout_batches")
    .update({ status: "paid", paid_at: new Date().toISOString() })
    .eq("id", batchId)
    .eq("status", "approved");
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function cancelBatch(
  batchId: string,
): Promise<UpdateBatchStatusResult> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("payout_batches")
    .update({ status: "cancelled" })
    .eq("id", batchId)
    .in("status", ["draft", "approved"]);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function updateEntryAmount(
  entryId: string,
  amount: number,
  notes: string | null,
): Promise<UpdateBatchStatusResult> {
  const supabase = await createServerSupabaseClient();
  const { data: entry, error: fetchErr } = await supabase
    .from("payout_entries")
    .select("batch_id")
    .eq("id", entryId)
    .single();
  if (fetchErr) return { success: false, error: fetchErr.message };

  const { error } = await supabase
    .from("payout_entries")
    .update({ amount, notes })
    .eq("id", entryId);
  if (error) return { success: false, error: error.message };

  await supabase.rpc("recalculate_payout_batch", {
    p_batch_id: entry.batch_id,
  });
  return { success: true };
}

export async function excludeEntry(
  entryId: string,
  reason: string,
): Promise<UpdateBatchStatusResult> {
  const supabase = await createServerSupabaseClient();
  const { data: entry, error: fetchErr } = await supabase
    .from("payout_entries")
    .select("batch_id")
    .eq("id", entryId)
    .single();
  if (fetchErr) return { success: false, error: fetchErr.message };

  const { error } = await supabase
    .from("payout_entries")
    .update({ status: "excluded", notes: reason })
    .eq("id", entryId);
  if (error) return { success: false, error: error.message };

  await supabase.rpc("recalculate_payout_batch", {
    p_batch_id: entry.batch_id,
  });
  return { success: true };
}

// ─── Operational report queries ──────────────────────────────────────────────

export type OpsReportRow = {
  property_id: string;
  property_name: string;
  total_jobs: number;
  completed_jobs: number;
  reclean_jobs: number;
  total_payout: number;
};

export async function getOpsReport(
  periodStart: string,
  periodEnd: string,
): Promise<OpsReportRow[]> {
  const supabase = await createServerSupabaseClient();

  const { data: assignments, error } = await supabase
    .from("assignments")
    .select(
      `property_id,
       status,
       assignment_type,
       fixed_payout_amount,
       properties(name)`,
    )
    .gte("due_at", `${periodStart}T00:00:00Z`)
    .lte("due_at", `${periodEnd}T23:59:59Z`);

  if (error) throw new Error(error.message);

  const map = new Map<string, OpsReportRow>();
  for (const a of assignments ?? []) {
    if (!map.has(a.property_id)) {
      map.set(a.property_id, {
        property_id: a.property_id,
        property_name:
          (a.properties as unknown as { name: string } | null)?.name ??
          "Unknown",
        total_jobs: 0,
        completed_jobs: 0,
        reclean_jobs: 0,
        total_payout: 0,
      });
    }
    const row = map.get(a.property_id)!;
    row.total_jobs++;
    if (["approved", "completed_pending_review"].includes(a.status)) {
      row.completed_jobs++;
      row.total_payout += Number(a.fixed_payout_amount ?? 0);
    }
    if (a.assignment_type === "reclean") row.reclean_jobs++;
  }

  return Array.from(map.values()).sort((a, b) =>
    a.property_name.localeCompare(b.property_name),
  );
}
