"use server";
import {z} from "zod";
import {revalidatePath} from "next/cache";
import {requireRole} from "@/lib/auth/session";
import {createServerSupabaseClient} from "@/lib/supabase/server";
const schema=z.object({assignmentId:z.string().uuid(),cleanedOn:z.string().date(),reason:z.string().trim().min(3).max(500),requestId:z.string().uuid()});
export async function correctCleaningDateAction(input:z.input<typeof schema>){
 await requireRole(["owner","admin"]);const parsed=schema.safeParse(input);
 if(!parsed.success)return {error:parsed.error.issues[0]?.message??"Check the cleaning date."};
 const v=parsed.data;const client=await createServerSupabaseClient();
 const {error}=await client.rpc("correct_cleaning_date",{target_assignment:v.assignmentId,actual_date:v.cleanedOn,correction_reason:v.reason,request_id:v.requestId});
 if(error)return {error:error.message};
 revalidatePath("/dashboard","layout");revalidatePath("/jobs","layout");return {error:null,cleanedOn:v.cleanedOn};
}
