import { requireRole } from "@/lib/auth/session";
import { getCleaningSpending } from "@/lib/queries/cleaning-spending";
import { spendingCsv, spendingYear } from "@/lib/services/cleaning-spending";
import { dateKeyInTimeZone } from "@/lib/ical/timezone";
export async function GET(request:Request) {
 await requireRole(["owner","admin"]);
 const report=await getCleaningSpending(spendingYear(new URL(request.url).searchParams.get("year") ?? undefined,dateKeyInTimeZone(new Date())));
 return new Response(spendingCsv(report),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="cleaning-spending-${report.year}.csv"`,"Cache-Control":"private, no-store"}});
}
