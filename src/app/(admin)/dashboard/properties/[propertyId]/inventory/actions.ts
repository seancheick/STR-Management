"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { resolveOwnerId } from "@/lib/queries/properties";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const addItemSchema = z.object({
  propertyId: z.string().uuid(),
  name: z.string().min(1).max(120),
  category: z.string().max(60).nullable(),
  unit: z.string().min(1).max(30),
  currentQuantity: z.number().int().min(0),
  reorderThreshold: z.number().int().min(0),
});

export type AddInventoryItemState = {
  status: "idle" | "success" | "error";
  message: string | null;
  fieldErrors?: Record<string, string[] | undefined>;
};

export async function addInventoryItemAction(
  _prev: AddInventoryItemState,
  formData: FormData,
): Promise<AddInventoryItemState> {
  await requireRole(["owner", "admin", "supervisor"]);

  let values: z.infer<typeof addItemSchema>;
  try {
    values = addItemSchema.parse({
      propertyId: formData.get("propertyId"),
      name: formData.get("name"),
      category: formData.get("category") || null,
      unit: formData.get("unit") || "unit",
      currentQuantity: Number(formData.get("currentQuantity") ?? 0),
      reorderThreshold: Number(formData.get("reorderThreshold") ?? 2),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        status: "error",
        message: "Validation failed.",
        fieldErrors: error.flatten().fieldErrors as Record<string, string[] | undefined>,
      };
    }
    return { status: "error", message: "Invalid form data." };
  }

  const ownerId = await resolveOwnerId();
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase.from("property_inventory_items").insert({
    owner_id: ownerId,
    property_id: values.propertyId,
    name: values.name,
    category: values.category,
    unit: values.unit,
    current_quantity: values.currentQuantity,
    reorder_threshold: values.reorderThreshold,
  });

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath(`/dashboard/properties/${values.propertyId}/inventory`);
  revalidatePath("/dashboard/issues");
  return { status: "success", message: "Item added." };
}

export async function updateInventoryQuantityAction(
  itemId: string,
  propertyId: string,
  newQuantity: number,
): Promise<{ error: string | null }> {
  await requireRole(["owner", "admin", "supervisor"]);
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("property_inventory_items")
    .update({ current_quantity: Math.max(0, newQuantity) })
    .eq("id", itemId);

  revalidatePath(`/dashboard/properties/${propertyId}/inventory`);
  revalidatePath("/dashboard/issues");
  return { error: error?.message ?? null };
}

export async function archiveInventoryItemAction(
  itemId: string,
  propertyId: string,
): Promise<{ error: string | null }> {
  await requireRole(["owner", "admin", "supervisor"]);
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("property_inventory_items")
    .update({ active: false })
    .eq("id", itemId);

  revalidatePath(`/dashboard/properties/${propertyId}/inventory`);
  revalidatePath("/dashboard/issues");
  return { error: error?.message ?? null };
}
