import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  getRequiredRoles,
  getRoleHomePath,
  isUserRole,
} from "@/lib/auth/config";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  const { supabase, response, user } = await updateSession(request);
  const pathname = request.nextUrl.pathname;
  const requiredRoles = getRequiredRoles(pathname);

  if (!requiredRoles) {
    return response;
  }

  if (!user) {
    const signInUrl = new URL("/sign-in", request.url);
    signInUrl.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(signInUrl);
  }

  const { data: profile } = await supabase
    .from("users")
    .select("role, active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.active || !isUserRole(profile.role)) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  if (!requiredRoles.includes(profile.role)) {
    return NextResponse.redirect(new URL(getRoleHomePath(profile.role), request.url));
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/jobs/:path*"],
};
