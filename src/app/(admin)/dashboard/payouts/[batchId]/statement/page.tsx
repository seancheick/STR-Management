import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/session";
import {
  getPayoutBatch,
  listPayoutEntries,
  groupEntriesByClean,
} from "@/lib/queries/payouts";

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
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

  return (
    <div className="mx-auto max-w-3xl px-8 py-10 font-sans text-sm text-gray-800 print:px-0 print:py-0">
      {/* Print button — hidden in print */}
      <div className="mb-6 flex justify-end print:hidden">
        <button
          onClick={() => window.print()}
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm hover:bg-gray-50"
        >
          Print / Save PDF
        </button>
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
            {batch.status}
          </span>
        </p>
        {batch.paid_at && (
          <p className="text-gray-500">
            Paid on:{" "}
            <span className="font-medium text-gray-700">
              {formatDate(batch.paid_at)}
            </span>
          </p>
        )}
      </header>

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
                      ? new Date(e.assignments.due_at).toLocaleDateString(
                          "en-US",
                          { month: "short", day: "numeric" },
                        )
                      : "—"}
                  </td>
                  <td className="py-2 pr-4">{e.properties?.name ?? "—"}</td>
                  <td className="py-2 pr-4 capitalize text-gray-600">
                    {e.assignments?.assignment_type?.replace(/_/g, " ") ??
                      "—"}
                  </td>
                  <td className="py-2 text-right font-medium">
                    ${Number(e.amount).toFixed(2)}
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
          <span>Total Payout</span>
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
