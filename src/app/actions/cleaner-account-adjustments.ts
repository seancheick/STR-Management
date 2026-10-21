"use server";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {requireRole} from "@/lib/auth/session";
import {createServerSupabaseClient} from "@/lib/supabase/server";
import {getCleanerFinancialSummary} from "@/lib/queries/cleaner-finance";
const schema=z.object({requestId:z.string().uuid(),cleanerId:z.string().uuid(),date:z.string().date(),amount:z.number().finite().refine(n=>n!==0&&Math.abs(n)<=100000&&Number(n.toFixed(2))===n,"Use a nonzero signed amount with at most two decimal places."),kind:z.enum(["charge_correction","payment_correction"]),reason:z.string().trim().min(3).max(1000)});
/** Amount is a balance delta: positive increases owed, negative decreases owed. */
export async function postCleanerAccountAdjustmentAction(input:z.input<typeof schema>) {
 await requireRole(["owner","admin"]);
 const parsed=schema.safeParse(input);
 if(!parsed.success)return {error:parsed.error.issues[0]?.message??"Check the adjustment details."};
 const v=parsed.data;const client=await createServerSupabaseClient();
 const {error}=await client.rpc("post_cleaner_account_adjustment",{request_id:v.requestId,target_cleaner:v.cleanerId,adjustment_date:v.date,signed_amount:v.amount,adjustment_kind:v.kind,adjustment_reason:v.reason});
 if(error)return {error:error.message};
 revalidatePath("/dashboard","layout");revalidatePath("/jobs","layout");
 return {error:null,requestId:v.requestId,balance:(await getCleanerFinancialSummary(v.cleanerId)).balance};
}
