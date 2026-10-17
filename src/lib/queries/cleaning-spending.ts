import "server-only";
import { cache } from "react";
import { listCleanerFinancialSummaries } from "./cleaner-finance";
import { listAllTeamMembers } from "./team";
import { dateKeyInTimeZone } from "@/lib/ical/timezone";
import { aggregateCleaningSpending } from "@/lib/services/cleaning-spending";

export const getCleaningSpending = cache(async (year?:number) => {
 const today=dateKeyInTimeZone(new Date());
 const [summaries,cleaners]=await Promise.all([listCleanerFinancialSummaries(),listAllTeamMembers()]);
 const names=new Map(cleaners.map(cleaner=>[cleaner.id,cleaner.full_name]));
 return aggregateCleaningSpending(summaries.map(summary=>({...summary,cleanerName:names.get(summary.cleanerId) ?? summary.ledger?.account.label ?? "Cleaner"})),year ?? Number(today.slice(0,4)),today);
});
