"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod/v4";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { cleaningScopeCorrectionSchema, type CleaningScopeCorrectionInput } from "@/lib/validations/cleaning-scope";

export async function getCleaningScopeAction(assignmentId: string) {
  const actor = await requireRole(["owner", "admin", "supervisor"]);
  if (actor.role === "supervisor") return null;
  if (!z.guid().safeParse(assignmentId).success) throw new Error("Invalid cleaning ID.");
  const client = await createServerSupabaseClient();
  const { data: job, error } = await client.from("assignments")
    .select("id, status, assignment_type, property_id, listing_property_id, cleaning_scope_property_id, cleaning_scope_total, fixed_payout_amount, checkout_at, due_at, paid_at, ledger_entry_id, calendar_source_id, source_reference, booked:assignments_listing_property_fk(name,bedrooms)")
    .eq("owner_id", actor.owner_id).eq("id", assignmentId).maybeSingle();
  if (error || !job) throw new Error(error?.message ?? "Cleaning not found.");
  if (job.assignment_type !== "cleaning" || job.status === "cancelled") return null;
  const [options, reports, receipts] = await Promise.all([
    client.from("properties").select("id,name,bedrooms,default_clean_price,primary_checklist_template_id")
      .eq("owner_id", actor.owner_id).eq("active", true).or(`id.eq.${job.property_id},physical_unit_id.eq.${job.property_id}`).order("bedrooms"),
    client.from("payout_entries").select("id", { count: "exact", head: true }).eq("owner_id", actor.owner_id).eq("assignment_id", assignmentId),
    client.from("cleaning_scope_corrections").select("id,reason,before_record,after_record,created_at").eq("owner_id", actor.owner_id).eq("assignment_id", assignmentId).order("created_at", { ascending: false }),
  ]);
  if (options.error || reports.error || receipts.error) throw new Error("Could not load the correction preview. Refresh and try again.");
  let reservation: { guest_name: string | null; start_at: string; end_at: string } | null = null;
  if (job.calendar_source_id && job.source_reference) {
    const result = await client.from("reservations").select("guest_name,start_at,end_at").eq("owner_id", actor.owner_id)
      .eq("calendar_source_id", job.calendar_source_id).eq("source_reference", job.source_reference).maybeSingle();
    if (result.error) throw new Error("Could not verify the original booking.");
    reservation = result.data;
  }
  return {
    assignmentId: job.id, status: job.status, checkoutAt: job.checkout_at, dueAt: job.due_at,
    bookedListing: job.booked as unknown as { name: string; bedrooms: number | null } | null,
    reservation, currentScopeId: job.cleaning_scope_property_id ?? job.listing_property_id ?? job.property_id,
    currentTotal: Number(job.cleaning_scope_total ?? job.fixed_payout_amount ?? 0),
    financialHistoryLocked: !!job.paid_at || !!job.ledger_entry_id || (reports.count ?? 0) > 0,
    checklistMode: ["unassigned", "assigned", "confirmed"].includes(job.status) ? "Existing evidence is preserved; untouched checklist items can follow the corrected scope." : "Completion evidence and checklist history are preserved; the correction does not certify extra work was checked off.",
    options: options.data ?? [], corrections: receipts.data ?? [],
  };
}

export async function correctCleaningScopeAction(input: CleaningScopeCorrectionInput) {
  await requireRole(["owner", "admin"]);
  const parsed = cleaningScopeCorrectionSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check the correction details.", receipt: null };
  const value = parsed.data;
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("correct_cleaning_scope", {
    request_id: value.requestId, target_assignment: value.assignmentId, target_scope: value.scopePropertyId,
    corrected_total: value.total, correction_reason: value.reason, expected_current_total: value.expectedCurrentTotal, expected_current_scope: value.expectedScopePropertyId,
  });
  if (error) return { error: error.message, receipt: null };
  revalidatePath("/dashboard", "layout");
  revalidatePath("/jobs", "layout");
  return { error: null, receipt: data };
}
