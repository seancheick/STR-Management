"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { resolveOwnerId } from "@/lib/queries/properties";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { syncCalendarSource } from "@/lib/ical/sync-service";
import { syncHostexReservations } from "@/lib/hostex/reservation-sync";
import { assertPublicHttpsUrl } from "@/lib/ical/url-guard";
import type { SyncResult } from "@/lib/ical/sync-service";

const addSourceSchema = z.object({
  propertyId: z.string().uuid("Select a property."),
  name: z.string().min(1).max(120),
  icalUrl: z.string().url("Enter a valid iCal URL."),
  platform: z.enum(["airbnb", "vrbo", "booking", "hostex", "other"]).default("other"),
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

  try {
    await assertPublicHttpsUrl(values.icalUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Enter a valid iCal URL.";
    return { status: "error", message, fieldErrors: { icalUrl: [message] } };
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
    .update({ active: false, retired_at: new Date().toISOString() })
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

  const hostex = process.env.HOSTEX_API_TOKEN
    ? await syncHostexReservations({ ownerId: source.owner_id as string }).catch(() => ({ ok: false }))
    : null;
  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard/assignments");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/schedule");
  return { error: result.error ? "Calendar feed sync failed. Check sync history." : hostex && !hostex.ok ? "Hostex reservation sync needs attention; the calendar feed was refreshed." : null, result };
}

export type SyncAllCalendarsResult = {
  error: string | null;
  attempted: number;
  succeeded: number;
  assignmentsCreated: number;
  assignmentsRescheduled: number;
  assignmentsCancelled: number;
  conflictCount: number;
  failures: { sourceId: string; sourceName: string; propertyName: string }[];
};

/** Sync serially: alternate listings can refer to the same physical unit. */
export async function syncAllCalendarsAction(): Promise<SyncAllCalendarsResult> {
  await requireRole(["owner", "admin", "supervisor"]);
  const ownerId = await resolveOwnerId();
  const supabase = await createServerSupabaseClient();
  const summary: SyncAllCalendarsResult = {
    error: null, attempted: 0, succeeded: 0,
    assignmentsCreated: 0, assignmentsRescheduled: 0,
    assignmentsCancelled: 0, conflictCount: 0, failures: [],
  };
  type Source = {
    id: string; property_id: string; name: string;
    properties: { name: string; primary_checklist_template_id: string | null };
  };
  const sources: Source[] = [];
  // Load every page before making changes; a failed read must not silently sync a subset.
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase
      .from("property_calendar_sources")
      .select("id, property_id, name, properties:property_id!inner ( name, active, primary_checklist_template_id )")
      .eq("owner_id", ownerId)
      .eq("active", true)
      .is("retired_at", null)
      .eq("properties.active", true)
      .order("id")
      .range(offset, offset + 999);
    if (error) return { ...summary, error: "Could not load calendar sources. Try again." };
    sources.push(...((data ?? []) as unknown as Source[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  for (const source of sources) {
    summary.attempted++;
    let failed = false;
    try {
      const result = await syncCalendarSource({
        calendarSourceId: source.id,
        ownerId,
        propertyId: source.property_id,
        primaryChecklistTemplateId: source.properties.primary_checklist_template_id,
      });
      summary.assignmentsCreated += result.assignmentsCreated;
      summary.assignmentsRescheduled += result.assignmentsRescheduled;
      summary.assignmentsCancelled += result.assignmentsCancelled;
      summary.conflictCount += result.conflictCount;
      failed = Boolean(result.error);
    } catch {
      failed = true;
    }
    if (failed) {
      // Provider errors may include private feed URLs. Link the user to the existing source instead.
      summary.failures.push({ sourceId: source.id, sourceName: source.name, propertyName: source.properties.name });
    } else {
      summary.succeeded++;
    }
  }
  if (process.env.HOSTEX_API_TOKEN) {
    try {
      const hostex = await syncHostexReservations({ ownerId });
      if (hostex.summary) {
        summary.assignmentsCreated += hostex.summary.created;
        summary.assignmentsRescheduled += hostex.summary.moved;
        summary.assignmentsCancelled += hostex.summary.cancelled;
      }
      if (!hostex.ok) summary.error = "Hostex reservation sync needs attention; calendar feed results were kept. Retry or check System health.";
    } catch {
      summary.error = "Hostex reservation sync needs attention; calendar feed results were kept. Retry or check System health.";
    }
  }
  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/calendar");
  revalidatePath("/dashboard/schedule");
  revalidatePath("/dashboard/assignments");
  return summary;
}
