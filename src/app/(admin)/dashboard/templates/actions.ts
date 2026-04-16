"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/session";
import { getPreset } from "@/lib/data/preset-templates";
import { listTemplateItems } from "@/lib/queries/templates";
import {
  createTemplate,
  updateTemplate,
  deleteTemplate,
  addTemplateItem,
  updateTemplateItem,
  removeTemplateItem,
} from "@/lib/services/template-service";

export type TemplateActionResult = { error: string | null };

// ─── Template CRUD ────────────────────────────────────────────────────────────

export async function createTemplateAction(
  _prev: TemplateActionResult,
  formData: FormData,
): Promise<TemplateActionResult> {
  await requireRole(["owner", "admin"]);

  const name = (formData.get("name") as string | null)?.trim() ?? "";
  if (!name) return { error: "Template name is required." };

  const templateType = (formData.get("template_type") as string | null)?.trim() || null;
  const isDefault = formData.get("is_default") === "true";

  const result = await createTemplate(name, templateType, isDefault);
  if (!result.success) return { error: result.error };

  revalidatePath("/dashboard/templates");
  redirect(`/dashboard/templates/${result.id}` as never);
}

export async function updateTemplateAction(
  templateId: string,
  formData: FormData,
): Promise<TemplateActionResult> {
  await requireRole(["owner", "admin"]);

  const name = (formData.get("name") as string | null)?.trim() ?? "";
  if (!name) return { error: "Template name is required." };

  const templateType = (formData.get("template_type") as string | null)?.trim() || null;
  const isDefault = formData.get("is_default") === "true";

  const result = await updateTemplate(templateId, name, templateType, isDefault);
  if (!result.success) return { error: result.error };

  revalidatePath("/dashboard/templates");
  revalidatePath(`/dashboard/templates/${templateId}`);
  return { error: null };
}

export async function deleteTemplateAction(
  templateId: string,
): Promise<TemplateActionResult> {
  await requireRole(["owner", "admin"]);

  const result = await deleteTemplate(templateId);
  if (!result.success) return { error: result.error };

  revalidatePath("/dashboard/templates");
  redirect("/dashboard/templates" as never);
}

// ─── Template item CRUD ───────────────────────────────────────────────────────

export async function addTemplateItemAction(
  templateId: string,
  _prev: TemplateActionResult,
  formData: FormData,
): Promise<TemplateActionResult> {
  await requireRole(["owner", "admin"]);

  const label = (formData.get("label") as string | null)?.trim() ?? "";
  if (!label) return { error: "Item label is required." };

  const sectionName = (formData.get("section_name") as string | null)?.trim() || null;
  const instructionText = (formData.get("instruction_text") as string | null)?.trim() || null;
  const referenceMediaUrl = (formData.get("reference_media_url") as string | null)?.trim() || null;
  const required = formData.get("required") !== "false";
  const sortOrder = parseInt(formData.get("sort_order") as string, 10) || 0;
  const photoCategory = (formData.get("photo_category") as string | null)?.trim() || null;

  const result = await addTemplateItem(templateId, {
    sectionName,
    label,
    instructionText,
    referenceMediaUrl,
    required,
    sortOrder,
    photoCategory,
  });

  if (!result.success) return { error: result.error };

  revalidatePath(`/dashboard/templates/${templateId}`);
  return { error: null };
}

export async function updateTemplateItemAction(
  templateId: string,
  itemId: string,
  formData: FormData,
): Promise<TemplateActionResult> {
  await requireRole(["owner", "admin"]);

  const label = (formData.get("label") as string | null)?.trim() ?? "";
  if (!label) return { error: "Item label is required." };

  const result = await updateTemplateItem(itemId, {
    sectionName: (formData.get("section_name") as string | null)?.trim() || null,
    label,
    instructionText: (formData.get("instruction_text") as string | null)?.trim() || null,
    referenceMediaUrl: (formData.get("reference_media_url") as string | null)?.trim() || null,
    required: formData.get("required") !== "false",
    sortOrder: parseInt(formData.get("sort_order") as string, 10) || 0,
    photoCategory: (formData.get("photo_category") as string | null)?.trim() || null,
  });

  if (!result.success) return { error: result.error };

  revalidatePath(`/dashboard/templates/${templateId}`);
  return { error: null };
}

export async function removeTemplateItemAction(
  templateId: string,
  itemId: string,
): Promise<TemplateActionResult> {
  await requireRole(["owner", "admin"]);

  const result = await removeTemplateItem(itemId);
  if (!result.success) return { error: result.error };

  revalidatePath(`/dashboard/templates/${templateId}`);
  return { error: null };
}

// ─── Clone a built-in preset into a new saved template ───────────────────────
export async function clonePresetAction(
  presetKey: string,
  customName?: string,
): Promise<TemplateActionResult & { id?: string }> {
  await requireRole(["owner", "admin", "supervisor"]);

  const preset = getPreset(presetKey);
  if (!preset) return { error: "Preset not found." };

  const name = customName?.trim() || preset.name;
  const createResult = await createTemplate(name, preset.template_type, false);
  if (!createResult.success) return { error: createResult.error };

  const templateId = createResult.id;

  // Insert all preset items
  for (const item of preset.items) {
    await addTemplateItem(templateId, {
      sectionName: item.section_name,
      label: item.label,
      instructionText: item.instruction_text,
      referenceMediaUrl: null,
      required: item.required,
      sortOrder: item.sort_order,
      photoCategory: item.photo_category,
    });
  }

  revalidatePath("/dashboard/templates");
  return { error: null, id: templateId };
}

// ─── Clone an existing saved template ────────────────────────────────────────
export async function cloneTemplateAction(
  sourceTemplateId: string,
): Promise<TemplateActionResult & { id?: string }> {
  await requireRole(["owner", "admin", "supervisor"]);

  const items = await listTemplateItems(sourceTemplateId);

  // We need the source template name — fetch via the service client
  const { createServerSupabaseClient } = await import("@/lib/supabase/server");
  const supabase = await createServerSupabaseClient();
  const { data: src } = await supabase
    .from("checklist_templates")
    .select("name, template_type")
    .eq("id", sourceTemplateId)
    .single();

  if (!src) return { error: "Template not found." };

  const createResult = await createTemplate(`Copy of ${src.name}`, src.template_type ?? null, false);
  if (!createResult.success) return { error: createResult.error };

  const newId = createResult.id;
  for (const item of items) {
    await addTemplateItem(newId, {
      sectionName: item.section_name,
      label: item.label,
      instructionText: item.instruction_text,
      referenceMediaUrl: item.reference_media_url,
      required: item.required,
      sortOrder: item.sort_order,
      photoCategory: item.photo_category,
    });
  }

  revalidatePath("/dashboard/templates");
  redirect(`/dashboard/templates/${newId}` as never);
}
