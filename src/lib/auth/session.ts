import "server-only";

import type { Route } from "next";
import { redirect } from "next/navigation";

import { getRoleHomePath, isUserRole, type UserRole } from "@/lib/auth/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type UserProfile = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  active: boolean;
};

export async function getSessionUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const user = await getSessionUser();

  if (!user) {
    return null;
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase
    .from("users")
    .select("id, email, full_name, role, active")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data || !isUserRole(data.role) || !data.active) {
    return null;
  }

  return data as UserProfile;
}

export async function requireAuthenticatedUser(redirectTo?: string) {
  const user = await getSessionUser();

  if (!user) {
    const next = redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : "";
    redirect(`/sign-in${next}` as Route);
  }

  return user;
}

export async function requireRole(allowedRoles: UserRole[]) {
  const user = await requireAuthenticatedUser();
  const profile = await getCurrentUserProfile();

  if (!profile) {
    redirect("/sign-in" as Route);
  }

  if (!allowedRoles.includes(profile.role)) {
    redirect(getRoleHomePath(profile.role) as Route);
  }

  return {
    ...profile,
    id: user.id,
    email: user.email ?? profile.email,
  };
}
