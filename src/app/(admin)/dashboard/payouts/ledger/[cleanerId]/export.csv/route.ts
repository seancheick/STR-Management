import {requireRole} from "@/lib/auth/session";
import {getCleanerFinancialSummary} from "@/lib/queries/cleaner-finance";
import {summarizeLedger} from "@/lib/services/cleaner-ledger";
import {z} from "zod";
import {reportCsvCell as csv} from "@/lib/services/payout-report-csv";
export async function GET(_request:Request,{params}:{params:Promise<{cleanerId:string}>}) {
 await requireRole(["owner","admin","supervisor"]);const {cleanerId}=await params;
 if(!z.string().uuid().safeParse(cleanerId).success)return new Response("Invalid cleaner",{status:400});
 const finance=await getCleanerFinancialSummary(cleanerId);const summary=summarizeLedger(finance.statementEntries);
 const entries=summary.months.slice().reverse().flatMap(month=>month.entries);
 const rows=[["Date","Description","Charge","Payment","Running balance"],...entries.map(entry=>[entry.entry_date,entry.description,entry.amount>0?Number(entry.amount).toFixed(2):"",entry.amount<0?(-Number(entry.amount)).toFixed(2):"",Number(entry.balance.toFixed(2))])];
 return new Response("\uFEFF"+rows.map(row=>row.map(csv).join(",")).join("\r\n"),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="cleaner-ledger-${cleanerId}.csv"`,"Cache-Control":"private, no-store"}});
}
