import { describe, expect, it } from "vitest";
import { aggregateCleaningSpending, spendingCsv, spendingYear } from "@/lib/services/cleaning-spending";
import { calculateCleanerFinancialSummary } from "@/lib/services/cleaner-finance";
import type { LedgerEntry } from "@/lib/services/cleaner-ledger";
const entry = (id: string, date: string, amount: number, kind: LedgerEntry["kind"] = "cleaning"): LedgerEntry => ({id, entry_date: date, amount, kind, description: id, sequence: 1});
describe("cleaning spending", () => {
 it("separates costs, credits, payments and all-time outstanding at the cutoff", () => {
  const report = aggregateCleaningSpending([{cleanerId:"a", statementEntries:[entry("old","2025-12-31",100),entry("job","2026-01-01",200),entry("credit","2026-01-02",-20,"adjustment"),entry("paid","2026-02-01",-150,"payment"),entry("future","2026-12-01",900)]}],2026,"2026-02-10");
  expect(report.costs).toBe(180); expect(report.paid).toBe(150); expect(report.outstanding).toBe(130); expect(report.currentMonthCosts).toBe(0);
  expect(report.months[0].costs).toBe(180); expect(report.months[1].paid).toBe(150);
 });
 it("uses canonical deduplication of ledger history, reports and jobs", () => {
  const finance = calculateCleanerFinancialSummary({reconciledThrough:"2025-12-31",ledgerEntries:[entry("history","2025-12-31",75)],entries:[{id:"report",assignment_id:"job",amount:125,status:"included",paid_at:null,assignments:{due_at:"2026-01-01T02:00:00Z"},properties:{timezone:"America/Los_Angeles"}}],jobs:[{id:"job",due_at:"2026-01-01T02:00:00Z",fixed_payout_amount:125,properties:{timezone:"America/Los_Angeles"}}]});
  const result=aggregateCleaningSpending([{cleanerId:"a",...finance}],2025,"2026-03-01");
  expect(result.costs).toBe(75); expect(result.outstanding).toBe(75);
 });
 it("keeps report snapshots authoritative and rounds in cents",()=>{
  const finance=calculateCleanerFinancialSummary({reconciledThrough:null,ledgerEntries:[],entries:[{id:"r1",assignment_id:"j",amount:10.10,status:"included",paid_at:null,assignments:{due_at:"2026-01-01T15:00:00Z"}},{id:"r2",assignment_id:"j",amount:10.10,status:"included",paid_at:null,assignments:{due_at:"2026-01-01T15:00:00Z"}}],jobs:[{id:"j",due_at:"2026-01-01T15:00:00Z",fixed_payout_amount:99}]});
  expect(aggregateCleaningSpending([{cleanerId:"a",...finance}],2026,"2026-02-01").costs).toBe(10.10);
 });
 it("preserves cleaner credits without offsetting another cleaner's unpaid balance",()=>{
  const report=aggregateCleaningSpending([{cleanerId:"a",statementEntries:[entry("a","2026-01-01",100)]},{cleanerId:"b",statementEntries:[entry("b","2026-01-01",-30,"payment")]}],2026,"2026-02-01");
  expect(report.outstanding).toBe(100); expect(report.credit).toBe(30);
 });
 it("includes the full past year, excludes adjacent dates and retains app-local today",()=>{
  const entries=[entry("before","2024-12-31",400),entry("first","2025-01-01",0.10),entry("last","2025-12-31",0.20),entry("next","2026-01-01",500)];
  const report=aggregateCleaningSpending([{cleanerId:"a",statementEntries:entries}],2025,"2026-10-17");
  expect(report.costs).toBe(0.30); expect(report.months[11].costs).toBe(0.20);
  expect(report.currentMonthCosts).toBe(0); expect(report.years).toEqual([2026,2025,2024]);
 });
 it("shows only costs through today within the current month",()=>{
  const report=aggregateCleaningSpending([{cleanerId:"a",statementEntries:[entry("now","2026-10-17",125),entry("later","2026-10-18",200)]}],2026,"2026-10-17");
  expect(report.currentMonthCosts).toBe(125); expect(report.costs).toBe(125);
 });
 it("falls back to the current app year for malformed selections",()=>{
  expect(spendingYear("2025","2026-01-01")).toBe(2025);
  for(const value of [undefined,"invalid","1999","2026x","=2025"]) expect(spendingYear(value,"2026-01-01")).toBe(2026);
 });
 it("exports safe payee names and numeric credits",()=>{
  const report=aggregateCleaningSpending([{cleanerId:"a",cleanerName:"=HYPERLINK(1)",statementEntries:[entry("a","2026-01-01",-10,"adjustment")]}],2026,"2026-02-01");
  expect(spendingCsv(report)).toContain(`"'=HYPERLINK(1)"`);
  expect(spendingCsv(report)).toContain('"-10"');
 });
});
