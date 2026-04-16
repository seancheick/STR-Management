"use server";

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
  await requireRole(["owner", "admin"]);

  const email = (formData.get("email") as string | null)?.trim().toLowerCase() ?? "";
  const fullName = (formData.get("full_name") as string | null)?.trim() ?? "";
  const role = (formData.get("role") as string | null) ?? "cleaner";

  if (!email) return { error: "Email is required." };
  if (!fullName) return { error: "Full name is required." };
  if (!VALID_ROLES.includes(role as TeamRole)) return { error: "Invalid role." };

  const service = createServiceSupabaseClient();

  // Invite via Supabase Auth — sends magic link email
  const { data, error: inviteError } = await service.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName, role },
  });

  if (inviteError) return { error: inviteError.message };

  // Pre-create the public.users record so the member appears in team lists immediately
  if (data.user) {
    await service.from("users").upsert(
      {
        id: data.user.id,
        email,
        full_name: fullName,
        role,
        active: true,
      },
      { onConflict: "id" },
    );
  }

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

  const { error } = await supabase
    .from("users")
    .update({ active })
    .eq("id", memberId);

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
  const { error } = await supabase
    .from("users")
    .update({ role })
    .eq("id", memberId);

  revalidatePath("/dashboard/team");
  return { error: error?.message ?? null };
}
