import { NextRequest, NextResponse } from "next/server";

import { sendNotification } from "@/lib/notifications/notification-service";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

/**
 * Vercel Cron: GET /api/cron/weekly-digest
 *
 * Runs Monday 7 AM ET. Builds a one-paragraph summary of the week ahead
 * for every active owner / admin and delivers it via the existing
 * sendNotification pipeline (in-app row + web-push to every subscribed
 * device). No email provider needed.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const supabase = createServiceSupabaseClient();

  // Active owners/admins are the recipients
  const { data: hosts } = await supabase
    .from("users")
    .select("id, full_name")
    .in("role", ["owner", "admin"])
    .eq("active", true);

  if (!hosts?.length) {
    return NextResponse.json({ sent: 0, message: "No active hosts." });
  }

  // Compute the week window (today through +7 days)
  const now = new Date();
  const end = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  // Aggregate stats per host. Querying per-host lets RLS-free service
  // role filter by owner_id so one host never sees another's data.
  const results = await Promise.allSettled(
    hosts.map(async (h) => {
      const [assignmentsRes, unpaidRes] = await Promise.all([
        supabase
          .from("assignments")
          .select("id, status, cleaner_id, checkout_at, due_at")
          .eq("owner_id", h.id as string)
          .gte("due_at", now.toISOString())
          .lte("due_at", end.toISOString())
          .not("status", "in", '("cancelled")'),
        supabase
          .from("assignments")
          .select("fixed_payout_amount")
          .eq("owner_id", h.id as string)
          .in("status", ["approved", "completed", "completed_pending_review"])
          .is("paid_at", null)
          .not("fixed_payout_amount", "is", null),
      ]);

      const jobs =
        (assignmentsRes.data as Array<{
          status: string;
          cleaner_id: string | null;
        }> | null) ?? [];
      const upcoming = jobs.length;
      const unassigned = jobs.filter((j) => !j.cleaner_id).length;
      const unpaidRows =
        (unpaidRes.data as Array<{ fixed_payout_amount: number | null }> | null) ?? [];
      const unpaidTotal = unpaidRows.reduce(
        (s, r) => s + Number(r.fixed_payout_amount ?? 0),
        0,
      );

      // Skip hosts with nothing to say
      if (upcoming === 0 && unassigned === 0 && unpaidTotal === 0) {
        return { hostId: h.id, skipped: true };
      }

      const body = [
        `${upcoming} cleaning${upcoming === 1 ? "" : "s"} scheduled this week`,
        unassigned > 0 ? `${unassigned} still unassigned` : null,
        unpaidTotal > 0 ? `$${unpaidTotal.toFixed(2)} awaiting payout` : null,
      ]
        .filter(Boolean)
        .join(" · ");

      await sendNotification({
        ownerId: h.id as string,
        recipientId: h.id as string,
        assignmentId: null,
        type: "reminder_24h",
        title: "Week ahead — TurnFlow",
        body,
        url: "/dashboard",
      });

      return { hostId: h.id, delivered: true };
    }),
  );

  const summary = results.reduce(
    (acc, r) => {
      if (r.status === "fulfilled") {
        if ("delivered" in r.value) acc.sent++;
        else if ("skipped" in r.value) acc.skipped++;
      } else {
        acc.errors++;
      }
      return acc;
    },
    { sent: 0, skipped: 0, errors: 0 },
  );

  return NextResponse.json(summary);
}
