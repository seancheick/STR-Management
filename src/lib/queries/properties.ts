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
  cleaner_access_code: string | null;
  cleaner_access_code_set_at: string | null;
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
        "cleaner_access_code",
        "cleaner_access_code_set_at",
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
        "cleaner_access_code",
        "cleaner_access_code_set_at",
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

  // Multi-tenant: every user has owner_id (owners self-reference). This is
  // the only correct way to resolve the tenant — falling back to "the first
  // active owner" would mean Tenant B's admins stamp Tenant A's id on their
  // inserts and trip the new RLS write-check.
  if (!profile.owner_id) {
    throw new Error("User has no tenant — multi-tenancy not configured for this account.");
  }
  return profile.owner_id;
}

