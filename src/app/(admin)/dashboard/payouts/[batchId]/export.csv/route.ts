import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth/session";
import { getPayoutBatch, listPayoutEntries } from "@/lib/queries/payouts";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ batchId: string }> },
) {
  const { batchId } = await params;
  await requireRole(["owner", "admin", "supervisor"]);

  const [batch, entries] = await Promise.all([
    getPayoutBatch(batchId),
    listPayoutEntries(batchId),
  ]);

  if (!batch) {
    return new NextResponse("Batch not found", { status: 404 });
  }

  const rows: string[] = [
    [
      "Cleaner",
      "Property",
      "Date",
      "Type",
      "Amount",
      "Status",
      "Notes",
    ].join(","),
  ];

  for (const e of entries) {
    const cleanerName = e.cleaners?.full_name ?? "";
    const propertyName = e.properties?.name ?? "";
    const date = e.assignments?.due_at
      ? new Date(e.assignments.due_at).toISOString().slice(0, 10)
      : "";
    const type = e.assignments?.assignment_type ?? "";
    const amount = Number(e.amount).toFixed(2);
    const status = e.status;
    const notes = (e.notes ?? "").replace(/"/g, '""');

    rows.push(
      [
        `"${cleanerName}"`,
        `"${propertyName}"`,
        date,
        type,
        amount,
        status,
        `"${notes}"`,
      ].join(","),
    );
  }

  const csv = rows.join("\n");
  const filename = `payout-${batch.label.replace(/\s+/g, "-").toLowerCase()}.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
