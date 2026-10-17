import { describe, expect, it } from "vitest";
import { calculateCleanerFinancialSummary, type FinanceEntry, type FinanceJob } from "@/lib/services/cleaner-finance";

const cutoff = "2026-09-30";
const job = (id: string, amount = 90, due = "2026-10-05T19:00:00Z"): FinanceJob => ({ id, fixed_payout_amount: amount, due_at: due, paid_at: null });
const entry = (id: string, assignmentId: string, amount = 120): FinanceEntry => ({ id, assignment_id: assignmentId, amount, status: "included", paid_at: null, assignments: { due_at: "2026-10-05T19:00:00Z", paid_at: null }, payout_batches: { status: "approved" } });
const ledger = [{ id: "historical-charges", entry_date: "2026-09-30", sequence: 1, kind: "cleaning" as const, description: "Charges", amount: 2500 }, { id: "historical-payment", entry_date: "2026-09-30", sequence: 2, kind: "payment" as const, description: "Payment", amount: -376 }];
const calculate = (entries: FinanceEntry[], jobs: FinanceJob[], reconciledThrough: string | null = cutoff) => calculateCleanerFinancialSummary({ entries, jobs, reconciledThrough, ledgerEntries: ledger });

describe("shared cleaner financial accounting", () => {
  it("preserves the reconciled $2124 balance without adding historical reports/jobs again", () => {
    const historical = entry("old-report", "old-job", 700);
    historical.assignments!.due_at = "2026-09-30T23:00:00Z";
    expect(calculate([historical], [job("old-job", 700, "2026-09-30T23:00:00Z")]).balance).toBe(2124);
  });
  it("adds an approved report once at its committed amount and includes orphan completed work", () => {
    const result = calculate([entry("report", "reported")], [job("reported", 90), job("orphan", 90)]);
    expect(result.balance).toBe(2334);
    expect(result.unpaidEntries).toBe(1);
    expect(result.orphanAssignments).toBe(1);
  });
  it("uses entry or assignment payment stamps and never counts the report plus its job twice", () => {
    const stampedEntry = { ...entry("entry-payment", "reported"), paid_at: "2026-10-06T12:00:00Z" };
    const jobStampEntry = entry("schedule-payment", "schedule");
    jobStampEntry.assignments!.paid_at = "2026-10-06T12:00:00Z";
    const paidDirect = { ...job("direct"), paid_at: "2026-10-06T12:00:00Z" };
    const result = calculate([stampedEntry, jobStampEntry], [job("reported"), job("schedule"), paidDirect]);
    expect(result.balance).toBe(2124);
    expect(result.summary.paidTotal).toBe(330);
  });
  it("draft/cancelled reports do not own accounting; the completed job amount remains authoritative", () => {
    const draft = { ...entry("draft", "job", 1000), payout_batches: { status: "draft" } };
    const cancelled = { ...entry("cancelled", "other", 1000), payout_batches: { status: "cancelled" } };
    expect(calculate([draft, cancelled], [job("job"), job("other")]).balance).toBe(2304);
  });
  it("honors property-local reconciliation day rather than the UTC date", () => {
    const historical = { ...job("late-local", 90, "2026-10-01T02:00:00Z"), properties: { timezone: "America/New_York" } };
    expect(calculate([], [historical]).balance).toBe(2124);
  });
  it("deduplicates legacy duplicate reports, retaining definitive payment proof", () => {
    const unpaid = entry("duplicate-one", "same-job");
    const paid = { ...entry("duplicate-two", "same-job"), paid_at: "2026-10-06T12:00:00Z" };
    expect(calculate([paid, unpaid], [job("same-job")]).balance).toBe(2124);
    expect(calculate([unpaid, paid], [job("same-job")]).balance).toBe(2124);
  });
});


describe("paid batch payment proof", () => {
  it("treats the paid batch timestamp as definitive even before individual entry/job stamps", () => {
    const batchPaid = { ...entry("batch-only", "reported"), payout_batches: { status: "paid", paid_at: "2026-10-06T12:00:00Z" } };
    const result = calculate([batchPaid], [job("reported")]);
    expect(result.balance).toBe(2124);
    expect(result.unpaidEntries).toBe(0);
    expect(result.entries[0].paid_at).toBe("2026-10-06T12:00:00Z");
  });
  it("requires a timestamp rather than assuming that an unstamped paid label proves payment", () => {
    expect(calculate([{ ...entry("unstamped", "reported"), payout_batches: { status: "paid", paid_at: null } }], [job("reported")]).balance).toBe(2244);
  });
  it("does not use a timestamp on an uncommitted report as payment evidence", () => {
    expect(calculate([{ ...entry("draft-stamp", "reported"), payout_batches: { status: "draft", paid_at: "2026-10-06T12:00:00Z" } }], [job("reported")]).balance).toBe(2214);
  });
  it("retains paid-batch proof when deduplicating an old unpaid duplicate", () => {
    const paid = { ...entry("paid-batch", "reported"), payout_batches: { status: "paid", paid_at: "2026-10-06T12:00:00Z" } };
    expect(calculate([paid, entry("duplicate", "reported")], [job("reported")]).balance).toBe(2124);
  });
});

import type {CleanerPayment} from "@/lib/domain/payments";
import {summarizeLedger,isHistoricalPayoutReport} from "@/lib/services/cleaner-ledger";
const payment=(amount:number,assignment_id:string|null=null):CleanerPayment=>({id:"payment1",owner_id:"owner",cleaner_id:"cleaner",amount,payment_date:"2026-10-17",method:"zelle",reference:"ref1",note:null,assignment_id,source_key:assignment_id?`job:${assignment_id}`:null,created_at:"2026-10-17T12:00Z",created_by:"owner",voided_at:null});
describe("canonical recorded payments and running ledger",()=>{
 it("reduces the historical debt with an account payment",()=>{
  const result=calculateCleanerFinancialSummary({entries:[],jobs:[],reconciledThrough:cutoff,ledgerEntries:ledger,payments:[payment(100)]});
  expect(result.balance).toBe(2024);expect(result.recordedPaymentsTotal).toBe(100);expect(summarizeLedger(result.statementEntries).balance).toBe(result.balance);
 });
 it("does not deduct a recorded job payment again through job and report paid stamps",()=>{
  const e={...entry("report","job1",95),paid_at:"2026-10-17T12:00Z"};
  const result=calculateCleanerFinancialSummary({entries:[e],jobs:[{...job("job1",95),paid_at:"2026-10-17T12:00Z"}],reconciledThrough:cutoff,ledgerEntries:ledger,payments:[payment(95,"job1")]});
  expect(result.balance).toBe(2124);expect(result.legacyPaidTotal).toBe(0);expect(result.recordedPaymentsTotal).toBe(95);expect(summarizeLedger(result.statementEntries).balance).toBe(result.balance);
 });
 it("restores the balance after a payment is undone",()=>{
  const result=calculateCleanerFinancialSummary({entries:[],jobs:[job("work",95)],reconciledThrough:null,ledgerEntries:[],payments:[{...payment(50),voided_at:"2026-10-18T12:00Z"}]});
  expect(result.balance).toBe(95);expect(result.recordedPaymentsTotal).toBe(0);expect(result.payments).toHaveLength(1);
 });
 it("supports partial payments and credit balances",()=>{
  const input={entries:[],jobs:[job("work",95)],reconciledThrough:null,ledgerEntries:[]};
  expect(calculateCleanerFinancialSummary({...input,payments:[payment(50)]}).balance).toBe(45);
  expect(calculateCleanerFinancialSummary({...input,payments:[payment(100)]}).balance).toBe(-5);
 });
 it("itemizes extras without counting them twice in the running statement",()=>{
  const work={...job("work",95),properties:{name:"Basement",timezone:"America/New_York"},assignment_extras:[{id:"trash",description:"Trash",amount:10},{id:"receipt",description:"Receipt",amount:10}]};
  const result=calculateCleanerFinancialSummary({entries:[],jobs:[work],reconciledThrough:null,ledgerEntries:[],payments:[payment(50)]});
  expect(result.statementEntries.map(e=>e.amount)).toEqual([75,10,10,-50]);expect(summarizeLedger(result.statementEntries).balance).toBe(45);
 });
 it("keeps a legacy payment and a separate account payment distinct",()=>{
  const result=calculateCleanerFinancialSummary({entries:[],jobs:[{...job("legacy",95),paid_at:"2026-10-17T12:00Z"}],reconciledThrough:cutoff,ledgerEntries:ledger,payments:[payment(100)]});
  expect(result.balance).toBe(2024);expect(result.legacyPaidTotal).toBe(95);expect(summarizeLedger(result.statementEntries).balance).toBe(result.balance);
 });
 it("archived all-cleaners reports require complete reconciliation coverage",()=>{
  const report={cleaner_filter:null,period_end:"2026-09-30",entry_count:2,payout_entries:[{cleaner_id:"a",status:"included"},{cleaner_id:"b",status:"included"}]};
  expect(isHistoricalPayoutReport(report,[{cleaner_id:"a",reconciled_through:cutoff},{cleaner_id:"b",reconciled_through:cutoff}])).toBe(true);
  expect(isHistoricalPayoutReport(report,[{cleaner_id:"a",reconciled_through:cutoff}])).toBe(false);
 });
});

describe("shared remaining job balances",()=>{
 const run=(jobs:FinanceJob[],payments:CleanerPayment[]=[],ledgerEntries=ledger,entries:FinanceEntry[]=[])=>calculateCleanerFinancialSummary({jobs,payments,ledgerEntries,entries,reconciledThrough:cutoff});
 it("does not flag reconciled history as unpaid jobs",()=>{
  expect(run([job("old",90,"2026-09-20T19:00Z")]).jobRemainingAmounts).toEqual({});
 });
 it("applies account payments to older ledger debt before new jobs",()=>{
  expect(run([job("new")],[payment(2000)]).jobRemainingAmounts).toEqual({new:90});
 });
 it("shows only the remaining part of a job after historical debt is settled",()=>{
  const result=run([job("new")],[payment(2164)]);
  expect(result.jobRemainingAmounts).toEqual({new:50});expect(result.balance).toBe(50);
 });
 it("covers oldest work first regardless of input order and excludes fully covered jobs",()=>{
  const result=run([job("later",90,"2026-10-06T19:00Z"),job("earlier",90)],[payment(2224)]);
  expect(result.jobRemainingAmounts).toEqual({later:80});expect(result.balance).toBe(80);
 });
 it("never applies a job payment a second time to another job",()=>{
  const result=run([job("paid"),job("open")],[payment(90,"paid")]);
  expect(result.jobRemainingAmounts).toEqual({open:90});expect(result.balance).toBe(2214);
 });
 it("uses the committed report amount once and includes account credits",()=>{
  expect(run([job("reported",90)],[payment(2244)],ledger,[entry("e","reported",120)]).jobRemainingAmounts).toEqual({});
 });
});
