import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type WeeklyRecap = {
  windowStart: string;
  windowEnd: string;
  completed: number;
  reCleans: number;
  onTimeRate: number | null; // 0..1 or null if no data
  totalPaid: number;
  upcomingUnassigned: number;
};

/**
 * Summarises the previous 7 days + points at what's unassigned coming up.
 * Meant for a "this past week" card on the dashboard; also usable by a
 * weekly email job later.
 */
export async function getWeeklyRecap(): Promise<WeeklyRecap> {
  const supabase = await createServerSupabaseClient();
  const now = new Date();
  const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [approvedRes, recleanRes, allRes, paidRes, upcomingRes] =
    await Promise.all([
      supabase
        .from("assignments")
        .select("id, due_at, approved_at", { count: "exact" })
        .gte("approved_at", start.toISOString())
        .lte("approved_at", now.toISOString())
        .eq("status", "approved"),
      supabase
        .from("assignments")
        .select("id", { count: "exact", head: true })
        .gte("updated_at", start.toISOString())
        .eq("status", "needs_reclean"),
      supabase
        .from("assignments")
        .select("id", { count: "exact", head: true })
        .gte("approved_at", start.toISOString())
        .lte("approved_at", now.toISOString()),
      supabase
        .from("payout_entries")
        .select("amount")
        .gte("paid_at", start.toISOString())
        .lte("paid_at", now.toISOString()),
      supabase
        .from("assignments")
        .select("id", { count: "exact", head: true })
        .eq("status", "unassigned")
        .gte("due_at", now.toISOString()),
    ]);

  const approved = (approvedRes.data as Array<{ due_at: string; approved_at: string }> | null) ?? [];
  const onTime = approved.filter((a) => {
    const due = new Date(a.due_at).getTime();
    const done = new Date(a.approved_at).getTime();
    return done <= due + 2 * 60 * 60 * 1000; // within 2h grace
  }).length;

  const totalPaid = ((paidRes.data as Array<{ amount: number }> | null) ?? []).reduce(
    (sum, r) => sum + Number(r.amount),
    0,
  );

  return {
    windowStart: start.toISOString(),
    windowEnd: now.toISOString(),
    completed: approved.length,
    reCleans: recleanRes.count ?? 0,
    onTimeRate: approved.length > 0 ? onTime / approved.length : null,
    totalPaid,
    upcomingUnassigned: upcomingRes.count ?? 0,
  };
}
