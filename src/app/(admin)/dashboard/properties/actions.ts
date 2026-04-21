"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";

import { requireRole } from "@/lib/auth/session";
import { syncCalendarSource } from "@/lib/ical/sync-service";
import { resolveOwnerId } from "@/lib/queries/properties";
import { parsePropertyFormData } from "@/lib/services/property-form";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function detectPlatform(url: string): "airbnb" | "vrbo" | "booking" | "other" {
  const u = url.toLowerCase();
  if (u.includes("airbnb.com")) return "airbnb";
  if (u.includes("vrbo.com") || u.includes("homeaway.com")) return "vrbo";
  if (u.includes("booking.com")) return "booking";
  return "other";
}

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
  try {
    await requireRole(["owner", "admin"]);

    const values = parsePropertyFormData(formData);
    const ownerId = await resolveOwnerId();
    const supabase = await createServerSupabaseClient();
    const { data: created, error } = await supabase
      .from("properties")
      .insert({
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
        // Timezone has a NOT NULL constraint with a default on the DB.
        // Send the user's pick only when they filled it in; otherwise let
        // the default (America/New_York) fire.
        timezone: values.timezone ?? "America/New_York",
        cleaner_notes: values.cleanerNotes,
        guest_welcome_template: values.guestWelcomeTemplate,
        cleaner_access_code: values.cleanerAccessCode,
        cleaner_access_code_set_at: values.cleanerAccessCode
          ? new Date().toISOString()
          : null,
      })
      .select("id")
      .single();

    if (error || !created) {
      return {
        status: "error",
        message: error?.message ?? "Could not create property.",
      };
    }

    // Optional: attach an iCal feed and run the first sync right now
    // so the calendar has bookings to show immediately.
    if (values.icalUrl) {
      const platform = detectPlatform(values.icalUrl);
      const { data: source, error: sourceError } = await supabase
        .from("property_calendar_sources")
        .insert({
          owner_id: ownerId,
          property_id: created.id,
          name: platform === "other" ? "Calendar" : platform.charAt(0).toUpperCase() + platform.slice(1),
          ical_url: values.icalUrl,
          platform,
          active: true,
        })
        .select("id")
        .single();

      if (!sourceError && source) {
        await syncCalendarSource({
          calendarSourceId: source.id as string,
          ownerId,
          propertyId: created.id as string,
          primaryChecklistTemplateId: null,
        }).catch((err) => console.error("[createProperty] initial ical sync failed", err));
      }
    }
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[createPropertyAction]", error);
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
  try {
    await requireRole(["owner", "admin"]);

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
        // Timezone has a NOT NULL constraint with a default on the DB.
      // Send the user's pick only when they filled it in; otherwise let
      // the default (America/New_York) fire.
      timezone: values.timezone ?? "America/New_York",
        cleaner_notes: values.cleanerNotes,
        guest_welcome_template: values.guestWelcomeTemplate,
        cleaner_access_code: values.cleanerAccessCode,
      })
      .eq("id", propertyId);

    if (error) {
      return {
        status: "error",
        message: error.message,
      };
    }
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[updatePropertyAction]", error);
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
