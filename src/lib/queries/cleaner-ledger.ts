import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { LedgerEntry } from "@/lib/services/cleaner-ledger";
export type CleanerAccount = {
  cleaner_id: string;
  owner_id: string;
  label: string;
  reconciled_through: string;
  source_note: string;
};
export async function getCleanerLedger(cleanerId: string) {
  const client = await createServerSupabaseClient();
  const { data: account, error } = await client
    .from("cleaner_accounts")
    .select("*")
    .eq("cleaner_id", cleanerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!account) return null;
  const entries: LedgerEntry[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await client
      .from("cleaner_ledger_entries")
      .select("id,entry_date,sequence,kind,description,amount")
      .eq("cleaner_id", cleanerId)
      .order("entry_date")
      .order("sequence")
      .order("id")
      .range(offset, offset + 999);
    if (error) throw new Error(error.message);
    entries.push(...((data ?? []) as LedgerEntry[]));
    if ((data?.length ?? 0) < 1000) break;
  }
  return { account: account as CleanerAccount, entries };
}

/** Legacy records through the reconciliation date are already in the ledger. */
export async function listCleanerAccounts(): Promise<CleanerAccount[]> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.from("cleaner_accounts").select("*");
  if (error) throw new Error(error.message);
  return (data ?? []) as CleanerAccount[];
}
export { isReconciledJob } from "@/lib/services/cleaner-ledger";
