"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { AssignmentExtraRecord } from "@/lib/queries/assignments";

export async function getJobPayAction(assignmentId: string) {
  const actor = await requireRole(["owner", "admin"]);
  const client = await createServerSupabaseClient();
  const { data, error } = await client.from("assignments").select("fixed_payout_amount,assignment_extras(id,assignment_id,description,amount,kind,created_at)").eq("id", z.string().uuid().parse(assignmentId)).eq("owner_id", actor.owner_id).single();
  if (error) throw new Error("Could not load job pay. Refresh and try again.");
  return { total: data.fixed_payout_amount === null ? null : Number(data.fixed_payout_amount), extras: data.assignment_extras as AssignmentExtraRecord[] };
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
