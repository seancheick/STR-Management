import { dateKeyInTimeZone } from "@/lib/ical/timezone";

export type LedgerEntry = {
  id: string;
  entry_date: string;
  sequence: number;
  kind: "cleaning" | "adjustment" | "payment";
  description: string;
  amount: number;
};

export function summarizeLedger(entries: LedgerEntry[]) {
  let balanceCents = 0;
  let chargeCents = 0;
  let paymentCents = 0;
  const months = new Map<
    string,
    {
      key: string;
      opening: number;
      closing: number;
      charges: number;
      payments: number;
      entries: (LedgerEntry & { balance: number })[];
    }
  >();
  const sorted = [...entries].sort(
    (a, b) =>
      a.entry_date.localeCompare(b.entry_date) ||
      a.sequence - b.sequence ||
      a.id.localeCompare(b.id),
  );
  for (const entry of sorted) {
    const cents = Math.round(Number(entry.amount) * 100);
    const key = entry.entry_date.slice(0, 7);
    if (!months.has(key))
      months.set(key, {
        key,
        opening: balanceCents / 100,
        closing: 0,
        charges: 0,
        payments: 0,
        entries: [],
      });
    const month = months.get(key)!;
    balanceCents += cents;
    if (cents > 0) {
      chargeCents += cents;
      month.charges += cents / 100;
    } else {
      paymentCents -= cents;
      month.payments -= cents / 100;
    }
    month.closing = balanceCents / 100;
    month.entries.push({
      ...entry,
      amount: cents / 100,
      balance: balanceCents / 100,
    });
  }
  return {
    balance: balanceCents / 100,
    charges: chargeCents / 100,
    payments: paymentCents / 100,
    months: [...months.values()].reverse(),
    paymentsList: sorted.filter((e) => e.kind === "payment").reverse(),
  };
}

export function isReconciledJob(
  accounts: { cleaner_id: string; reconciled_through: string }[],
  cleanerId: string | null,
  dueAt: string,
  timezone?: string | null,
) {
  const account = accounts.find((a) => a.cleaner_id === cleanerId);
  return (
    !!account &&
    dateKeyInTimeZone(new Date(dueAt), timezone) <= account.reconciled_through
  );
}

export function isHistoricalPayoutReport(
  report: { cleaner_filter: string | null; period_end: string; entry_count?:number; payout_entries?:{cleaner_id:string;status:string}[] },
  accounts: { cleaner_id: string; reconciled_through: string }[],
) {
  if (report.cleaner_filter) return accounts.some(account=>account.cleaner_id===report.cleaner_filter && report.period_end<=account.reconciled_through);
  const entries=report.payout_entries?.filter(entry=>entry.status==="included");
  // A complete membership list is required to classify an all-cleaners report.
  return !!entries?.length && entries.length === report.entry_count && entries.every(entry=>accounts.some(account=>account.cleaner_id===entry.cleaner_id && report.period_end<=account.reconciled_through));
}
