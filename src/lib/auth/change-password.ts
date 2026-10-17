"use client";

import { createClient } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { getEnv } from "@/lib/env";

export async function changePassword(currentPassword: string, password: string) {
  const client = createBrowserSupabaseClient();
  const { data, error } = await client.auth.getUser();
  if (error || !data.user?.email) return { error: "Your session has expired. Please sign in again." };

  // Verify without replacing the current browser session or its saved credentials.
  const env = getEnv();
  const verifier = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const verified = await verifier.auth.signInWithPassword({ email: data.user.email, password: currentPassword });
  if (verified.error) return { error: "Couldn’t verify your current password. Check it and try again." };
  try {
    const result = await client.auth.updateUser({ password, current_password: currentPassword });
    return { error: result.error?.message ?? null };
  } finally {
    // Revoke only the temporary verification session, never the user's main session.
    await verifier.auth.signOut({ scope: "local" }).catch(() => undefined);
  }
}
