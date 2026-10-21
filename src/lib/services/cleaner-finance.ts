import type { CleanerPayment } from "@/lib/domain/payments";
import { dateKeyInTimeZone } from "@/lib/ical/timezone";
import { summarizeLedger, type LedgerEntry } from "./cleaner-ledger";

export type FinanceEntry = {
  id: string; assignment_id: string; amount: number; status: string; paid_at: string | null;
  assignments?: { due_at: string; paid_at?: string | null; assignment_extras?: {id:string;description:string;amount:number}[] } | null;
  properties?: { name?:string; timezone?: string | null } | null;
  payout_batches?: { status: string; paid_at?: string | null } | null;
};
export type PayAdjustment = { id: string; assignment_id: string; cleaner_id: string; amount: number; entry_date: string; reason: string };
export type FinanceJob = {
  financial_base_amount?: number | null;
  assignment_extras?: {id:string;description:string;amount:number}[];
  id: string; due_at: string; fixed_payout_amount: number | null; paid_at?: string | null;
  properties?: { name?:string; timezone?: string | null } | null;
};

/** Ledger owns history; committed reports own their jobs; other jobs retain their fixed amount. */
export function calculateCleanerFinancialSummary<E extends FinanceEntry, J extends FinanceJob>(input: {
  reconciledThrough: string | null; ledgerEntries: LedgerEntry[]; entries: E[]; jobs: J[]; payments?: CleanerPayment[]; adjustments?: PayAdjustment[];
}) {
  const adjustments = [...new Map((input.adjustments ?? []).map(a => [a.id, a])).values()];
  const adjustmentTotal = adjustments.reduce((sum,a)=>sum+Math.round(Number(a.amount)*100),0);
  const base = (job: J) => job.financial_base_amount ?? job.fixed_payout_amount;
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
    + jobs.filter(job=>job.paid_at && !paidJobIds.has(job.id)).reduce((sum,job)=>sum+cents(base(job)),0);
  const recordedPaymentsCents = payments.reduce((sum,payment)=>sum+cents(payment.amount),0);
  const paidCents = legacyPaidCents + recordedPaymentsCents;
  const awaitingCents = jobs.filter((job) => !job.paid_at).reduce((sum, job) => sum + cents(base(job)), 0);
  const projectedCents = inReportsCents + jobs.reduce((sum, job) => sum + cents(base(job)), 0);
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
    addCharge(job.id,Number(base(job) ?? 0),dateKeyInTimeZone(new Date(job.due_at),job.properties?.timezone),job.properties?.name ?? "Cleaning",job.assignment_extras);
    if (job.paid_at && !paidJobIds.has(job.id)) statementEntries.push({id:`legacy-payment:${job.id}`,entry_date:dateKeyInTimeZone(new Date(job.paid_at),job.properties?.timezone),sequence:2000000,kind:"payment",description:`Payment · ${job.properties?.name ?? "Cleaning"}`,amount:-Number(base(job) ?? 0)});
  }
  adjustments.forEach(a=>statementEntries.push({id:`scope-adjustment:${a.id}`,entry_date:a.entry_date,sequence:1500000,kind:"adjustment",description:a.reason,amount:Number(a.amount)}));
  payments.forEach(payment=>statementEntries.push({id:`payment:${payment.id}`,entry_date:payment.payment_date,sequence:2000001,kind:"payment",description:`Payment received · ${payment.method.replace(/_/g," ")}${payment.reference ? ` · ${payment.reference}` : ""}${payment.note ? ` · ${payment.note}` : ""}`,amount:-Number(payment.amount)}));

  // Account payments cover older ledger debt first, then completed jobs in date order.
  // This is a balance allocation for display/filtering, not proof of a job-specific payment.
  let accountCredit = payments.filter(p => !p.assignment_id).reduce((sum,p) => sum+cents(p.amount),0) - Math.round(ledgerBalance*100);
  const outstanding = [
    ...entries.filter(e => !e.paid_at && !paidJobIds.has(e.assignment_id)).map(e => ({id:e.assignment_id,date:e.assignments!.due_at,amount:cents(e.amount)})),
    ...jobs.filter(j => !j.paid_at && !paidJobIds.has(j.id)).map(j => ({id:j.id,date:j.due_at,amount:cents(base(j))})),
    ...adjustments.map(a=>({id:a.assignment_id,date:a.entry_date,amount:cents(a.amount)})),
  ].sort((a,b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const grouped = new Map<string, {id:string;date:string;amount:number}>();
  for (const item of outstanding) {
    const previous=grouped.get(item.id);
    grouped.set(item.id,{...item,date:previous && previous.date<item.date ? previous.date : item.date,amount:(previous?.amount ?? 0)+item.amount});
  }
  accountCredit = Math.max(0,accountCredit + [...grouped.values()].reduce((sum,item)=>sum+Math.max(0,-item.amount),0));
  const jobRemainingAmounts: Record<string,number> = {};
  for (const job of [...grouped.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id))) {
    if (job.amount <= 0) continue;
    const covered = Math.min(accountCredit,job.amount);
    accountCredit -= covered;
    if (job.amount > covered) jobRemainingAmounts[job.id] = (jobRemainingAmounts[job.id] ?? 0) + (job.amount-covered)/100;
  }

  return {
    balance: (Math.round(ledgerBalance * 100) + projectedCents + adjustmentTotal - paidCents) / 100,
    jobRemainingAmounts, ledgerBalance, entries, jobsOutsideReports: jobs, statementEntries, payments: input.payments ?? [],
    recordedPaymentsTotal: recordedPaymentsCents/100, legacyPaidTotal: legacyPaidCents/100,
    unpaidEntries: entries.filter((entry) => (jobRemainingAmounts[entry.assignment_id]??0)>0).length,
    orphanAssignments: jobs.filter((job) => (jobRemainingAmounts[job.id]??0)>0).length,
    summary: { inReportsTotal: inReportsCents / 100, paidTotal: paidCents / 100, awaitingTotal: awaitingCents / 100, projectedTotal: (projectedCents + adjustmentTotal) / 100 },
  };
}
