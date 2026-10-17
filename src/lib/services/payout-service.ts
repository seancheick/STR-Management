import "server-only";
import {isJobInReportPeriod} from "@/lib/services/report-dates";
import { listCleanerAccounts, isReconciledJob } from "@/lib/queries/cleaner-ledger";

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

  // Fetch a timezone-safe envelope, then use each listing's actual local date.
  type PayableJob={id:string;property_id:string;listing_property_id:string|null;cleaner_id:string|null;fixed_payout_amount:number|null;owner_id:string;due_at:string;properties:{timezone:string|null}|null;listing_properties:{timezone:string|null}|null};
  const assignments:PayableJob[]=[];
  const lower=new Date(`${input.periodStart}T00:00:00Z`);lower.setUTCDate(lower.getUTCDate()-1);
  const upper=new Date(`${input.periodEnd}T00:00:00Z`);upper.setUTCDate(upper.getUTCDate()+2);
  for(let offset=0;;offset+=1000){
    let query=supabase.from("assignments").select("id,property_id,listing_property_id,cleaner_id,fixed_payout_amount,owner_id,due_at,properties:property_id(timezone),listing_properties:assignments_listing_property_fk(timezone)")
      .eq("owner_id",input.ownerId).in("status",["approved","completed_pending_review"]).gte("due_at",lower.toISOString()).lt("due_at",upper.toISOString()).not("cleaner_id","is",null).order("id").range(offset,offset+999);
    if(input.cleanerFilter)query=query.eq("cleaner_id",input.cleanerFilter);
    const {data,error}=await query;
    if(error){await supabase.from("payout_batches").delete().eq("id",batch.id);return {success:false,error:error.message};}
    const rows=(data??[]) as unknown as PayableJob[];
    assignments.push(...rows.filter(job=>isJobInReportPeriod(job.due_at,input.periodStart,input.periodEnd,job.listing_properties?.timezone??job.properties?.timezone)));
    if(rows.length<1000)break;
  }

  if (!assignments || assignments.length === 0) {
    // Leave draft batch with 0 entries — owner can add manually or delete
    return { success: true, batchId: batch.id, entryCount: 0 };
  }

  // 3. Exclude assignments already in another batch
  const assignmentIds = assignments.map((a) => a.id);
  const alreadyBatched=new Set<string>();
  for(let start=0;start<assignmentIds.length;start+=500){
    for(let offset=0;;offset+=1000){
      const {data:existing,error}=await supabase.from("payout_entries").select("assignment_id").eq("owner_id",input.ownerId).in("assignment_id",assignmentIds.slice(start,start+500)).eq("status","included").order("id").range(offset,offset+999);
      if(error){await supabase.from("payout_batches").delete().eq("id",batch.id);return {success:false,error:error.message};}
      for(const entry of existing??[])alreadyBatched.add(entry.assignment_id);
      if((existing?.length??0)<1000)break;
    }
  }

  const accounts = await listCleanerAccounts();
  const eligible = assignments.filter((a) => !alreadyBatched.has(a.id) && !isReconciledJob(accounts,a.cleaner_id,a.due_at,a.listing_properties?.timezone??a.properties?.timezone));

  if (eligible.length === 0) {
    return { success: true, batchId: batch.id, entryCount: 0 };
  }

  // 4. Insert entries
  const entries = eligible.map((a) => ({
    batch_id: batch.id,
    owner_id: input.ownerId,
    cleaner_id: a.cleaner_id as string,
    assignment_id: a.id,
    property_id: a.listing_property_id ?? a.property_id,
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
  const { error } = await supabase.rpc("pay_payout_batch", { target_batch: batchId });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function cancelBatch(
  batchId: string,
): Promise<UpdateBatchStatusResult> {
  const supabase = await createServerSupabaseClient();
  const { data: cancelled, error } = await supabase
    .from("payout_batches")
    .update({ status: "cancelled" })
    .eq("id", batchId)
    .in("status", ["draft", "approved"])
    .select("id");
  if (error) return { success: false, error: error.message };
  if (!cancelled || cancelled.length === 0) return { success: true };

  // Release the jobs: new reports skip any job with an 'included' entry, so
  // leaving them included would make these jobs unpayable via a report.
  const { error: entryErr } = await supabase
    .from("payout_entries")
    .update({ status: "excluded" })
    .eq("batch_id", batchId)
    .eq("status", "included");
  if (entryErr) return { success: false, error: entryErr.message };
  return { success: true };
}

export async function updateEntryAmount(
  entryId: string,
  amount: number,
  notes: string | null,
): Promise<UpdateBatchStatusResult> {
  const supabase = await createServerSupabaseClient();
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000 || Math.round(amount * 100) / 100 !== amount) {
    return { success: false, error: "Enter a valid positive amount with up to two decimal places." };
  }
  const { data: entry, error: fetchErr } = await supabase
    .from("payout_entries")
    .select("batch_id, amount, payout_batches:batch_id(status)")
    .eq("id", entryId)
    .single();
  if (fetchErr) return { success: false, error: fetchErr.message };
  const batch = entry.payout_batches as unknown as { status: string } | null;
  if (batch?.status !== "draft") return { success: false, error: "Only draft reports can be edited." };
  if (Number(entry.amount) !== amount) return { success: false, error: "Edit job pay before generating a report. Report totals are saved snapshots." };

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
    .select("batch_id, payout_batches:batch_id(status)")
    .eq("id", entryId)
    .single();
  if (fetchErr) return { success: false, error: fetchErr.message };
  const batch = entry.payout_batches as unknown as { status: string } | null;
  if (batch?.status !== "draft") return { success: false, error: "Only draft report lines can be excluded." };

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
      `property_id, listing_property_id,
       status,
       assignment_type,
       fixed_payout_amount,
       properties:property_id(name), listing_properties:assignments_listing_property_fk(name)`,
    )
    .gte("due_at", `${periodStart}T00:00:00Z`)
    .lte("due_at", `${periodEnd}T23:59:59Z`);

  if (error) throw new Error(error.message);

  const map = new Map<string, OpsReportRow>();
  for (const a of assignments ?? []) {
    const displayId = a.listing_property_id ?? a.property_id;
    if (!map.has(displayId)) {
      map.set(displayId, {
        property_id: displayId,
        property_name:
          ((a.listing_properties ?? a.properties) as unknown as { name: string } | null)?.name ??
          "Unknown",
        total_jobs: 0,
        completed_jobs: 0,
        reclean_jobs: 0,
        total_payout: 0,
      });
    }
    const row = map.get(displayId)!;
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
