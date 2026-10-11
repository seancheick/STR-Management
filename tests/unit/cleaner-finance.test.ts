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
