import type { LedgerEntry } from "./cleaner-ledger";
import { reportCsvCell } from "./payout-report-csv";

type SpendingInput = { cleanerId: string; cleanerName?: string | null; statementEntries: LedgerEntry[] };
type Totals = { costs: number; paid: number };

/** Consume only canonical statements: their owner already reconciles ledger/report/job overlap.
 * Entry dates are property-local calendar dates; never reinterpret them as UTC timestamps.
 * Payments follow their recorded cash date, while credits reduce incurred costs.
 */
export function aggregateCleaningSpending(summaries: SpendingInput[], year: number, today: string) {
  const months = Array.from({length:12}, (_, index) => ({key:`${year}-${String(index+1).padStart(2,"0")}`,costs:0,paid:0}));
  const cleaners: (Totals & {cleanerId:string;name:string})[]=[];
  const years=new Set<number>([Number(today.slice(0,4)),year]);
  let outstanding=0, credit=0;
  for(const summary of summaries) {
    const cleaner={cleanerId:summary.cleanerId,name:summary.cleanerName || "Cleaner",costs:0,paid:0};
    let balance=0;
    for(const entry of summary.statementEntries) {
      const entryYear=Number(entry.entry_date.slice(0,4));
      years.add(entryYear);
      if(entry.entry_date>today) continue;
      const amount=Math.round(Number(entry.amount)*100);
      balance+=amount;
      if(entryYear!==year) continue;
      const month=months[Number(entry.entry_date.slice(5,7))-1];
      if(entry.kind==="payment") {cleaner.paid-=amount; month.paid-=amount;}
      else {cleaner.costs+=amount; month.costs+=amount;}
    }
    outstanding+=Math.max(0,balance); credit+=Math.max(0,-balance);
    if(cleaner.costs || cleaner.paid) cleaners.push({...cleaner,costs:cleaner.costs/100,paid:cleaner.paid/100});
  }
  const costs=months.reduce((sum,month)=>sum+month.costs,0)/100;
  const paid=months.reduce((sum,month)=>sum+month.paid,0)/100;
  return {year,today,costs,paid,outstanding:outstanding/100,credit:credit/100,
    currentMonthCosts:year===Number(today.slice(0,4)) ? months[Number(today.slice(5,7))-1].costs/100 : 0,
    months:months.map(month=>({...month,costs:month.costs/100,paid:month.paid/100})),
    cleaners:cleaners.sort((a,b)=>a.name.localeCompare(b.name)),years:[...years].sort((a,b)=>b-a)};
}
export type CleaningSpending = ReturnType<typeof aggregateCleaningSpending>;
export function spendingCsv(report: CleaningSpending) {
  const rows:(string|number)[][]=[
    ["Cleaning spending",report.year,"Through",report.today],
    ["Month","Cleaning costs","Money paid"],
    ...report.months.map(month=>[month.key,month.costs,month.paid]),
    ["Year total",report.costs,report.paid],[],
    ["Cleaner","Cleaning costs","Money paid"],
    ...report.cleaners.map(cleaner=>[cleaner.name,cleaner.costs,cleaner.paid]),[],
    ["Outstanding across all years as of",report.today,report.outstanding],
    ["Cleaner credit across all years",report.credit],
  ];
  return "\uFEFF"+rows.map(row=>row.map(reportCsvCell).join(",")).join("\r\n");
}
export function spendingYear(value: string | undefined, today: string) {
  return value && /^\d{4}$/.test(value) && Number(value)>=2000 && Number(value)<=9999 ? Number(value) : Number(today.slice(0,4));
}
