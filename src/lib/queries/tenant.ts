import "server-only";

import { cache } from "react";

import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type TenantBranding = {
  /** Owner row id (= tenant id). */
  ownerId: string;
  /** Display name shown in the sidebar / app bar. Falls back to "TurnFlow". */
  name: string;
  /** Public Storage URL of the workspace logo, or null when unset. */
  logoUrl: string | null;
};

const DEFAULT_NAME = "TurnFlow";

/**
 * Returns the tenant's branding (name + logo). Service-role bypasses RLS so
 * a logged-in cleaner can still read their tenant's branding even though
 * RLS wouldn't normally let them SELECT another role's full row.
 *
 * Wrapped in React.cache so multiple components on the same server render
 * pay for at most one query.
 */
export const getTenantBranding = cache(
  async (ownerId: string | null | undefined): Promise<TenantBranding | null> => {
    if (!ownerId) return null;
    const supabase = createServiceSupabaseClient();
    const { data, error } = await supabase
      .from("users")
      .select("id, tenant_name, tenant_logo_url, full_name")
      .eq("id", ownerId)
      .eq("role", "owner")
      .maybeSingle();

    if (error || !data) return null;

    const fallbackName =
      (data.full_name as string | null)
        ?.split(" ")[0]
        ? `${(data.full_name as string).split(" ")[0]}'s workspace`
        : DEFAULT_NAME;

    return {
      ownerId: data.id as string,
      name: (data.tenant_name as string | null) ?? fallbackName,
      logoUrl: (data.tenant_logo_url as string | null) ?? null,
    };
  },
);
