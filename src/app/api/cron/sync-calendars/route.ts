import { NextRequest, NextResponse } from "next/server";

import { listCalendarSourcesForSync } from "@/lib/queries/calendar";
import { syncCalendarSource } from "@/lib/ical/sync-service";

/**
 * Vercel Cron endpoint: GET /api/cron/sync-calendars
 * Configured in vercel.json to run on a schedule.
 * Protected by CRON_SECRET header (set in Vercel env vars).
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  // In production, Vercel sends the secret automatically.
  // Skip check in dev (no secret set).
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sources = await listCalendarSourcesForSync();

  if (sources.length === 0) {
    return NextResponse.json({ synced: 0, message: "No active calendar sources." });
  }

  const results = await Promise.allSettled(
    sources.map((source) =>
      syncCalendarSource({
        calendarSourceId: source.id,
        ownerId: source.owner_id,
        propertyId: source.property_id,
        primaryChecklistTemplateId: source.primary_checklist_template_id,
      }),
    ),
  );

  const summary = results.map((r, i) => ({
    sourceId: sources[i].id,
    propertyId: sources[i].property_id,
    ...(r.status === "fulfilled"
      ? {
          ok: true,
          created: r.value.assignmentsCreated,
          skipped: r.value.assignmentsSkipped,
          conflicts: r.value.conflictCount,
        }
      : { ok: false, error: String(r.reason) }),
  }));

  return NextResponse.json({ synced: sources.length, results: summary });
}
