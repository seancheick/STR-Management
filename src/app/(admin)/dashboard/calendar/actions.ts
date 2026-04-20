"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { resolveOwnerId } from "@/lib/queries/properties";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { syncCalendarSource } from "@/lib/ical/sync-service";
import type { SyncResult } from "@/lib/ical/sync-service";

const addSourceSchema = z.object({
  propertyId: z.string().uuid("Select a property."),
  name: z.string().min(1).max(120),
  icalUrl: z.string().url("Enter a valid iCal URL."),
  platform: z.enum(["airbnb", "vrbo", "booking", "other"]).default("other"),
});

export type AddCalendarSourceState = {
  status: "idle" | "success" | "error";
  message: string | null;
  fieldErrors?: Record<string, string[] | undefined>;
};

export async function addCalendarSourceAction(
  _prev: AddCalendarSourceState,
  formData: FormData,
): Promise<AddCalendarSourceState> {
  await requireRole(["owner", "admin"]);

  let values: z.infer<typeof addSourceSchema>;
  try {
    values = addSourceSchema.parse({
      propertyId: formData.get("propertyId"),
      name: formData.get("name"),
      icalUrl: formData.get("icalUrl"),
      platform: formData.get("platform") ?? "other",
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

  const { data: created, error } = await supabase
    .from("property_calendar_sources")
    .insert({
      owner_id: ownerId,
      property_id: values.propertyId,
      name: values.name,
      ical_url: values.icalUrl,
      platform: values.platform,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { status: "error", message: "This iCal URL is already linked to this property." };
    }
    return { status: "error", message: error.message };
  }

  // Kick off the first sync immediately — no "why is nothing showing up?" moment.
  const { data: property } = await supabase
    .from("properties")
    .select("primary_checklist_template_id")
    .eq("id", values.propertyId)
    .maybeSingle();

  const syncResult = await syncCalendarSource({
    calendarSourceId: created.id as string,
    ownerId,
    propertyId: values.propertyId,
    primaryChecklistTemplateId:
      (property?.primary_checklist_template_id as string | null | undefined) ?? null,
  });

  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard/assignments");
  revalidatePath(`/dashboard/properties/${values.propertyId}`);
  revalidatePath(`/dashboard/properties/${values.propertyId}/edit`);

  if (syncResult.error) {
    return {
      status: "error",
      message: `Source added but first sync failed: ${syncResult.error}. Hit "Sync now" to retry.`,
    };
  }

  return {
    status: "success",
    message:
      syncResult.assignmentsCreated > 0
        ? `Added · ${syncResult.assignmentsCreated} upcoming cleaning${syncResult.assignmentsCreated === 1 ? "" : "s"} created.`
        : "Added. No upcoming bookings in the feed yet — try Sync now later.",
  };
}

export async function removeCalendarSourceAction(
  sourceId: string,
): Promise<{ error: string | null }> {
  await requireRole(["owner", "admin"]);
  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from("property_calendar_sources")
    .update({ active: false })
    .eq("id", sourceId);

  revalidatePath("/dashboard/calendar");
  return { error: error?.message ?? null };
}

export async function manualSyncAction(
  sourceId: string,
): Promise<{ error: string | null; result?: SyncResult }> {
  await requireRole(["owner", "admin", "supervisor"]);
  const supabase = await createServerSupabaseClient();

  const { data: source } = await supabase
    .from("property_calendar_sources")
    .select("owner_id, property_id, properties:property_id ( primary_checklist_template_id )")
    .eq("id", sourceId)
    .maybeSingle();

  if (!source) {
    return { error: "Calendar source not found." };
  }

  const result = await syncCalendarSource({
    calendarSourceId: sourceId,
    ownerId: source.owner_id as string,
    propertyId: source.property_id as string,
    primaryChecklistTemplateId:
      (source.properties as unknown as { primary_checklist_template_id: string | null } | null)
        ?.primary_checklist_template_id ?? null,
  });

  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard/assignments");
  revalidatePath("/dashboard");
  return { error: result.error ?? null, result };
}
