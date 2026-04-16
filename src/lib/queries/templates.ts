import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type TemplateRecord = {
  id: string;
  owner_id: string;
  name: string;
  template_type: string | null;
  version: number;
  is_default: boolean;
  created_at: string;
};

export type TemplateItemRecord = {
  id: string;
  template_id: string;
  section_name: string | null;
  label: string;
  instruction_text: string | null;
  reference_media_url: string | null;
  required: boolean;
  sort_order: number;
  photo_category: string | null;
};

export async function listTemplates(): Promise<TemplateRecord[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("checklist_templates")
    .select("id, owner_id, name, template_type, version, is_default, created_at")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as TemplateRecord[];
}

export async function getTemplate(templateId: string): Promise<TemplateRecord | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("checklist_templates")
    .select("id, owner_id, name, template_type, version, is_default, created_at")
    .eq("id", templateId)
    .single();
  if (error) return null;
  return data as TemplateRecord;
}

export async function listTemplateItems(templateId: string): Promise<TemplateItemRecord[]> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("checklist_template_items")
    .select(
      "id, template_id, section_name, label, instruction_text, reference_media_url, required, sort_order, photo_category",
    )
    .eq("template_id", templateId)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data ?? []) as TemplateItemRecord[];
}
