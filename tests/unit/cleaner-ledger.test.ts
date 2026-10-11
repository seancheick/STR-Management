import { describe, it, expect } from "vitest";
import {
  summarizeLedger,
  isReconciledJob,
  type LedgerEntry,
} from "@/lib/services/cleaner-ledger";
import { readFileSync } from "node:fs";
describe("reconciled ledger", () => {
  it("reconstructs all source month-end balances and actual payments", () => {
    const sql = readFileSync("supabase/data/mary-ledger-2026.sql", "utf8");
    const entries: LedgerEntry[] = [
      ...sql.matchAll(
        /'2026-(\d{2}-\d{2})',(\d+),'(cleaning|adjustment|payment)','([^']*)',(-?[\d.]+),'mary/g,
      ),
    ].map((m) => ({
      id: m[2],
      entry_date: `2026-${m[1]}`,
      sequence: Number(m[2]),
      kind: m[3] as LedgerEntry["kind"],
      description: m[4],
      amount: Number(m[5]),
    }));
    expect(entries).toHaveLength(148);
    const summary = summarizeLedger(entries.reverse());
    expect(summary.balance).toBe(2124);
    expect(summary.charges).toBe(12464);
    expect(summary.payments).toBe(10340);
    expect(summary.paymentsList).toHaveLength(11);
    expect(summary.months.map((m) => m.closing)).toEqual([
      2124, 2454, 3064, 2144, 1359, 3314, 1494, 964, 780, 165,
    ]);
    expect(summary.months[0].entries[0].balance).toBe(2544);
  });
  it("keeps cent precision and handles credits and same-day ordering", () => {
    const entries: LedgerEntry[] = [
      {
        id: "b",
        entry_date: "2026-10-01",
        sequence: 2,
        kind: "payment",
        description: "Payment",
        amount: -0.3,
      },
      {
        id: "a",
        entry_date: "2026-10-01",
        sequence: 1,
        kind: "adjustment",
        description: "Extra",
        amount: 0.1,
      },
    ];
    expect(summarizeLedger(entries).balance).toBe(-0.2);
    expect(
      summarizeLedger(entries).months[0].entries.map((e) => e.balance),
    ).toEqual([0.1, -0.2]);
  });
});

it("excludes only the reconciled cleaner through the local cutoff day", () => {
  const accounts = [{ cleaner_id: "mary", reconciled_through: "2026-10-10" }];
  expect(
    isReconciledJob(
      accounts,
      "mary",
      "2026-10-11T01:00:00Z",
      "America/New_York",
    ),
  ).toBe(true);
  expect(
    isReconciledJob(
      accounts,
      "mary",
      "2026-10-11T05:00:00Z",
      "America/New_York",
    ),
  ).toBe(false);
  expect(isReconciledJob(accounts, "other", "2026-10-10T12:00:00Z")).toBe(
    false,
  );
});
