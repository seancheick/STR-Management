import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";

import { isAuthorizedCronRequest } from "@/lib/auth/cron";
import { listCalendarSourcesForSync } from "@/lib/queries/calendar";
import { syncCalendarSource } from "@/lib/ical/sync-service";

export const maxDuration = 300;

/**
 * Vercel Cron endpoint: GET /api/cron/sync-calendars
 * Configured in vercel.json to run on a schedule.
 * Protected by CRON_SECRET header (set in Vercel env vars).
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let sources: Awaited<ReturnType<typeof listCalendarSourcesForSync>>;
  try {
    sources = await listCalendarSourcesForSync();
  } catch {
    return NextResponse.json({ error: "Could not load calendar sources." }, { status: 503 });
  }

  const results = [];
  // Alternate bedroom listings share a physical unit. Finish each feed before
  // the next reads its jobs, just as the owner's Sync all action does.
  for (const source of sources) {
    const identity = { sourceId: source.id, propertyId: source.property_id };
    try {
      const result = await syncCalendarSource({
        calendarSourceId: source.id,
        ownerId: source.owner_id,
        propertyId: source.property_id,
        primaryChecklistTemplateId: source.primary_checklist_template_id,
      });
      results.push({ ...identity, ok: !result.error,
        ...(result.error ? { error: "Calendar sync failed. Check sync history." } : {}),
        created: result.assignmentsCreated, skipped: result.assignmentsSkipped,
        rescheduled: result.assignmentsRescheduled, cancelled: result.assignmentsCancelled,
        conflicts: result.conflictCount,
      });
    } catch {
      // Provider exceptions can contain private calendar URLs.
      results.push({ ...identity, ok: false, error: "Calendar sync failed. Check sync history." });
    }
  }
  for (const path of ["/dashboard", "/dashboard/schedule", "/dashboard/calendar", "/dashboard/assignments"]) {
    revalidatePath(path);
  }
  const synced = results.filter(result => result.ok).length;
  return NextResponse.json({ attempted: sources.length, synced, failed: sources.length - synced, results },
    { status: synced === sources.length ? 200 : 502 });
}
