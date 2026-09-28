import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

// Only allow same-origin paths so the callback can't be abused as an open
// redirect. Resolving the URL catches tricks like "/\\evil.com", which
// browsers and URL() treat as "//evil.com".
function safeNext(raw: string | null, origin: string): string {
  if (!raw || !raw.startsWith("/")) return "/dashboard";
  const resolved = new URL(raw, origin);
  if (resolved.origin !== origin) return "/dashboard";
  return resolved.pathname + resolved.search + resolved.hash;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const supabaseError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  const next = safeNext(url.searchParams.get("next"), url.origin);

  // Supabase redirected back with an error before any code exchange (e.g. expired link).
  if (supabaseError) {
    const errorUrl = new URL("/sign-in", url.origin);
    // Pass a fixed code, never the raw text: the sign-in page renders it, and
    // a crafted link could otherwise put any message on our domain.
    errorUrl.searchParams.set("authError", /expired/i.test(supabaseError) ? "link_expired" : "link_invalid");
    return NextResponse.redirect(errorUrl);
  }

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const errorUrl = new URL("/sign-in", url.origin);
      errorUrl.searchParams.set("authError", "link_invalid");
      return NextResponse.redirect(errorUrl);
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}

