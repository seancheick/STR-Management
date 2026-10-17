"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createPayoutReportSchema } from "@/lib/validation/payout-report";

import { requireRole } from "@/lib/auth/session";
import {
  generatePayoutBatch,
  approveBatch,
  markBatchPaid,
  cancelBatch,
  updateEntryAmount,
  excludeEntry,
} from "@/lib/services/payout-service";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function createPayoutBatchAction(
  _prev: { error: string | null },
  formData: FormData,
): Promise<{ error: string | null }> {
  const profile = await requireRole(["owner", "admin"]);

  const raw = {
    label: formData.get("label"),
    period_start: formData.get("period_start"),
    period_end: formData.get("period_end"),
    cleaner_filter: formData.get("cleaner_filter") || null,
    notes: formData.get("notes") || null,
  };

  const parsed = createPayoutReportSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.errors[0].message };
  }

  // CRITICAL: this must be the tenant id, not the auth user id. For owners
  // those happen to coincide; for admins / supervisors they don't, and using
  // profile.id would stamp a non-tenant uuid that RLS then hides forever.
  const result = await generatePayoutBatch({
    ownerId: profile.owner_id,
    label: parsed.data.label,
    periodStart: parsed.data.period_start,
    periodEnd: parsed.data.period_end,
    cleanerFilter: parsed.data.cleaner_filter ?? null,
    notes: parsed.data.notes ?? null,
  });

  if (!result.success) return { error: result.error };

  redirect(`/dashboard/payouts/${result.batchId}` as never);
}

export async function approveBatchAction(
  batchId: string,
): Promise<{ error: string | null }> {
  const profile = await requireRole(["owner", "admin"]);
  const result = await approveBatch(batchId, profile.id);
  if (!result.success) return { error: result.error };
  revalidatePath("/dashboard/payouts");
  revalidatePath(`/dashboard/payouts/${batchId}`);
  return { error: null };
}

export async function markPaidAction(
  batchId: string,
): Promise<{ error: string | null }> {
  await requireRole(["owner", "admin"]);
  const result = await markBatchPaid(batchId);
  if (!result.success) return { error: result.error };
  revalidatePath("/dashboard/payouts");
  revalidatePath(`/dashboard/payouts/${batchId}`);
  return { error: null };
}

export async function cancelBatchAction(
  batchId: string,
): Promise<{ error: string | null }> {
  await requireRole(["owner", "admin"]);
  const result = await cancelBatch(batchId);
  if (!result.success) return { error: result.error };
  revalidatePath("/dashboard/payouts");
  revalidatePath(`/dashboard/payouts/${batchId}`);
  return { error: null };
}

export async function updateEntryAmountAction(
  entryId: string,
  amount: number,
  notes: string | null,
): Promise<{ error: string | null }> {
  await requireRole(["owner", "admin"]);
  const result = await updateEntryAmount(entryId, amount, notes);
  if (!result.success) return { error: result.error };
  revalidatePath("/dashboard/payouts");
  return { error: null };
}

export async function excludeEntryAction(
  entryId: string,
  reason: string,
): Promise<{ error: string | null }> {
  await requireRole(["owner", "admin"]);
  const result = await excludeEntry(entryId, reason);
  if (!result.success) return { error: result.error };
  revalidatePath("/dashboard/payouts");
  return { error: null };
}

/**
 * Mark a single payout entry paid/unpaid independently of the parent report.
 * Useful when a host pays out cleaner-by-cleaner or line-by-line.
 */
export async function toggleEntryPaidAction(
  entryId: string,
  paid: boolean,
): Promise<{ error: string | null }> {
  await requireRole(["owner", "admin"]);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("set_payout_entry_paid", {
    target_entry: entryId, is_paid: paid,
  });

  if (error) return { error: error.message };

  revalidatePath("/dashboard/payouts");
  revalidatePath("/jobs/pay");
  if (data) {
    revalidatePath(`/dashboard/payouts/${data}`);
  }
  return { error: null };
}
