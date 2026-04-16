import { notFound } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";

import { requireRole } from "@/lib/auth/session";
import {
  getPayoutBatch,
  listPayoutEntries,
  groupEntriesByClean,
} from "@/lib/queries/payouts";
import { BatchActionButtons } from "@/components/payouts/batch-action-buttons";

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const statusColors: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  approved: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

const entryStatusColors: Record<string, string> = {
  included: "bg-green-50 text-green-700",
  excluded: "bg-slate-100 text-slate-500",
  disputed: "bg-amber-50 text-amber-700",
};

export default async function PayoutBatchDetailPage({
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
  const isDraft = batch.status === "draft";
  const canApprove = batch.status === "draft";
  const canPay = batch.status === "approved";
  const canCancel = batch.status === "draft" || batch.status === "approved";

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-10">
      {/* Header */}
      <div>
        <Link
          href={"/dashboard/payouts" as Route}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← Payout Batches
        </Link>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              {batch.label}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {formatDate(batch.period_start)} → {formatDate(batch.period_end)}
              {batch.cleaner_filter_user
                ? ` · ${batch.cleaner_filter_user.full_name}`
                : " · All cleaners"}
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${statusColors[batch.status]}`}
          >
            {batch.status}
          </span>
        </div>
      </div>

      {/* KPI row */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-border/70 bg-card p-5">
          <p className="text-sm text-muted-foreground">Total payout</p>
          <p className="mt-3 text-3xl font-semibold">
            ${Number(batch.total_amount).toFixed(2)}
          </p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-card p-5">
          <p className="text-sm text-muted-foreground">Jobs included</p>
          <p className="mt-3 text-3xl font-semibold">{batch.entry_count}</p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-card p-5">
          <p className="text-sm text-muted-foreground">Cleaners</p>
          <p className="mt-3 text-3xl font-semibold">{statements.length}</p>
        </div>
      </section>

      {/* Status timeline */}
      {(batch.approved_at || batch.paid_at) && (
        <section className="flex flex-wrap gap-4 text-sm text-muted-foreground">
          {batch.approved_at && (
            <span>Approved {formatDateTime(batch.approved_at)}</span>
          )}
          {batch.paid_at && (
            <span>Paid {formatDateTime(batch.paid_at)}</span>
          )}
        </section>
      )}

      {/* Actions */}
      {(canApprove || canPay || canCancel) && (
        <BatchActionButtons
          batchId={batchId}
          canApprove={canApprove}
          canPay={canPay}
          canCancel={canCancel}
        />
      )}

      {/* Export link */}
      <div className="flex gap-3">
        <Link
          href={`/dashboard/payouts/${batchId}/export.csv` as Route}
          className="rounded-lg border border-border/70 bg-card px-4 py-2 text-sm hover:border-primary/30"
        >
          Export CSV
        </Link>
        <Link
          href={`/dashboard/payouts/${batchId}/statement` as Route}
          className="rounded-lg border border-border/70 bg-card px-4 py-2 text-sm hover:border-primary/30"
          target="_blank"
        >
          Print statement
        </Link>
      </div>

      {/* Entries by cleaner */}
      {statements.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No entries in this batch.
          {isDraft ? " Generate again or add assignments manually." : ""}
        </p>
      ) : (
        statements.map((stmt) => (
          <section key={stmt.cleaner_id} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">{stmt.cleaner_name}</h2>
              <p className="text-sm font-semibold text-foreground">
                ${stmt.subtotal.toFixed(2)}
              </p>
            </div>
            <div className="overflow-hidden rounded-2xl border border-border/70">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/70 bg-muted/40">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Property
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Type
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                      Amount
                    </th>
                    <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {stmt.entries.map((e) => (
                    <tr
                      key={e.id}
                      className="border-b border-border/70 last:border-0"
                    >
                      <td className="px-4 py-3">
                        {e.properties?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {e.assignments?.due_at
                          ? formatDate(e.assignments.due_at)
                          : "—"}
                      </td>
                      <td className="px-4 py-3 capitalize text-muted-foreground">
                        {e.assignments?.assignment_type?.replace(/_/g, " ") ??
                          "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        ${Number(e.amount).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${entryStatusColors[e.status]}`}
                        >
                          {e.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </main>
  );
}
