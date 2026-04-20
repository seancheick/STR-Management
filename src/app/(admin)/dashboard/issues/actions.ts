"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { markNeedsReclean } from "@/lib/services/issue-service";

export type IssueAdminActionResult = { error: string | null };

export async function acknowledgeIssueAction(
  issueId: string,
): Promise<IssueAdminActionResult> {
  await requireRole(["owner", "admin", "supervisor"]);
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("issues")
    .update({ status: "acknowledged" })
    .eq("id", issueId)
    .eq("status", "open");

  revalidatePath("/dashboard/issues");
  return { error: error?.message ?? null };
}

export async function resolveIssueAction(
  issueId: string,
  notes?: string,
): Promise<IssueAdminActionResult> {
  const profile = await requireRole(["owner", "admin", "supervisor"]);
  const supabase = await createServerSupabaseClient();

  const trimmed = notes?.trim() ?? "";
  const payload: Record<string, unknown> = {
    status: "resolved",
    resolved_at: new Date().toISOString(),
    resolved_by_id: profile.id,
  };
  if (trimmed.length > 0) {
    payload.resolution_notes = trimmed;
  }

  const { error } = await supabase
    .from("issues")
    .update(payload)
    .eq("id", issueId)
    .in("status", ["open", "acknowledged", "in_progress"]);

  revalidatePath("/dashboard/issues");
  return { error: error?.message ?? null };
}

export async function markInProgressAction(
  issueId: string,
): Promise<IssueAdminActionResult> {
  await requireRole(["owner", "admin", "supervisor"]);
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("issues")
    .update({ status: "in_progress" })
    .eq("id", issueId)
    .eq("status", "acknowledged");

  revalidatePath("/dashboard/issues");
  return { error: error?.message ?? null };
}

export async function markNeedsRecleanAction(
  assignmentId: string,
  currentStatus: string,
): Promise<IssueAdminActionResult> {
  await requireRole(["owner", "admin", "supervisor"]);

  const result = await markNeedsReclean({ assignmentId, currentStatus });

  revalidatePath("/dashboard/assignments");
  revalidatePath("/dashboard");
  return { error: result.success ? null : result.error };
}

export async function acknowledgeRestockAction(
  requestId: string,
): Promise<IssueAdminActionResult> {
  await requireRole(["owner", "admin", "supervisor"]);
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("restock_requests")
    .update({ status: "acknowledged" })
    .eq("id", requestId)
    .eq("status", "pending");

  revalidatePath("/dashboard/issues");
  return { error: error?.message ?? null };
}

export async function fulfillRestockAction(
  requestId: string,
): Promise<IssueAdminActionResult> {
  const profile = await requireRole(["owner", "admin", "supervisor"]);
  const supabase = await createServerSupabaseClient();

  const { data: req } = await supabase
    .from("restock_requests")
    .update({
      status: "fulfilled",
      fulfilled_at: new Date().toISOString(),
      fulfilled_by_id: profile.id,
    })
    .eq("id", requestId)
    .in("status", ["pending", "acknowledged"])
    .select("inventory_item_id, quantity_needed")
    .maybeSingle();

  if (req) {
    // Bump inventory count
    await supabase.rpc("increment_inventory_quantity", {
      p_item_id: req.inventory_item_id,
      p_delta: req.quantity_needed,
    });
  }

  revalidatePath("/dashboard/issues");
  return { error: null };
}
