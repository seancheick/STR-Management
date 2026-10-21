import "server-only";

import type { SupabaseClient, User } from "@supabase/supabase-js";

// Only server-created agent clients receive an identity here. Browser clients
// continue to verify their cookie session with Supabase Auth.
export const agentSessionUsers = new WeakMap<SupabaseClient, User>();
