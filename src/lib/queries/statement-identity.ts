import type { SupabaseClient } from "@supabase/supabase-js";
import { BusinessRuleError } from "@/lib/domain/business-error";

/** Only disclose imported lines visible to this owner; unknown/other-tenant IDs remain absent. */
export async function throwMissingCleaning(client:SupabaseClient,id:string,ownerId:string):Promise<never> {
 const {data,error}=await client.from("cleaner_ledger_entries").select("id").eq("id",id).eq("owner_id",ownerId).maybeSingle();
 if(error)throw new Error("Could not check statement entry identity.");
 if(data)throw new BusinessRuleError("This is an imported history line, not a cleaning job. Post a dated account adjustment to correct it.","imported_history","post_cleaner_adjustment");
 throw new BusinessRuleError("Cleaning not found.","not_found",null);
}
