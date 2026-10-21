"use server";
import { throwMissingCleaning } from "@/lib/queries/statement-identity";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AssignmentExtraRecord } from "@/lib/queries/assignments";

export async function getJobPayAction(assignmentId: string) {
  const actor = await requireRole(["owner", "admin"]);
  const client = await createServerSupabaseClient();
  const { data, error } = await client.from("assignments").select("status,cleaner_id,fixed_payout_amount,cleaning_scope_total,assignment_extras(id,assignment_id,description,amount,kind,created_at)").eq("id", z.string().uuid().parse(assignmentId)).eq("owner_id", actor.owner_id).maybeSingle();
  if (error) throw new Error("Could not load job pay. Refresh and try again.");
  if (!data) return throwMissingCleaning(client,assignmentId,actor.owner_id);
  const lock = await client.rpc("cleaning_scope_financial_locked", { target_assignment: assignmentId });
  if (lock.error) throw new Error("Could not verify whether this cleaning's pay is editable.");
  const editRestriction = data.cleaning_scope_total != null ? "This cleaning has a scope correction. Use correct_cleaning_scope to change its total."
    : data.status === "cancelled" ? "Cancelled cleanings cannot have extras changed."
    : data.cleaner_id === null || data.fixed_payout_amount === null ? "Choose a cleaner and set the cleaning total before adding extras."
    : lock.data === true ? "Paid, reconciled or report-linked cleaning pay is locked." : null;
  return { canEditExtras: editRestriction === null, editRestriction, scopeCorrected: data.cleaning_scope_total != null, total: data.cleaning_scope_total != null ? Number(data.cleaning_scope_total) : data.fixed_payout_amount === null ? null : Number(data.fixed_payout_amount), extras: data.assignment_extras as AssignmentExtraRecord[] };
}

export async function saveJobExtraAction(input: {assignmentId: string; id: string; description: string; amount: string; kind: string}) {
  await requireRole(["owner", "admin"]);
  const parsed = z.object({assignmentId:z.string().uuid(),id:z.string().uuid(),description:z.string().trim().min(1).max(200),amount:z.string().regex(/^\d+(\.\d{1,2})?$/).transform(Number).refine(n=>n>0&&n<=100000),kind:z.enum(["service","reimbursement"])}).safeParse(input);
  if (!parsed.success) return { error: "Enter a description and an amount greater than zero (up to two decimal places)." };
  const v = parsed.data;
  const client = await createServerSupabaseClient();
  const {error} = await client.rpc("add_assignment_extra", {target_id:v.assignmentId,extra_id:v.id,extra_description:v.description,extra_amount:v.amount,extra_kind:v.kind});
  if (error) return {error:error.message};
  revalidatePath("/dashboard", "layout"); revalidatePath("/jobs", "layout");
  return {error:null};
}

export async function removeJobExtraAction(assignmentId: string, id: string) {
  await requireRole(["owner", "admin"]);
  if (!z.string().uuid().safeParse(assignmentId).success || !z.string().uuid().safeParse(id).success) return {error:"Invalid extra."};
  const client = await createServerSupabaseClient();
  const {error} = await client.rpc("remove_assignment_extra", {target_id:assignmentId,extra_id:id});
  if (error) return {error:error.message};
  revalidatePath("/dashboard", "layout"); revalidatePath("/jobs", "layout");
  return {error:null};
}
