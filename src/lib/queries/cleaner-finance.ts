import "server-only";
import type { CleanerPayment } from "@/lib/domain/payments";
import { cache } from "react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resolveOwnerId } from "@/lib/queries/properties";
import { getCleanerLedger, type CleanerAccount } from "@/lib/queries/cleaner-ledger";
import { type PayAdjustment, calculateCleanerFinancialSummary } from "@/lib/services/cleaner-finance";
import { withListingConfiguration } from "@/lib/services/booking-configuration";
import type { PayoutEntryRecord } from "@/lib/queries/payouts";
import type { AssignmentListRecord } from "@/lib/queries/assignments";

type Entry = PayoutEntryRecord & { payout_batches: { status: string; paid_at: string | null } | null };
const loadFinance = cache(async () => {
  const supabase = await createServerSupabaseClient();
  const ownerId = await resolveOwnerId();
  const entries: Entry[] = [];
  const jobs: AssignmentListRecord[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("payout_entries")
      .select("*, properties:property_id(name,timezone),assignments(due_at,assignment_type,expected_duration_min,paid_at,assignment_extras(id,assignment_id,description,amount,kind,created_at)),payout_batches:batch_id(status,paid_at)")
      .eq("owner_id", ownerId).eq("status", "included").order("id").range(offset, offset + 999);
    if (error) throw new Error(error.message);
    entries.push(...((data ?? []) as unknown as Entry[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("assignments")
      .select("*,properties:property_id(name,address_line_1,city,timezone),listing_properties:assignments_listing_property_fk(name,address_line_1,city,timezone),cleaning_scope_properties:assignments_cleaning_scope_property_fk (name,address_line_1,city,timezone),cleaners:cleaner_id(full_name),assignment_extras(id,assignment_id,description,amount,kind,created_at)")
      .eq("owner_id", ownerId).in("status", ["approved", "completed_pending_review"]).order("id").range(offset, offset + 999);
    if (error) throw new Error(error.message);
    jobs.push(...((data ?? []) as unknown as AssignmentListRecord[]).map(withListingConfiguration));
    if ((data?.length ?? 0) < 1000) break;
  }
  const { data: accounts, error } = await supabase.from("cleaner_accounts").select("*").eq("owner_id", ownerId);
  if (error) throw new Error(error.message);
  const payments: CleanerPayment[] = [];
  for (let offset=0;;offset+=1000) {
    const {data,error}=await supabase.from("cleaner_payments").select("*").eq("owner_id",ownerId).order("payment_date",{ascending:false}).order("id").range(offset,offset+999);
    if(error) throw new Error(error.message);
    payments.push(...((data??[]) as CleanerPayment[]));
    if((data?.length??0)<1000) break;
  }
  const adjustments: PayAdjustment[] = [];
  for (let offset=0;;offset+=1000) {
    const {data,error}=await supabase.from("cleaning_pay_adjustments").select("id,assignment_id,cleaner_id,amount,entry_date,reason").eq("owner_id",ownerId).order("id").range(offset,offset+999);
    if(error) throw new Error(error.message);
    adjustments.push(...((data??[]) as PayAdjustment[]));
    if((data?.length??0)<1000) break;
  }
  return { adjustments, payments, entries, jobs, accounts: (accounts ?? []) as CleanerAccount[] };
});

export const getCleanerFinancialSummary = cache(async (cleanerId: string) => {
  const data = await loadFinance();
  const ledger = await getCleanerLedger(cleanerId);
  const accounting = calculateCleanerFinancialSummary({
    reconciledThrough: ledger?.account.reconciled_through ?? null,
    ledgerEntries: ledger?.entries ?? [],
    adjustments: data.adjustments.filter(a=>a.cleaner_id===cleanerId),
    payments: data.payments.filter(payment=>payment.cleaner_id===cleanerId),
    entries: data.entries.filter((entry) => entry.cleaner_id === cleanerId),
    jobs: data.jobs.filter((job) => job.cleaner_id === cleanerId),
  });
  return { cleanerId, ledger, ...accounting };
});

export async function listCleanerFinancialSummaries(cleanerIds?: string[]) {
  const data = await loadFinance();
  const ids = cleanerIds ?? [...new Set([...data.accounts.map((a) => a.cleaner_id), ...data.payments.map(p=>p.cleaner_id), ...data.entries.map((e) => e.cleaner_id), ...data.jobs.flatMap((j) => j.cleaner_id ? [j.cleaner_id] : [])])];
  return Promise.all(ids.map(getCleanerFinancialSummary));
}

/** Canonical completed-work balances shared by the assignment filter and payouts. */
export async function getOutstandingJobAmounts() {
 const summaries=await listCleanerFinancialSummaries();
 return Object.assign({},...summaries.map(summary=>summary.jobRemainingAmounts)) as Record<string,number>;
}
