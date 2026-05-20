"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireRole } from "@/lib/auth/session";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

const BUCKET = "tenant-assets";
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
]);

export type BrandingActionState = {
  status: "idle" | "success" | "error";
  message: string | null;
  fieldErrors?: Record<string, string[] | undefined>;
};

export const BRANDING_INITIAL: BrandingActionState = {
  status: "idle",
  message: null,
};

const nameSchema = z.object({
  tenantName: z
    .string()
    .trim()
    .min(1, "Workspace name is required.")
    .max(80, "Keep it under 80 characters."),
});

export async function updateTenantNameAction(
  _prev: BrandingActionState,
  formData: FormData,
): Promise<BrandingActionState> {
  // Owners only — admins/supervisors can't rename the workspace they joined.
  const profile = await requireRole(["owner"]);

  const parsed = nameSchema.safeParse({
    tenantName: formData.get("tenantName"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return { status: "error", message: "Validation failed.", fieldErrors };
  }

  const supabase = createServiceSupabaseClient();
  const { error } = await supabase
    .from("users")
    .update({ tenant_name: parsed.data.tenantName })
    .eq("id", profile.owner_id);

  if (error) return { status: "error", message: error.message };

  // Refresh every dashboard route that reads tenant branding.
  revalidatePath("/dashboard", "layout");
  return { status: "success", message: "Workspace name updated." };
}

/**
 * Uploads (or replaces) the tenant logo, then writes its public URL onto
 * the owner row. Path is `logos/<owner_id>/<timestamp>.<ext>` so multiple
 * uploads don't have to fight the CDN cache — each upload is a new file
 * and the URL changes, naturally invalidating any cached <img src>.
 */
export async function uploadTenantLogoAction(
  _prev: BrandingActionState,
  formData: FormData,
): Promise<BrandingActionState> {
  const profile = await requireRole(["owner"]);

  const file = formData.get("logo");
  if (!(file instanceof File) || file.size === 0) {
    return { status: "error", message: "Pick a logo file first." };
  }
  if (file.size > MAX_BYTES) {
    return { status: "error", message: "Logo must be 2 MB or smaller." };
  }
  if (!ALLOWED_MIME.has(file.type)) {
    return {
      status: "error",
      message: "Use PNG, JPEG, WebP, or SVG.",
    };
  }

  // Path uses the owner's tenant id so it's impossible to write into another
  // tenant's folder by accident. Includes a timestamp so we don't have to
  // bust browser/CDN cache when the logo changes.
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
  const safeExt = ["png", "jpg", "jpeg", "webp", "svg"].includes(ext) ? ext : "png";
  const path = `logos/${profile.owner_id}/${Date.now()}.${safeExt}`;

  const supabase = createServiceSupabaseClient();
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: file.type,
      upsert: false,
      cacheControl: "31536000, immutable",
    });

  if (uploadError) {
    return { status: "error", message: uploadError.message };
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from(BUCKET).getPublicUrl(path);

  const { error: updateError } = await supabase
    .from("users")
    .update({ tenant_logo_url: publicUrl })
    .eq("id", profile.owner_id);

  if (updateError) {
    // Best-effort cleanup so we don't leave an orphan asset behind.
    await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
    return { status: "error", message: updateError.message };
  }

  revalidatePath("/dashboard", "layout");
  return { status: "success", message: "Logo updated." };
}

export async function removeTenantLogoAction(): Promise<{ error: string | null }> {
  const profile = await requireRole(["owner"]);
  const supabase = createServiceSupabaseClient();
  const { error } = await supabase
    .from("users")
    .update({ tenant_logo_url: null })
    .eq("id", profile.owner_id);

  revalidatePath("/dashboard", "layout");
  return { error: error?.message ?? null };
}
