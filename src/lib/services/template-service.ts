import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveOwnerId } from "@/lib/queries/properties";

type ServiceResult = { success: true } | { success: false; error: string };
type CreateResult = { success: true; id: string } | { success: false; error: string };

export async function createTemplate(
  name: string,
  templateType: string | null,
  isDefault: boolean,
): Promise<CreateResult> {
  const supabase = await createServerSupabaseClient();
  let ownerId: string;
  try {
    ownerId = await resolveOwnerId();
  } catch {
    return { success: false, error: "Could not resolve owner." };
  }

  const { data, error } = await supabase
    .from("checklist_templates")
    .insert({
      owner_id: ownerId,
      name,
      template_type: templateType,
      is_default: isDefault,
      version: 1,
    })
    .select("id")
    .single();

  if (error || !data) return { success: false, error: error?.message ?? "Failed to create template." };
  return { success: true, id: data.id };
}

export async function updateTemplate(
  templateId: string,
  name: string,
  templateType: string | null,
  isDefault: boolean,
): Promise<ServiceResult> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("checklist_templates")
    .update({ name, template_type: templateType, is_default: isDefault })
    .eq("id", templateId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function deleteTemplate(templateId: string): Promise<ServiceResult> {
  const supabase = await createServerSupabaseClient();

  // Guard: refuse deletion if any property is using this template
  const { count } = await supabase
    .from("properties")
    .select("id", { count: "exact", head: true })
    .eq("primary_checklist_template_id", templateId);

  if ((count ?? 0) > 0) {
    return { success: false, error: "Template is in use by one or more properties." };
  }

  const { error } = await supabase
    .from("checklist_templates")
    .delete()
    .eq("id", templateId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export type TemplateItemInput = {
  sectionName: string | null;
  label: string;
  instructionText: string | null;
  referenceMediaUrl: string | null;
  required: boolean;
  sortOrder: number;
  photoCategory: string | null;
};

export async function addTemplateItem(
  templateId: string,
  item: TemplateItemInput,
): Promise<CreateResult> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("checklist_template_items")
    .insert({
      template_id: templateId,
      section_name: item.sectionName || null,
      label: item.label,
      instruction_text: item.instructionText || null,
      reference_media_url: item.referenceMediaUrl || null,
      required: item.required,
      sort_order: item.sortOrder,
      photo_category: item.photoCategory || null,
    })
    .select("id")
    .single();

  if (error || !data) return { success: false, error: error?.message ?? "Failed to add item." };
  return { success: true, id: data.id };
}

export async function updateTemplateItem(
  itemId: string,
  item: Partial<TemplateItemInput>,
): Promise<ServiceResult> {
  const supabase = await createServerSupabaseClient();
  const update: Record<string, unknown> = {};
  if (item.sectionName !== undefined) update.section_name = item.sectionName || null;
  if (item.label !== undefined) update.label = item.label;
  if (item.instructionText !== undefined) update.instruction_text = item.instructionText || null;
  if (item.referenceMediaUrl !== undefined) update.reference_media_url = item.referenceMediaUrl || null;
  if (item.required !== undefined) update.required = item.required;
  if (item.sortOrder !== undefined) update.sort_order = item.sortOrder;
  if (item.photoCategory !== undefined) update.photo_category = item.photoCategory || null;

  const { error } = await supabase
    .from("checklist_template_items")
    .update(update)
    .eq("id", itemId);

  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function removeTemplateItem(itemId: string): Promise<ServiceResult> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("checklist_template_items")
    .delete()
    .eq("id", itemId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function approveJob(
  assignmentId: string,
  reviewedById: string,
  reviewNotes: string | null,
): Promise<ServiceResult> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("assignments")
    .update({
      status: "approved",
      approved_at: new Date().toISOString(),
      reviewed_by_id: reviewedById,
      reviewed_at: new Date().toISOString(),
      review_notes: reviewNotes,
    })
    .eq("id", assignmentId)
    .eq("status", "completed_pending_review");
  if (error) return { success: false, error: error.message };
  return { success: true };
}
