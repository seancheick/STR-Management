import { listCleanerFinancialSummaries } from "@/lib/queries/cleaner-finance";
import { isHistoricalPayoutReport } from "@/lib/services/cleaner-ledger";
import { notFound } from "next/navigation";

import { PrintButton } from "@/components/payouts/print-button";
import { requireRole } from "@/lib/auth/session";
import {
  getPayoutBatch,
  listPayoutEntries,
  groupEntriesByClean,
} from "@/lib/queries/payouts";
import { formatInTimeZone } from "@/lib/ical/timezone";

function formatDate(d: string) {
  return formatInTimeZone(d, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default async function StatementPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  await requireRole(["owner", "admin", "supervisor"]);

  const [batch, entries] = await Promise.all([
    getPayoutBatch(batchId),
    listPayoutEntries(batchId),
  ]);

  if (!batch) notFound();

  const statements = groupEntriesByClean(entries);
  const finances = await listCleanerFinancialSummaries([...new Set([...entries.map((entry) => entry.cleaner_id), ...(batch.cleaner_filter ? [batch.cleaner_filter] : [])])]);
  const historical = isHistoricalPayoutReport(batch, finances.flatMap((item) => item.ledger ? [item.ledger.account] : []));

  return (
    <div className="mx-auto max-w-3xl px-8 py-10 font-sans text-sm text-gray-800 print:px-0 print:py-0">
      {/* Print button — hidden in print */}
      <div className="mb-6 flex justify-end print:hidden">
        <PrintButton />
      </div>

      {/* Statement header */}
      <header className="mb-8 border-b border-gray-200 pb-6">
        <h1 className="text-2xl font-bold text-gray-900">{batch.label}</h1>
        <p className="mt-1 text-gray-500">
          Period: {formatDate(batch.period_start)} –{" "}
          {formatDate(batch.period_end)}
        </p>
        <p className="text-gray-500">
          Status:{" "}
          <span className="font-medium capitalize text-gray-700">
            {historical ? "Archived report" : batch.status}
          </span>
        </p>
        {batch.paid_at && (
          <p className="text-gray-500">
            Report marked paid on:{" "}
            <span className="font-medium text-gray-700">
              {formatDate(batch.paid_at)}
            </span>
          </p>
        )}
      </header>

      <p className="mb-6 text-xs text-gray-500">{historical ? "Historical reference only. Reconciled cleaner ledgers replace this report’s old amounts and paid labels. " : ""}Report amounts describe job pay in this period; current account balances include all recorded charges and payments.</p>
      {/* Per-cleaner sections */}
      {statements.map((stmt) => (
        <section
          key={stmt.cleaner_id}
          className="mb-10 break-inside-avoid"
        >
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-900">
              {stmt.cleaner_name}
            </h2>
            <span className="font-semibold text-gray-900">
              ${stmt.subtotal.toFixed(2)}
            </span>
          </div>
          <p className="mb-3 text-xs text-gray-500">Current account balance (today): ${Number(finances.find((item) => item.cleanerId === stmt.cleaner_id)?.balance ?? 0).toFixed(2)}</p>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2 pr-4">Date</th>
                <th className="py-2 pr-4">Property</th>
                <th className="py-2 pr-4">Type</th>
                <th className="py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {stmt.entries.map((e) => (
                <tr
                  key={e.id}
                  className="border-b border-gray-100 last:border-0"
                >
                  <td className="py-2 pr-4 text-gray-600">
                    {e.assignments?.due_at
                      ? formatInTimeZone(e.assignments.due_at, { month: "short", day: "numeric" })
                      : "—"}
                  </td>
                  <td className="py-2 pr-4">{e.properties?.name ?? "—"}</td>
                  <td className="py-2 pr-4 capitalize text-gray-600">
                    {e.assignments?.assignment_type?.replace(/_/g, " ") ??
                      "—"}
                  </td>
                  <td className="py-2 text-right font-medium">
                    ${Number(e.amount).toFixed(2)}
                    {(e.assignments?.assignment_extras ?? []).map((extra) => <div key={extra.id} className="mt-1 text-xs font-normal text-gray-500">{extra.description} ({extra.kind === "reimbursement" ? "reimbursement" : "extra service"}): ${Number(extra.amount).toFixed(2)} included</div>)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td
                  colSpan={3}
                  className="py-2 pr-4 text-right font-semibold text-gray-700"
                >
                  Subtotal
                </td>
                <td className="py-2 text-right font-semibold text-gray-900">
                  ${stmt.subtotal.toFixed(2)}
                </td>
              </tr>
            </tfoot>
          </table>
        </section>
      ))}

      {/* Totals footer */}
      <div className="border-t-2 border-gray-900 pt-4">
        <div className="flex justify-between text-base font-bold text-gray-900">
          <span>{historical ? "Archived report job pay" : "Report job pay"}</span>
          <span>${Number(batch.total_amount).toFixed(2)}</span>
        </div>
        <p className="mt-1 text-xs text-gray-400">
          {batch.entry_count} job{batch.entry_count !== 1 ? "s" : ""} ·{" "}
          {statements.length} cleaner{statements.length !== 1 ? "s" : ""}
        </p>
      </div>
    </div>
  );
}
