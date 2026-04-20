import { NextResponse } from "next/server";

import { createServiceSupabaseClient } from "@/lib/supabase/service";

/**
 * Public-by-token ICS feed of an owner's upcoming turnover assignments.
 * The token is the owner's auth.users.id — enough entropy for an unlisted
 * subscription URL. If a host wants to rotate it, they rotate their password
 * (and we can add a separate token column later for true rotation).
 *
 * Subscribe in Google Calendar: Settings → Add calendar → From URL.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const supabase = createServiceSupabaseClient();

  const { data: owner } = await supabase
    .from("users")
    .select("id, full_name, role, active")
    .eq("id", token)
    .in("role", ["owner", "admin"])
    .eq("active", true)
    .maybeSingle();

  if (!owner) {
    return new NextResponse("Feed not found", { status: 404 });
  }

  const { data: assignments } = await supabase
    .from("assignments")
    .select(
      "id, due_at, checkout_at, expected_duration_min, status, properties:property_id ( name, address_line_1, city ), cleaners:cleaner_id ( full_name )",
    )
    .eq("owner_id", owner.id)
    .not("status", "in", '("cancelled","approved")')
    .order("due_at", { ascending: true });

  const rows = (assignments as unknown as Array<{
    id: string;
    due_at: string;
    checkout_at: string | null;
    expected_duration_min: number | null;
    status: string;
    properties: { name: string; address_line_1: string | null; city: string | null } | null;
    cleaners: { full_name: string } | null;
  }> | null) ?? [];

  const now = new Date();
  const icsLines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//STR Manager//Owner feed//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:STR Cleanings — ${owner.full_name}`,
    "X-WR-TIMEZONE:UTC",
    `X-WR-CALDESC:Upcoming cleaning turnovers for ${owner.full_name}`,
  ];

  for (const a of rows) {
    const start = new Date(a.due_at);
    const durationMs = (a.expected_duration_min ?? 120) * 60_000;
    const end = new Date(start.getTime() + durationMs);
    const propertyName = a.properties?.name ?? "Turnover";
    const cleaner = a.cleaners?.full_name ?? "Unassigned";
    const location = [a.properties?.address_line_1, a.properties?.city]
      .filter(Boolean)
      .join(", ");

    icsLines.push(
      "BEGIN:VEVENT",
      `UID:str-${a.id}@str-manager`,
      `DTSTAMP:${formatIcsDate(now)}`,
      `DTSTART:${formatIcsDate(start)}`,
      `DTEND:${formatIcsDate(end)}`,
      `SUMMARY:${escapeIcs(propertyName)} — ${escapeIcs(cleaner)}`,
      `DESCRIPTION:${escapeIcs(`Status: ${a.status.replace(/_/g, " ")}`)}`,
      location ? `LOCATION:${escapeIcs(location)}` : "",
      "END:VEVENT",
    );
  }

  icsLines.push("END:VCALENDAR");

  const body = icsLines.filter(Boolean).join("\r\n");

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "public, max-age=600",
      "Content-Disposition": 'inline; filename="str-cleanings.ics"',
    },
  });
}

function formatIcsDate(d: Date): string {
  return d
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
}

function escapeIcs(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}
