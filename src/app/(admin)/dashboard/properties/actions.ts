"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth/session";
import { resolveOwnerId } from "@/lib/queries/properties";
import { parsePropertyFormData } from "@/lib/services/property-form";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type PropertyActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  fieldErrors?: Record<string, string[] | undefined>;
};

function getFieldErrors(error: unknown) {
  if (!(error instanceof Error) || !("issues" in error)) {
    return undefined;
  }

  const issues = (error as { issues?: Array<{ path: PropertyKey[]; message: string }> }).issues;
  if (!issues) {
    return undefined;
  }

  return issues.reduce<Record<string, string[]>>((acc, issue) => {
    const key = String(issue.path[0] ?? "form");
    acc[key] = [...(acc[key] ?? []), issue.message];
    return acc;
  }, {});
}

export async function createPropertyAction(
  _previousState: PropertyActionState,
  formData: FormData,
): Promise<PropertyActionState> {
  await requireRole(["owner", "admin"]);

  try {
    const values = parsePropertyFormData(formData);
    const ownerId = await resolveOwnerId();
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.from("properties").insert({
      owner_id: ownerId,
      name: values.name,
      address_line_1: values.addressLine1,
      city: values.city,
      state: values.state,
      postal_code: values.postalCode,
      bedrooms: values.bedrooms,
      bathrooms: values.bathrooms,
      default_clean_price: values.defaultCleanPrice,
      difficulty_score: values.difficultyScore,
      default_cleaner_id: values.defaultCleanerId,
      active: values.active,
    });

    if (error) {
      return {
        status: "error",
        message: error.message,
      };
    }
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not create property.",
      fieldErrors: getFieldErrors(error),
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/properties");
  redirect("/dashboard/properties?status=created");
}

export async function updatePropertyAction(
  propertyId: string,
  _previousState: PropertyActionState,
  formData: FormData,
): Promise<PropertyActionState> {
  await requireRole(["owner", "admin"]);

  try {
    const values = parsePropertyFormData(formData);
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase
      .from("properties")
      .update({
        name: values.name,
        address_line_1: values.addressLine1,
        city: values.city,
        state: values.state,
        postal_code: values.postalCode,
        bedrooms: values.bedrooms,
        bathrooms: values.bathrooms,
        default_clean_price: values.defaultCleanPrice,
        difficulty_score: values.difficultyScore,
        default_cleaner_id: values.defaultCleanerId,
        active: values.active,
      })
      .eq("id", propertyId);

    if (error) {
      return {
        status: "error",
        message: error.message,
      };
    }
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Could not update property.",
      fieldErrors: getFieldErrors(error),
    };
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/properties");
  revalidatePath(`/dashboard/properties/${propertyId}/edit`);
  redirect("/dashboard/properties?status=updated");
}

export async function archivePropertyAction(propertyId: string) {
  await requireRole(["owner", "admin"]);

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("properties")
    .update({ active: false })
    .eq("id", propertyId);

  if (error) {
    redirect(`/dashboard/properties?status=error&message=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/properties");
  redirect("/dashboard/properties?status=archived");
}
