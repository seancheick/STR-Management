import type { AssignmentExtraRecord } from "@/lib/queries/assignments";

function money(amount: number) {
  return amount.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

/** The saved total already includes extras; derive base pay without adding them twice. */
export function JobPayBreakdown({
  total,
  extras = [],
  label = "Total pay",
  className = "",
}: {
  total: number | null;
  extras?: readonly AssignmentExtraRecord[];
  label?: string;
  className?: string;
}) {
  if (total === null) return <p className={`text-sm text-muted-foreground ${className}`}>Pay not set</p>;
  const totalCents = Math.round(Number(total) * 100);
  const extrasCents = extras.reduce((sum, extra) => sum + Math.round(Number(extra.amount) * 100), 0);
  if (extras.length === 0) {
    return <p className={`text-sm font-semibold tabular-nums ${className}`}>{label} · {money(totalCents / 100)}</p>;
  }
  return (
    <details className={`min-w-0 text-sm ${className}`}>
      <summary className="min-h-11 cursor-pointer content-center font-semibold tabular-nums">
        {label} · {money(totalCents / 100)} <span className="font-normal text-muted-foreground">· View breakdown</span>
      </summary>
      <dl className="mt-1 space-y-2 border-t border-border/60 pt-3">
        <div className="flex justify-between gap-4">
          <dt>Base cleaning</dt><dd className="shrink-0 tabular-nums">{money((totalCents - extrasCents) / 100)}</dd>
        </div>
        {extras.map((extra) => (
          <div key={extra.id} className="flex justify-between gap-4">
            <dt className="min-w-0 break-words">{extra.description}<span className="block text-xs text-muted-foreground">{extra.kind === "reimbursement" ? "Reimbursement" : "Extra service"}</span></dt>
            <dd className="shrink-0 tabular-nums">{money(Number(extra.amount))}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
