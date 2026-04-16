import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type TeamMemberRecord = {
  id: string;
  email: string;
  full_name: string;
  role: string;
  phone: string | null;
  active: boolean;
  availability: string | null;
  created_at: string;
};

export async function listCleaners(): Promise<TeamMemberRecord[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("users")
    .select("id, email, full_name, role, phone, active, availability, created_at")
    .eq("role", "cleaner")
    .order("full_name");

  return (data as TeamMemberRecord[] | null) ?? [];
}

export async function listActiveCleaners(): Promise<TeamMemberRecord[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("users")
    .select("id, email, full_name, role, phone, active, availability, created_at")
    .eq("role", "cleaner")
    .eq("active", true)
    .order("full_name");

  return (data as TeamMemberRecord[] | null) ?? [];
}

export async function listAllTeamMembers(): Promise<TeamMemberRecord[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("users")
    .select("id, email, full_name, role, phone, active, availability, created_at")
    .order("role")
    .order("full_name");

  return (data as TeamMemberRecord[] | null) ?? [];
}
