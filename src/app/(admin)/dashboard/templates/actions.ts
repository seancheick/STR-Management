"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/session";
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
