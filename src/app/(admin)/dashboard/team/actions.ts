"use server";

import {cleanupNewAuthUser} from "@/lib/services/auth-cleanup";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type TeamActionResult = { error: string | null };

const VALID_ROLES = ["cleaner", "supervisor", "admin"] as const;
type TeamRole = (typeof VALID_ROLES)[number];

// ─── Invite a new team member ─────────────────────────────────────────────────
export async function inviteTeamMemberAction(
  _prev: TeamActionResult,
  formData: FormData,
): Promise<TeamActionResult> {
  // Capture the inviter's tenant — every new team member is stamped with it.
  const inviter = await requireRole(["owner", "admin"]);
  const tenantId = inviter.owner_id;
  if (!tenantId) {
    return { error: "Your account has no tenant. Re-sign in and try again." };
  }

  const email = (formData.get("email") as string | null)?.trim().toLowerCase() ?? "";
  const fullName = (formData.get("full_name") as string | null)?.trim() ?? "";
  const role = (formData.get("role") as string | null) ?? "cleaner";

  if (!email) return { error: "Email is required." };
  if (!fullName) return { error: "Full name is required." };
  if (!VALID_ROLES.includes(role as TeamRole)) return { error: "Invalid role." };

  const contractorId=String(formData.get("contractorId")??"");
  const client=await createServerSupabaseClient();
  if(contractorId) {
    const {data:person}=await client.from("cleaners").select("id,user_id,active").eq("id",contractorId).eq("owner_id",tenantId).eq("role","cleaner").maybeSingle();
    if(!person||person.user_id||!person.active||role!=="cleaner")return {error:"Choose an active contractor without app access."};
  }
  const service = createServiceSupabaseClient();

  // Invite via Supabase Auth — sends magic link email. Role and tenant are
  // NOT read from metadata (the signup trigger ignores them); the upsert
  // below sets them with the service role.
  const { data, error: inviteError } = await service.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
  });

  if (inviteError) return { error: inviteError.message };

  // Pre-create the public.users record so the member appears in team lists immediately.
  // owner_id is REQUIRED post-multi-tenancy — without it the NOT NULL constraint
  // would reject the upsert and the invite would arrive at a broken account.
  if (data.user) {
    const { error: upsertError } = await service.from("users").upsert(
      {
        id: data.user.id,
        email,
        full_name: fullName,
        role,
        active: true,
        owner_id: tenantId,
      },
      { onConflict: "id" },
    );

    if (upsertError) {
      // Roll back the auth invite so the user isn't stranded with a working
      // login that has no tenant binding. Swallow the cleanup error — surfacing
      // the original upsert error is more useful to the caller.
      await cleanupNewAuthUser(service,data.user.id,tenantId);
      return { error: upsertError.message };
    }
  }

  if(contractorId && data.user) {
    const {error}=await client.rpc("link_contractor_access",{target_id:contractorId,target_user:data.user.id});
    if(error){await cleanupNewAuthUser(service,data.user.id,tenantId);return {error:error.message};}
  }
  revalidatePath("/dashboard","layout");
  revalidatePath("/jobs","layout");
  revalidatePath("/dashboard/team");
  return { error: null };
}

// ─── Toggle active status ─────────────────────────────────────────────────────
export async function toggleMemberActiveAction(
  memberId: string,
  active: boolean,
): Promise<TeamActionResult> {
  await requireRole(["owner", "admin"]);
  const supabase = await createServerSupabaseClient();

  const {error}=await supabase.rpc("manage_cleaner_state",{target_id:memberId,new_active:active});

  revalidatePath("/dashboard","layout");
  revalidatePath("/jobs","layout");
  revalidatePath("/dashboard/team");
  return { error: error?.message ?? null };
}

// ─── Toggle 1099 contractor flag ──────────────────────────────────────────────
export async function toggleContractorFlagAction(
  memberId: string,
  is1099: boolean,
): Promise<TeamActionResult> {
  await requireRole(["owner", "admin"]);
  const supabase = await createServerSupabaseClient();
  const {error}=await supabase.rpc("manage_cleaner_state",{target_id:memberId,new_1099:is1099});
  revalidatePath("/dashboard","layout");
  revalidatePath("/jobs","layout");
  revalidatePath("/dashboard/team");
  return { error: error?.message ?? null };
}

// ─── Update role ──────────────────────────────────────────────────────────────
export async function updateMemberRoleAction(
  memberId: string,
  role: string,
): Promise<TeamActionResult> {
  await requireRole(["owner", "admin"]);

  if (!VALID_ROLES.includes(role as TeamRole)) return { error: "Invalid role." };

  const supabase = await createServerSupabaseClient();
  const {error}=await supabase.rpc("manage_cleaner_state",{target_id:memberId,new_role:role});

  revalidatePath("/dashboard","layout");
  revalidatePath("/jobs","layout");
  revalidatePath("/dashboard/team");
  return { error: error?.message ?? null };
}

export async function saveContractorAction(_prev:TeamActionResult,formData:FormData):Promise<TeamActionResult & {saved?:boolean}> {
 await requireRole(["owner","admin"]);
 const client=await createServerSupabaseClient();
 const {error}=await client.rpc("save_contractor",{target_id:String(formData.get("id")),contractor_name:String(formData.get("name")??""),contractor_email:String(formData.get("email")??""),contractor_phone:String(formData.get("phone")??""),contractor_details:String(formData.get("details")??""),contractor_active:formData.get("active")!=="false"});
 if(error)return {error:error.message};
 revalidatePath("/dashboard","layout");
 return {error:null,saved:true};
}
