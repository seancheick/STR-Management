import { NextRequest, NextResponse } from "next/server";

import { requireRole } from "@/lib/auth/session";
import { listAssignmentsForSchedule } from "@/lib/queries/assignments";
import { listReservationsForRange } from "@/lib/queries/calendar";
import { listProperties } from "@/lib/queries/properties";

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

  const now = new Date();
  const defaultStart = new Date(now);
  defaultStart.setDate(now.getDate() - 1);
  defaultStart.setHours(0, 0, 0, 0);
  const defaultEnd = new Date(defaultStart);
  defaultEnd.setDate(defaultStart.getDate() + 14);
  defaultEnd.setHours(23, 59, 59, 999);

  const start = startParam ? new Date(startParam) : defaultStart;
  const end = endParam ? new Date(endParam) : defaultEnd;

  const [propertiesResult, assignments, reservations] = await Promise.all([
    listProperties(),
    listAssignmentsForSchedule(start.toISOString(), end.toISOString()),
    listReservationsForRange(start.toISOString(), end.toISOString()),
  ]);

  const propById = new Map(propertiesResult.data.map((p) => [p.id, p]));

  const filteredAssignments = propertyFilter
    ? assignments.filter((a) => a.property_id === propertyFilter)
    : assignments;
  const filteredReservations = propertyFilter
    ? reservations.filter((r) => r.property_id === propertyFilter)
    : reservations;

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
    const p = propById.get(res.property_id);
    const nights = Math.max(
      1,
      Math.round(
        (new Date(res.end_at).getTime() - new Date(res.start_at).getTime()) / 86400000,
      ),
    );
    rows.push([
      "Booking",
      p?.name ?? "",
      p?.address_line_1 ?? "",
      new Date(res.start_at).toLocaleDateString("en-US"),
      new Date(res.start_at).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      }),
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
    const p = propById.get(a.property_id);
    const anchor = a.checkout_at ?? a.due_at;
    rows.push([
      "Cleaning",
      p?.name ?? "",
      p?.address_line_1 ?? "",
      new Date(anchor).toLocaleDateString("en-US"),
      new Date(anchor).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      }),
      a.source_type ?? "manual",
      a.cleaners?.full_name ?? "Unassigned",
      a.status,
      a.fixed_payout_amount != null ? `$${Number(a.fixed_payout_amount).toFixed(2)}` : "",
      a.paid_at ? new Date(a.paid_at).toLocaleDateString("en-US") : "",
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
          const needsQuote = /[",\n]/.test(cell);
          const safe = cell.replace(/"/g, '""');
          return needsQuote ? `"${safe}"` : safe;
        })
        .join(","),
    )
    .join("\n");

  const filename = `schedule-${start.toISOString().slice(0, 10)}-to-${end.toISOString().slice(0, 10)}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
