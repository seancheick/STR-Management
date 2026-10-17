import { reportCsvCell } from "@/lib/services/payout-report-csv";
import { dateKeyInTimeZone } from "@/lib/ical/timezone";
import { listCleanerFinancialSummaries } from "@/lib/queries/cleaner-finance";
import { isHistoricalPayoutReport } from "@/lib/services/cleaner-ledger";
import { NextResponse } from "next/server";
import { csvDownloadDisposition } from "@/lib/services/csv-download";

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

  const finances = await listCleanerFinancialSummaries([...new Set([...entries.map((entry) => entry.cleaner_id), ...(batch.cleaner_filter ? [batch.cleaner_filter] : [])])]);
  const historical = isHistoricalPayoutReport(batch, finances.flatMap((item) => item.ledger ? [item.ledger.account] : []));
  const rows: string[] = [
    ["Report", "Report status", "Cleaner", "Property", "Job date", "Type", "Report job pay", "Entry status", "Payment label", "Included extras", "Notes"].map(reportCsvCell).join(","),
  ];
  for (const e of entries) {
    rows.push([
      batch.label, historical ? "Archived reference - reconciled ledger replaces old amounts and paid labels" : batch.status,
      e.cleaners?.full_name ?? "", e.properties?.name ?? "",
      e.assignments?.due_at ? dateKeyInTimeZone(new Date(e.assignments.due_at), e.properties?.timezone) : "",
      e.assignments?.assignment_type ?? "", Number(e.amount), e.status,
      e.paid_at || e.assignments?.paid_at || (batch.status === "paid" ? batch.paid_at : null) ? "Marked paid" : "Not marked paid",
      (e.assignments?.assignment_extras ?? []).map((extra) => `${extra.description} (${extra.kind}): $${Number(extra.amount).toFixed(2)}`).join("; "),
      e.notes ?? "",
    ].map(reportCsvCell).join(","));
  }

  const csv = rows.join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": csvDownloadDisposition(batch.label),
    },
  });
}
