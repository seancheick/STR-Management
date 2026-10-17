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

  const recovery = url.searchParams.get("type") === "recovery" || new URL(next, url.origin).pathname === "/reset-password";
  const failure = (reason: string) => {
    const target = new URL(recovery ? "/reset-password" : "/sign-in", url.origin);
    target.searchParams.set("authError", reason);
    return NextResponse.redirect(target);
  };

  // Supabase redirected back with an error before any code exchange (e.g. expired link).
  if (supabaseError) {
    return failure(/expired/i.test(supabaseError) ? "link_expired" : "link_invalid");
  }

  // Email token hashes are verified directly: unlike PKCE codes they work
  // when the email opens in a different browser from the reset request.
  const tokenHash = url.searchParams.get("token_hash");
  if (tokenHash && url.searchParams.get("type") === "recovery") {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
    if (error) return failure("link_invalid");
    return NextResponse.redirect(new URL("/reset-password", url.origin));
  }

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return failure("link_invalid");
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}

