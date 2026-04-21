"use server";

import { z } from "zod";

import { createServiceSupabaseClient } from "@/lib/supabase/service";

const schema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  propertyCount: z.enum(["1-3", "4-10", "10+"]).optional(),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

export type EarlyAccessState = {
  status: "idle" | "success" | "error" | "duplicate";
  message: string | null;
};

export async function requestEarlyAccessAction(
  _prev: EarlyAccessState,
  formData: FormData,
): Promise<EarlyAccessState> {
  const parsed = schema.safeParse({
    email: formData.get("email"),
    propertyCount: formData.get("propertyCount") ?? undefined,
    notes: formData.get("notes") ?? "",
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Check your email and try again.",
    };
  }

  const supabase = createServiceSupabaseClient();
  const { error } = await supabase.from("early_access_requests").insert({
    email: parsed.data.email,
    property_count: parsed.data.propertyCount ?? null,
    notes: parsed.data.notes || null,
  });

  if (error) {
    // Unique constraint = already on the list
    if (error.code === "23505") {
      return {
        status: "duplicate",
        message: "You're already on the list — we'll be in touch.",
      };
    }
    return { status: "error", message: error.message };
  }

  return {
    status: "success",
    message: "You're in. We'll reach out soon to set you up.",
  };
}
