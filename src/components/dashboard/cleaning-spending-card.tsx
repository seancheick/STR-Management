import Link from "next/link";
import type { Route } from "next";
import type { CleaningSpending } from "@/lib/services/cleaning-spending";
export const spendingMoney=(value:number)=>value.toLocaleString("en-US",{style:"currency",currency:"USD"});
export function CleaningSpendingCard({report}:{report:CleaningSpending}) {
 return <section className="rounded-2xl border border-border/70 bg-card p-5" aria-label="Cleaning spending">
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">Cleaning spending · {report.year}</h2><Link href={"/dashboard/payouts/spending" as Route} className="text-xs font-medium text-primary underline-offset-4 hover:underline">View spending report →</Link></div>
  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">{[["Costs this year",report.costs],["Money paid this year",report.paid],["Outstanding · all years",report.outstanding],["Costs this month",report.currentMonthCosts]].map(([label,amount])=><div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums text-primary">{spendingMoney(Number(amount))}</dd></div>)}</dl>
  <p className="mt-4 text-xs text-muted-foreground">Through {report.today}. Completed work and extras, after credits. Payments use the date money was recorded as paid.{report.credit>0 ? ` Cleaner credit: ${spendingMoney(report.credit)}.` : ""}</p>
 </section>;
}
