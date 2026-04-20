import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type RecurringTaskRecord = {
  id: string;
  property_id: string;
  title: string;
  description: string | null;
  cadence: "weekly" | "monthly" | "quarterly" | "annual";
  next_run_at: string;
  last_run_at: string | null;
  assignee_id: string | null;
  fixed_payout_amount: number | null;
  expected_duration_min: number | null;
  active: boolean;
  created_at: string;
  assignee?: { full_name: string } | null;
};

export async function listRecurringTasksForProperty(
  propertyId: string,
): Promise<RecurringTaskRecord[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("recurring_tasks")
    .select(
      `id, property_id, title, description, cadence, next_run_at, last_run_at,
       assignee_id, fixed_payout_amount, expected_duration_min, active, created_at,
       assignee:assignee_id ( full_name )`,
    )
    .eq("property_id", propertyId)
    .order("next_run_at", { ascending: true });
  return (data as unknown as RecurringTaskRecord[] | null) ?? [];
}
