"use server";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {requireRole} from "@/lib/auth/session";
import {createServerSupabaseClient} from "@/lib/supabase/server";
import {getCleanerFinancialSummary} from "@/lib/queries/cleaner-finance";
const paymentSchema=z.object({id:z.string().uuid(),cleanerId:z.string().uuid(),amount:z.string().regex(/^\d+(\.\d{1,2})?$/,"Enter an amount with up to two decimal places.").transform(Number).refine(n=>n>0&&n<=100000,"Enter a positive payment amount."),date:z.string().date(),method:z.enum(["zelle","venmo","cash","check","bank_transfer","other"]),reference:z.string().trim().max(120),note:z.string().trim().max(500),verified:z.boolean().optional().default(false)});
export async function recordCleanerPaymentAction(input:z.input<typeof paymentSchema>) {
 await requireRole(["owner","admin"]);
 const parsed=paymentSchema.safeParse(input);
 if(!parsed.success)return {error:parsed.error.issues[0]?.message??"Check the payment details."};
 const value=parsed.data;const client=await createServerSupabaseClient();
 const {error}=await client.rpc("record_cleaner_payment",{payment_id:value.id,target_cleaner:value.cleanerId,paid_amount:value.amount,paid_date:value.date,paid_method:value.method,payment_reference:value.reference||null,payment_note:value.note||null});
 if(error)return {error:error.message};
 if(value.verified){const verified=await client.rpc("verify_cleaner_payment",{payment_id:value.id});if(verified.error)return {error:verified.error.message};}
 revalidatePath("/dashboard","layout");revalidatePath("/jobs","layout");
 return {error:null,balance:(await getCleanerFinancialSummary(value.cleanerId)).balance};
}
export async function voidCleanerPaymentAction(id:string,reason:string) {
 await requireRole(["owner","admin"]);
 if(!z.string().uuid().safeParse(id).success||reason.trim().length<3)return {error:"Enter a reason for undoing this payment."};
 const client=await createServerSupabaseClient();const {error}=await client.rpc("void_cleaner_payment",{payment_id:id,reason:reason.trim()});
 if(error)return {error:error.message};
 revalidatePath("/dashboard","layout");revalidatePath("/jobs","layout");
 return {error:null};
}

export async function verifyCleanerPaymentAction(id:string) {
 await requireRole(["owner","admin"]);
 if(!z.string().uuid().safeParse(id).success)return {error:"Choose a valid payment."};
 const client=await createServerSupabaseClient();const {error}=await client.rpc("verify_cleaner_payment",{payment_id:id});
 if(error)return {error:error.message};
 revalidatePath("/dashboard","layout");revalidatePath("/jobs","layout");return {error:null};
}
