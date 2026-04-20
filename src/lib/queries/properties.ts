import "server-only";

import { cache } from "react";

import { getCurrentUserProfile } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type PropertyRecord = {
  id: string;
  owner_id: string;
  name: string;
  address_line_1: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  default_clean_price: number | null;
  difficulty_score: number | null;
  default_cleaner_id: string | null;
  active: boolean;
  timezone: string | null;
  cleaner_notes: string | null;
  guest_welcome_template: string | null;
  created_at: string;
};

export type PropertiesQueryResult = {
  data: PropertyRecord[];
  error: string | null;
};

export const listProperties = cache(async (): Promise<PropertiesQueryResult> => {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("properties")
    .select(
      [
        "id",
        "owner_id",
        "name",
        "address_line_1",
        "city",
        "state",
        "postal_code",
        "bedrooms",
        "bathrooms",
        "default_clean_price",
        "difficulty_score",
        "default_cleaner_id",
        "active",
        "timezone",
        "cleaner_notes",
        "guest_welcome_template",
        "created_at",
      ].join(","),
    )
    .order("name");

  return {
    data: (data as PropertyRecord[] | null) ?? [],
    error: error?.message ?? null,
  };
});

export async function getProperty(propertyId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("properties")
    .select(
      [
        "id",
        "owner_id",
        "name",
        "address_line_1",
        "city",
        "state",
        "postal_code",
        "bedrooms",
        "bathrooms",
        "default_clean_price",
        "difficulty_score",
        "default_cleaner_id",
        "active",
        "timezone",
        "cleaner_notes",
        "guest_welcome_template",
        "created_at",
      ].join(","),
    )
    .eq("id", propertyId)
    .maybeSingle();

  return {
    data: (data as PropertyRecord | null) ?? null,
    error: error?.message ?? null,
  };
}

export async function resolveOwnerId() {
  const profile = await getCurrentUserProfile();

  if (!profile) {
    throw new Error("You must be signed in to manage properties.");
  }

  if (profile.role === "owner") {
    return profile.id;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("role", "owner")
    .eq("active", true)
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    throw new Error("Could not resolve the owner account for this workspace.");
  }

  return data.id;
}

