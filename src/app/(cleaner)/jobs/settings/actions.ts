"use server";

import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/session";
import { parseCleanerProfileFormData } from "@/lib/services/cleaner-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CleanerProfileActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  fieldErrors?: {
    fullName?: string[];
    phone?: string[];
    availability?: string[];
  };
};

export async function updateCleanerProfileAction(
  _prev: CleanerProfileActionState,
  formData: FormData,
): Promise<CleanerProfileActionState> {
  const profile = await requireRole(["cleaner", "owner", "admin", "supervisor"]);
  const parsed = parseCleanerProfileFormData(formData);

  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted fields.",
      fieldErrors: parsed.fieldErrors,
    };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase
    .from("users")
    .update({
      full_name: parsed.data.fullName,
      phone: parsed.data.phone,
      availability: parsed.data.availability,
    })
    .eq("id", profile.id);

  if (error) {
    return { status: "error", message: error.message };
  }

  revalidatePath("/jobs");
  revalidatePath("/jobs/settings");
  return { status: "success", message: "Profile updated." };
}
