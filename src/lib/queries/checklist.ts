import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type ChecklistTemplateRecord = {
  id: string;
  owner_id: string;
  name: string;
  template_type: string | null;
  version: number;
  is_default: boolean;
  created_at: string;
  item_count?: number;
};

export type ChecklistTemplateItemRecord = {
  id: string;
  template_id: string;
  section_name: string | null;
  label: string;
  instruction_text: string | null;
  required: boolean;
  sort_order: number;
  photo_category: string | null;
};

export async function listChecklistTemplates(): Promise<ChecklistTemplateRecord[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("checklist_templates")
    .select("id, owner_id, name, template_type, version, is_default, created_at")
    .order("name");

  return (data as ChecklistTemplateRecord[] | null) ?? [];
}

export async function getChecklistTemplateItems(
  templateId: string,
): Promise<ChecklistTemplateItemRecord[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("checklist_template_items")
    .select(
      "id, template_id, section_name, label, instruction_text, required, sort_order, photo_category",
    )
    .eq("template_id", templateId)
    .order("sort_order");

  return (data as ChecklistTemplateItemRecord[] | null) ?? [];
}
