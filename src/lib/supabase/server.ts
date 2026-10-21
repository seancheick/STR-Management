import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { getEnv } from "@/lib/env";

// Agent API calls (src/lib/agent) have no cookies: they run existing queries
// and actions against a signed-in client for the token owner instead.
const requestClient = new AsyncLocalStorage<SupabaseClient>();

export function runWithSupabaseClient<T>(client: SupabaseClient, fn: () => Promise<T>) {
  return requestClient.run(client, fn);
}

export async function createServerSupabaseClient() {
  const override = requestClient.getStore();
  if (override) return override;

  const cookieStore = await cookies();
  const env = getEnv();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components can read cookies but cannot always mutate them.
          }
        },
      },
    },
  );
}
