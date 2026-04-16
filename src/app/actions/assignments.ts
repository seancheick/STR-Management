"use server";

import { getAssignmentDetail } from "@/lib/queries/assignments";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export type AssignmentDetailAction = Awaited<ReturnType<typeof fetchAssignmentDetail>>;

export async function fetchAssignmentDetail(assignmentId: string) {
  await requireRole(["owner", "admin", "supervisor"]);
  const detail = await getAssignmentDetail(assignmentId);
  if (!detail) return null;

  const completedItems = detail.checklist_items.filter((i) => i.completed).length;
  const totalItems = detail.checklist_items.length;
  const photoCount = detail.photos.length;

  return {
    id: detail.id,
    propertyName: detail.properties?.name ?? "Property",
    propertyAddress: detail.properties?.address_line_1 ?? null,
    propertyCity: detail.properties?.city ?? null,
    cleanerName: detail.cleaners?.full_name ?? null,
    status: detail.status,
    ackStatus: detail.ack_status,
    priority: detail.priority,
    dueAt: detail.due_at,
    checkoutAt: detail.checkout_at,
    nextCheckinAt: detail.next_checkin_at,
    expectedDurationMin: detail.expected_duration_min,
    fixedPayoutAmount: detail.fixed_payout_amount,
    assignmentType: detail.assignment_type,
    checklistCompleted: completedItems,
    checklistTotal: totalItems,
    photoCount,
    propertyId: detail.property_id,
    cleanerId: detail.cleaner_id,
  };
}

export async function assignCleanerAction(
  assignmentId: string,
  cleanerId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireRole(["owner", "admin", "supervisor"]);
    const supabase = await createServerSupabaseClient();

    const { error } = await supabase
      .from("assignments")
      .update({ cleaner_id: cleanerId, status: "assigned", ack_status: "pending" })
      .eq("id", assignmentId)
      .eq("status", "unassigned"); // optimistic lock — only update if still unassigned

    if (error) return { ok: false, error: error.message };

    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
