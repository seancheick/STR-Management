import { NextRequest, NextResponse } from "next/server";

import { requireRole } from "@/lib/auth/session";
import { listAssignmentsForSchedule } from "@/lib/queries/assignments";
import { listReservationsForRange } from "@/lib/queries/calendar";
import { listProperties } from "@/lib/queries/properties";
import { calendarDate, calendarDayKey, calendarInstantKey, calendarListingId, calendarWindow, calendarWindowContains } from "@/lib/services/calendar-display";
import { dateKeyInTimeZone, formatInTimeZone } from "@/lib/ical/timezone";

/**
 * GET /api/schedule/export.csv?start=YYYY-MM-DD&end=YYYY-MM-DD[&property=<id>]
 *
 * Streams a CSV of every cleaning + every reservation overlapping the window,
 * ready for Excel / Google Sheets / QuickBooks.
 */
export async function GET(req: NextRequest) {
  await requireRole(["owner", "admin", "supervisor"]);

  const url = new URL(req.url);
  const startParam = url.searchParams.get("start");
  const endParam = url.searchParams.get("end");
  const propertyFilter = url.searchParams.get("property");

  const defaultStart = calendarDate(dateKeyInTimeZone(new Date()));
  defaultStart.setDate(defaultStart.getDate() - 1);
  const defaultEnd = new Date(defaultStart);
  defaultEnd.setDate(defaultStart.getDate() + 13);
  const window = calendarWindow(startParam ?? calendarDayKey(defaultStart), endParam ?? calendarDayKey(defaultEnd));
  if (!window) {
    return NextResponse.json({ error: "Use valid YYYY-MM-DD dates with start on or before end." }, { status: 400 });
  }

  const [propertiesResult, assignments, reservations] = await Promise.all([
    listProperties(),
    listAssignmentsForSchedule(window.queryStart, window.queryEnd),
    listReservationsForRange(window.queryStart, window.queryEnd),
  ]);

  const propById = new Map(propertiesResult.data.map((p) => [p.id, p]));
  const activeUnitIds = new Set(propertiesResult.data.filter((p) => p.active).map((p) => p.id));
  const matchesProperty = (id: string) => activeUnitIds.has(id) && (!propertyFilter || id === propertyFilter);
  const filteredAssignments = assignments.filter((a) => matchesProperty(calendarListingId(a)) &&
    calendarWindowContains(a.checkout_at ?? a.due_at, window.start, window.end, propById.get(calendarListingId(a))?.timezone),
  );
  const filteredReservations = reservations.filter((r) => {
    if (!matchesProperty(calendarListingId(r))) return false;
    const timezone = propById.get(calendarListingId(r))?.timezone;
    return calendarInstantKey(r.start_at, timezone) <= window.end && calendarInstantKey(r.end_at, timezone) >= window.start;
  });

  // One row per booking + one row per cleaning so the CSV can be used for
  // quick book-keeping AND schedule review.
  const rows: string[][] = [
    [
      "Type",
      "Property",
      "Address",
      "Date",
      "Time",
      "Platform / Source",
      "Guest / Cleaner",
      "Status",
      "Payout",
      "Paid",
      "Paid method",
      "Paid reference",
      "Nights / Duration",
      "Notes",
    ],
  ];

  for (const res of filteredReservations) {
    const p = propById.get(calendarListingId(res));
    const nights = Math.max(
      1,
      Math.round(
        (Date.parse(calendarInstantKey(res.end_at, p?.timezone)) - Date.parse(calendarInstantKey(res.start_at, p?.timezone))) / 86400000,
      ),
    );
    rows.push([
      "Booking",
      p?.name ?? "",
      p?.address_line_1 ?? "",
      formatInTimeZone(res.start_at, { year: "numeric", month: "numeric", day: "numeric" }, p?.timezone),
      formatInTimeZone(res.start_at, { hour: "numeric", minute: "2-digit" }, p?.timezone),
      res.platform,
      res.guest_name ?? "",
      "reserved",
      "",
      "",
      "",
      "",
      `${nights} night${nights === 1 ? "" : "s"}`,
      res.summary ?? "",
    ]);
  }

  for (const a of filteredAssignments) {
    const p = propById.get(calendarListingId(a));
    const anchor = a.checkout_at ?? a.due_at;
    rows.push([
      "Cleaning",
      p?.name ?? "",
      p?.address_line_1 ?? "",
      formatInTimeZone(anchor, { year: "numeric", month: "numeric", day: "numeric" }, p?.timezone),
      formatInTimeZone(anchor, { hour: "numeric", minute: "2-digit" }, p?.timezone),
      a.source_type ?? "manual",
      a.cleaners?.full_name ?? "Unassigned",
      a.status,
      a.fixed_payout_amount != null ? `$${Number(a.fixed_payout_amount).toFixed(2)}` : "",
      a.paid_at ? formatInTimeZone(a.paid_at, { year: "numeric", month: "numeric", day: "numeric" }, p?.timezone) : "",
      a.payment_method ?? "",
      a.payment_reference ?? "",
      a.expected_duration_min ? `${a.expected_duration_min} min` : "",
      "",
    ]);
  }

  const csv = rows
    .map((r) =>
      r
        .map((cell) => {
          const value = /^[\s]*[=+@-]/.test(cell) ? `'${cell}` : cell;
          const needsQuote = /[",\r\n]/.test(value);
          const safe = value.replace(/"/g, '""');
          return needsQuote ? `"${safe}"` : safe;
        })
        .join(","),
    )
    .join("\n");

  const filename = `schedule-${window.start}-to-${window.end}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
