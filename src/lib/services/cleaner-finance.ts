import { dateKeyInTimeZone } from "@/lib/ical/timezone";
import { summarizeLedger, type LedgerEntry } from "./cleaner-ledger";

export type FinanceEntry = {
  id: string; assignment_id: string; amount: number; status: string; paid_at: string | null;
  assignments?: { due_at: string; paid_at?: string | null } | null;
  properties?: { timezone?: string | null } | null;
  payout_batches?: { status: string; paid_at?: string | null } | null;
};
export type FinanceJob = {
  id: string; due_at: string; fixed_payout_amount: number | null; paid_at?: string | null;
  properties?: { timezone?: string | null } | null;
};

/** Ledger owns history; committed reports own their jobs; other jobs retain their fixed amount. */
export function calculateCleanerFinancialSummary<E extends FinanceEntry, J extends FinanceJob>(input: {
  reconciledThrough: string | null; ledgerEntries: LedgerEntry[]; entries: E[]; jobs: J[];
}) {
  const afterCutoff = (dueAt: string, timezone?: string | null) => !input.reconciledThrough ||
    dateKeyInTimeZone(new Date(dueAt), timezone) > input.reconciledThrough;
  const effectivePaidAt = (entry: E) => entry.paid_at ?? entry.assignments?.paid_at ??
    (entry.payout_batches?.status === "paid" ? entry.payout_batches.paid_at : null) ?? null;
  const uniqueEntries = new Map<string, E>();
  for (const entry of input.entries) {
    if (entry.status !== "included" || (entry.payout_batches && !["approved", "paid"].includes(entry.payout_batches.status))) continue;
    if (!entry.assignments || !afterCutoff(entry.assignments.due_at, entry.properties?.timezone)) continue;
    // Defensive against legacy duplicate reports. A stamped payment is definitive.
    const previous = uniqueEntries.get(entry.assignment_id);
    if (!previous || effectivePaidAt(entry)) uniqueEntries.set(entry.assignment_id, entry);
  }
  const entries = [...uniqueEntries.values()].map((entry) => ({ ...entry, paid_at: effectivePaidAt(entry) }));
  const jobs = [...new Map(input.jobs.map((job) => [job.id, job])).values()].filter((job) =>
    !uniqueEntries.has(job.id) && afterCutoff(job.due_at, job.properties?.timezone));
  const cents = (value: number | null) => Math.round(Number(value ?? 0) * 100);
  const inReportsCents = entries.reduce((sum, entry) => sum + cents(entry.amount), 0);
  const paidCents = entries.filter((entry) => entry.paid_at).reduce((sum, entry) => sum + cents(entry.amount), 0) + jobs.filter((job) => job.paid_at).reduce((sum, job) => sum + cents(job.fixed_payout_amount), 0);
  const awaitingCents = jobs.filter((job) => !job.paid_at).reduce((sum, job) => sum + cents(job.fixed_payout_amount), 0);
  const projectedCents = inReportsCents + jobs.reduce((sum, job) => sum + cents(job.fixed_payout_amount), 0);
  const ledgerBalance = summarizeLedger(input.ledgerEntries).balance;
  return {
    balance: (Math.round(ledgerBalance * 100) + projectedCents - paidCents) / 100,
    ledgerBalance, entries, jobsOutsideReports: jobs,
    unpaidEntries: entries.filter((entry) => !entry.paid_at).length,
    orphanAssignments: jobs.filter((job) => !job.paid_at).length,
    summary: { inReportsTotal: inReportsCents / 100, paidTotal: paidCents / 100, awaitingTotal: awaitingCents / 100, projectedTotal: projectedCents / 100 },
  };
}
