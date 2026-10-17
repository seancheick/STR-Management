import "server-only";
import {listCleanerFinancialSummaries} from "@/lib/queries/cleaner-finance";
import {cashPaidInRange} from "@/lib/services/cleaning-spending";
import {dateKeyInTimeZone} from "@/lib/ical/timezone";

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

  const [approvedRes, recleanRes, finances, upcomingRes] =
    await Promise.all([
      supabase
        .from("assignments")
        .select("id, due_at, completed_at, ledger_entry_id", { count: "exact" })
        .gte("due_at", start.toISOString())
        .lte("due_at", now.toISOString())
        .eq("status", "approved"),
      supabase
        .from("assignments")
        .select("id", { count: "exact", head: true })
        .gte("updated_at", start.toISOString())
        .eq("status", "needs_reclean"),
      listCleanerFinancialSummaries(),
      supabase
        .from("assignments")
        .select("id", { count: "exact", head: true })
        .eq("status", "unassigned")
        .gte("due_at", now.toISOString()),
    ]);

  const approved = (approvedRes.data as Array<{ due_at: string; completed_at: string|null; ledger_entry_id:string|null }> | null) ?? [];
  const timed=approved.filter(a=>!a.ledger_entry_id&&a.completed_at);
  const onTime = timed.filter((a) => {
    const due = new Date(a.due_at).getTime();
    const done = new Date(a.completed_at!).getTime();
    return done <= due + 2 * 60 * 60 * 1000; // within 2h grace
  }).length;

  const totalPaid=cashPaidInRange(finances,dateKeyInTimeZone(start),dateKeyInTimeZone(now));

  return {
    windowStart: start.toISOString(),
    windowEnd: now.toISOString(),
    completed: approved.length,
    reCleans: recleanRes.count ?? 0,
    onTimeRate: timed.length > 0 ? onTime / timed.length : null,
    totalPaid,
    upcomingUnassigned: upcomingRes.count ?? 0,
  };
}
