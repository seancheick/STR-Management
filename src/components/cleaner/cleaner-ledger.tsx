import {
  summarizeLedger,
  type LedgerEntry,
} from "@/lib/services/cleaner-ledger";
import type { CleanerAccount } from "@/lib/queries/cleaner-ledger";
const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const date = (d: string) =>
  new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
export function CleanerLedger({
  account,
  entries,
}: {
  account: CleanerAccount;
  entries: LedgerEntry[];
}) {
  const summary = summarizeLedger(entries);
  return (
    <section className="space-y-6" aria-label="Reconciled cleaning ledger">
      <div className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-xl font-semibold">{account.label}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Reconciled through {date(account.reconciled_through)}
        </p>
        <dl className="mt-5 space-y-3 tabular-nums">
          <div className="flex justify-between gap-3">
            <dt>Cleaning &amp; extras</dt>
            <dd>{money(summary.charges)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt>Payments received</dt>
            <dd>−{money(summary.payments)}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t pt-3 text-xl font-semibold text-primary">
            <dt>
              {summary.balance < 0 ? "Credit balance" : "Ledger balance"}
            </dt>
            <dd>{money(Math.abs(summary.balance))}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-muted-foreground">
          {account.source_note}
        </p>
      </div>
      <details className="rounded-2xl border border-border bg-card">
        <summary className="min-h-12 p-4 font-semibold">
          Payments received · {summary.paymentsList.length}
        </summary>
        <ul className="divide-y divide-border px-4">
          {summary.paymentsList.map((e) => (
            <li
              key={e.id}
              className="-mx-4 flex justify-between gap-4 bg-green-50/60 px-4 py-3 dark:bg-green-950/20"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{e.description}</p>
                <p className="text-sm text-muted-foreground">
                  {date(e.entry_date)}
                </p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums">
                {money(-Number(e.amount))}
              </span>
            </li>
          ))}
        </ul>
      </details>
      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Monthly ledger</h2>
        <p className="text-sm text-muted-foreground">
          Open a month to see every cleaning, extra, and payment. Charges add to
          the balance; payments reduce it.
        </p>
        {summary.months.map((month, index) => (
          <details
            key={month.key}
            open={index === 0}
            className="rounded-2xl border border-border bg-card"
          >
            <summary className="min-h-12 p-4">
              <span className="font-semibold">
                {new Date(`${month.key}-01T12:00:00Z`).toLocaleDateString(
                  "en-US",
                  { month: "long", year: "numeric", timeZone: "UTC" },
                )}
              </span>
              <span className="ml-3 text-sm text-muted-foreground">
                Closing {money(month.closing)}
              </span>
            </summary>
            <div className="border-t px-4 py-3 text-sm text-muted-foreground">
              Opening {money(month.opening)} + charges {money(month.charges)} −
              payments {money(month.payments)}
            </div>
            <ol className="divide-y divide-border px-4">
              {month.entries.map((e) => (
                <li
                  key={e.id}
                  className={
                    e.kind === "payment"
                      ? "-mx-4 bg-green-50/60 px-4 py-3 dark:bg-green-950/20"
                      : "py-3"
                  }
                >
                  <div className="flex justify-between gap-3">
                    <span className="min-w-0 text-sm font-medium">
                      {e.description}
                    </span>
                    <span
                      className={`shrink-0 font-semibold tabular-nums ${e.kind === "payment" ? "text-primary" : ""}`}
                    >
                      {Number(e.amount) < 0 ? "−" : "+"}
                      {money(Math.abs(Number(e.amount)))}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      {date(e.entry_date)} ·{" "}
                      {e.kind === "payment"
                        ? "Payment"
                        : e.kind === "cleaning"
                          ? "Cleaning"
                          : "Extra / adjustment"}
                    </span>
                    <span className="tabular-nums">
                      Balance {money(e.balance)}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          </details>
        ))}
      </div>
    </section>
  );
}
