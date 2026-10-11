"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";

/** External database events also invalidate the server's rendered route cache. */
export async function refreshJobViewsAction() {
  const profile = await requireRole(["owner", "admin", "supervisor", "cleaner"]);
  revalidatePath(profile.role === "cleaner" ? "/jobs" : "/dashboard", "layout");
}
