import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

// Only allow relative next paths so the callback can't be abused as an open redirect.
function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
  return raw;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const supabaseError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  const next = safeNext(url.searchParams.get("next"));

  // Supabase redirected back with an error before any code exchange (e.g. expired link).
  if (supabaseError) {
    const errorUrl = new URL("/sign-in", url.origin);
    errorUrl.searchParams.set("authError", supabaseError);
    return NextResponse.redirect(errorUrl);
  }

  if (code) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const errorUrl = new URL("/sign-in", url.origin);
      errorUrl.searchParams.set(
        "authError",
        "Reset link is invalid or already used. Request a new one.",
      );
      return NextResponse.redirect(errorUrl);
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}

