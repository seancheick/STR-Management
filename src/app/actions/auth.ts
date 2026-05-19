"use server";

import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { z } from "zod";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

export async function signOutAction(): Promise<void> {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}

// ─── Host self-signup (creates a new tenant) ─────────────────────────────────

const signUpSchema = z.object({
  fullName: z.string().trim().min(1, "Your name is required.").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email."),
  password: z.string().min(8, "Password must be at least 8 characters."),
});

export type SignUpState = {
  status: "idle" | "success" | "error";
  message: string | null;
  fieldErrors?: Record<string, string[] | undefined>;
};

const SIGNUP_INITIAL: SignUpState = { status: "idle", message: null };
export { SIGNUP_INITIAL as signUpInitial };

/**
 * Sign up as an Airbnb host — creates a brand-new tenant.
 *  1. Auth user via Supabase Auth (sends confirmation email).
 *  2. public.users row with role='owner' and owner_id = self.id so the new
 *     account is its own isolated tenant on day one.
 *
 * Anything that touches public.users uses the service-role client because the
 * brand-new user doesn't have a session attached to this request yet, and the
 * RLS policy on users requires a tenant resolution that doesn't exist until
 * the row lands.
 */
export async function signUpAsHostAction(
  _prev: SignUpState,
  formData: FormData,
): Promise<SignUpState> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return { status: "error", message: "Please fix the errors below.", fieldErrors };
  }

  const { email, password, fullName } = parsed.data;

  try {
    const service = createServiceSupabaseClient();

    // Create the auth user. The handle_auth_user_created trigger mints the
    // public.users row from this metadata: role='owner' tells the trigger
    // to self-tenant (owner_id = new.id). One round-trip total.
    const { data: authData, error: authError } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: false, // require email verification
      user_metadata: { full_name: fullName, role: "owner" },
    });

    if (authError || !authData.user) {
      // Most common failure: email already exists.
      const msg = authError?.message ?? "Could not create account.";
      if (/already registered|already exists/i.test(msg)) {
        return {
          status: "error",
          message: "An account with that email already exists. Try signing in instead.",
        };
      }
      return { status: "error", message: msg };
    }

    // Belt + suspenders: ensure the row actually landed as 'owner' with
    // self-tenant. If the trigger ever drifts, this update keeps the contract.
    const userId = authData.user.id;
    const { error: ensureError } = await service
      .from("users")
      .update({ role: "owner", owner_id: userId, active: true, full_name: fullName })
      .eq("id", userId);

    if (ensureError) {
      await service.auth.admin.deleteUser(userId).catch(() => undefined);
      return { status: "error", message: ensureError.message };
    }
  } catch (error) {
    if (isRedirectError(error)) throw error;
    console.error("[signUpAsHostAction]", error);
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Something went wrong.",
    };
  }

  redirect("/sign-in?signedUp=1");
}
