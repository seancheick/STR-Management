import type { CleanerPayment } from "@/lib/domain/payments";
import { dateKeyInTimeZone } from "@/lib/ical/timezone";
import { summarizeLedger, type LedgerEntry } from "./cleaner-ledger";

export type FinanceEntry = {
  id: string; assignment_id: string; amount: number; status: string; paid_at: string | null;
  assignments?: { due_at: string; paid_at?: string | null; assignment_extras?: {id:string;description:string;amount:number}[] } | null;
  properties?: { name?:string; timezone?: string | null } | null;
  payout_batches?: { status: string; paid_at?: string | null } | null;
};
export type FinanceJob = {
  assignment_extras?: {id:string;description:string;amount:number}[];
  id: string; due_at: string; fixed_payout_amount: number | null; paid_at?: string | null;
  properties?: { name?:string; timezone?: string | null } | null;
};

/** Ledger owns history; committed reports own their jobs; other jobs retain their fixed amount. */
export function calculateCleanerFinancialSummary<E extends FinanceEntry, J extends FinanceJob>(input: {
  reconciledThrough: string | null; ledgerEntries: LedgerEntry[]; entries: E[]; jobs: J[]; payments?: CleanerPayment[];
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
  const payments = (input.payments ?? []).filter(payment => !payment.voided_at);
  const paidJobIds = new Set(payments.flatMap(payment=>payment.assignment_id ? [payment.assignment_id] : []));
  const legacyPaidCents = entries.filter(entry=>entry.paid_at && !paidJobIds.has(entry.assignment_id)).reduce((sum,entry)=>sum+cents(entry.amount),0)
    + jobs.filter(job=>job.paid_at && !paidJobIds.has(job.id)).reduce((sum,job)=>sum+cents(job.fixed_payout_amount),0);
  const recordedPaymentsCents = payments.reduce((sum,payment)=>sum+cents(payment.amount),0);
  const paidCents = legacyPaidCents + recordedPaymentsCents;
  const awaitingCents = jobs.filter((job) => !job.paid_at).reduce((sum, job) => sum + cents(job.fixed_payout_amount), 0);
  const projectedCents = inReportsCents + jobs.reduce((sum, job) => sum + cents(job.fixed_payout_amount), 0);
  const ledgerBalance = summarizeLedger(input.ledgerEntries).balance;
  const statementEntries: LedgerEntry[] = [...input.ledgerEntries];
  function addCharge(id:string,amount:number,date:string,name:string,extras:{id:string;description:string;amount:number}[]=[]) {
    const extraCents=extras.reduce((sum,extra)=>sum+cents(extra.amount),0);
    if (extraCents <= cents(amount)) {
      statementEntries.push({id:`job:${id}`,entry_date:date,sequence:1000000,kind:"cleaning",description:name,amount:(cents(amount)-extraCents)/100});
      extras.forEach((extra,index)=>statementEntries.push({id:`extra:${extra.id}`,entry_date:date,sequence:1000001+index,kind:"adjustment",description:`${extra.description} · ${name}`,amount:Number(extra.amount)}));
    } else statementEntries.push({id:`job:${id}`,entry_date:date,sequence:1000000,kind:"cleaning",description:`${name} · report amount`,amount:Number(amount)});
  }
  for (const entry of entries) {
    const date=dateKeyInTimeZone(new Date(entry.assignments!.due_at),entry.properties?.timezone);
    addCharge(entry.assignment_id,Number(entry.amount),date,entry.properties?.name ?? "Cleaning",entry.assignments?.assignment_extras);
    if (entry.paid_at && !paidJobIds.has(entry.assignment_id)) statementEntries.push({id:`legacy-payment:${entry.assignment_id}`,entry_date:dateKeyInTimeZone(new Date(entry.paid_at),entry.properties?.timezone),sequence:2000000,kind:"payment",description:`Payment · ${entry.properties?.name ?? "Cleaning"}`,amount:-Number(entry.amount)});
  }
  for (const job of jobs) {
    addCharge(job.id,Number(job.fixed_payout_amount ?? 0),dateKeyInTimeZone(new Date(job.due_at),job.properties?.timezone),job.properties?.name ?? "Cleaning",job.assignment_extras);
    if (job.paid_at && !paidJobIds.has(job.id)) statementEntries.push({id:`legacy-payment:${job.id}`,entry_date:dateKeyInTimeZone(new Date(job.paid_at),job.properties?.timezone),sequence:2000000,kind:"payment",description:`Payment · ${job.properties?.name ?? "Cleaning"}`,amount:-Number(job.fixed_payout_amount ?? 0)});
  }
  payments.forEach(payment=>statementEntries.push({id:`payment:${payment.id}`,entry_date:payment.payment_date,sequence:2000001,kind:"payment",description:`Payment received · ${payment.method.replace(/_/g," ")}${payment.reference ? ` · ${payment.reference}` : ""}${payment.note ? ` · ${payment.note}` : ""}`,amount:-Number(payment.amount)}));

  return {
    balance: (Math.round(ledgerBalance * 100) + projectedCents - paidCents) / 100,
    ledgerBalance, entries, jobsOutsideReports: jobs, statementEntries, payments: input.payments ?? [],
    recordedPaymentsTotal: recordedPaymentsCents/100, legacyPaidTotal: legacyPaidCents/100,
    unpaidEntries: entries.filter((entry) => !entry.paid_at).length,
    orphanAssignments: jobs.filter((job) => !job.paid_at).length,
    summary: { inReportsTotal: inReportsCents / 100, paidTotal: paidCents / 100, awaitingTotal: awaitingCents / 100, projectedTotal: projectedCents / 100 },
  };
}
