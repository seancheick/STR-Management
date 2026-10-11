import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { getScheduleRange } from "@/lib/queries/schedule";
import { calendarWindow } from "@/lib/services/calendar-display";

export async function GET(req: NextRequest) {
  await requireRole(["owner", "admin", "supervisor"]);
  const params = req.nextUrl.searchParams;
  const window = calendarWindow(params.get("start") ?? "", params.get("end") ?? "");
  if (!window || Date.parse(window.end) - Date.parse(window.start) > 366 * 86400000) {
    return NextResponse.json({ error: "Use a valid date range of at most one year." }, { status: 400 });
  }
  const { assignments, reservations } = await getScheduleRange({ start: window.start, end: window.end, property: params.get("property"), cleaner: params.get("cleaner") });
  return NextResponse.json({ assignments, reservations }, { headers: { "Cache-Control": "no-store" } });
}
