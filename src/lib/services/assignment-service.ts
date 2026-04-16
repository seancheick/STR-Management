import "server-only";

import { getChecklistTemplateItems } from "@/lib/queries/checklist";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CreateAssignmentInput = {
  ownerId: string;
  propertyId: string;
  cleanerId: string | null;
  dueAt: string;
  checkoutAt: string | null;
  priority: "normal" | "high" | "urgent";
  expectedDurationMin: number | null;
  fixedPayoutAmount: number | null;
  primaryChecklistTemplateId: string | null;
  createdByUserId: string;
};

export type CreateAssignmentResult =
  | { success: true; assignmentId: string }
  | { success: false; error: string };

/**
 * Creates an assignment and optionally snapshots checklist items from the
 * property's primary checklist template. Runs inside a single DB round-trip
 * to keep it atomic enough for MVP (no explicit transaction — Supabase JS
 * client doesn't expose server-side transactions directly).
 */
export async function createAssignment(
  input: CreateAssignmentInput,
): Promise<CreateAssignmentResult> {
  const supabase = await createServerSupabaseClient();

  const hasClean = input.cleanerId !== null;

  const { data: assignment, error: assignError } = await supabase
    .from("assignments")
    .insert({
      owner_id: input.ownerId,
      property_id: input.propertyId,
      cleaner_id: input.cleanerId,
      status: hasClean ? "assigned" : "unassigned",
      ack_status: "pending",
      priority: input.priority,
      due_at: input.dueAt,
      checkout_at: input.checkoutAt,
      expected_duration_min: input.expectedDurationMin,
      fixed_payout_amount: input.fixedPayoutAmount,
      source_type: "manual",
      created_by_user_id: input.createdByUserId,
    })
    .select("id")
    .single();

  if (assignError || !assignment) {
    return { success: false, error: assignError?.message ?? "Failed to create assignment." };
  }

  // Snapshot checklist items from the template if one is linked
  if (input.primaryChecklistTemplateId) {
    const templateItems = await getChecklistTemplateItems(
      input.primaryChecklistTemplateId,
    );

    if (templateItems.length > 0) {
      const rows = templateItems.map((item) => ({
        assignment_id: assignment.id,
        template_item_id: item.id,
        section_name: item.section_name,
        label: item.label,
        instruction_text: item.instruction_text ?? null,
        reference_media_url: item.reference_media_url ?? null,
        required: item.required,
        sort_order: item.sort_order,
        photo_category: item.photo_category,
        completed: false,
      }));

      const { error: checklistError } = await supabase
        .from("assignment_checklist_items")
        .insert(rows);

      if (checklistError) {
        // Assignment was created — log but don't fail the whole operation
        console.error(
          `[assignment-service] Failed to snapshot checklist for ${assignment.id}:`,
          checklistError.message,
        );
      }
    }
  }

  return { success: true, assignmentId: assignment.id };
}
