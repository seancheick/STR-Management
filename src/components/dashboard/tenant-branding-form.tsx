"use client";

import Image from "next/image";
import { useActionState, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, ImageIcon, Loader2, Trash2, Upload } from "lucide-react";

import {
  BRANDING_INITIAL,
  removeTenantLogoAction,
  updateTenantNameAction,
  uploadTenantLogoAction,
} from "@/app/(admin)/dashboard/settings/actions";

function NameSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-4 text-sm font-semibold text-[#f7f5ef] transition hover:opacity-95 disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
    </button>
  );
}

function LogoSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-primary px-4 text-sm font-semibold text-[#f7f5ef] transition hover:opacity-95 disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
      Upload
    </button>
  );
}

export function TenantBrandingForm({
  initialName,
  initialLogoUrl,
}: {
  initialName: string;
  initialLogoUrl: string | null;
}) {
  const [nameState, nameAction] = useActionState(updateTenantNameAction, BRANDING_INITIAL);
  const [logoState, logoAction] = useActionState(uploadTenantLogoAction, BRANDING_INITIAL);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) {
      setPreviewUrl(null);
      return;
    }
    setPreviewUrl(URL.createObjectURL(f));
  }

  async function handleRemove() {
    if (!confirm("Remove the workspace logo?")) return;
    await removeTenantLogoAction();
    setPreviewUrl(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Name */}
      <form action={nameAction} className="space-y-3">
        <div>
          <label className="text-sm font-medium" htmlFor="tenantName">
            Workspace name
          </label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Shown at the top of the sidebar and on cleaner notifications.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="h-10 flex-1 rounded-xl border border-input bg-background px-3 text-sm"
            defaultValue={initialName}
            id="tenantName"
            maxLength={80}
            name="tenantName"
            placeholder="Coastal Stays"
            required
            type="text"
          />
          <NameSubmit />
        </div>
        {nameState.status === "success" && (
          <p className="flex items-center gap-1.5 text-xs text-emerald-700">
            <Check className="h-3 w-3" /> {nameState.message}
          </p>
        )}
        {nameState.status === "error" && nameState.message && (
          <p className="text-xs text-destructive">{nameState.message}</p>
        )}
      </form>

      {/* Logo */}
      <form action={logoAction} className="space-y-3">
        <div>
          <label className="text-sm font-medium" htmlFor="logo">
            Workspace logo
          </label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Square works best. Max 2 MB. PNG, JPEG, WebP, or SVG.
          </p>
        </div>

        <div className="flex items-center gap-4 rounded-2xl border border-border/70 bg-background/60 p-4">
          {/* Preview */}
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border/70 bg-card">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="New logo preview" className="h-full w-full object-cover" src={previewUrl} />
            ) : initialLogoUrl ? (
              <Image
                alt="Current logo"
                className="h-full w-full object-cover"
                height={64}
                src={initialLogoUrl}
                unoptimized
                width={64}
              />
            ) : (
              <ImageIcon className="h-6 w-6 text-muted-foreground/50" aria-hidden="true" />
            )}
          </div>

          <div className="flex-1 space-y-2">
            <input
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-full file:border-0 file:bg-muted file:px-3 file:py-2 file:text-xs file:font-medium hover:file:bg-muted/80"
              id="logo"
              name="logo"
              onChange={handlePick}
              ref={fileRef}
              type="file"
            />
            <div className="flex items-center gap-2">
              <LogoSubmit />
              {initialLogoUrl && (
                <button
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 text-xs font-medium text-muted-foreground transition hover:bg-muted"
                  onClick={handleRemove}
                  type="button"
                >
                  <Trash2 className="h-3 w-3" />
                  Remove
                </button>
              )}
            </div>
          </div>
        </div>

        {logoState.status === "success" && (
          <p className="flex items-center gap-1.5 text-xs text-emerald-700">
            <Check className="h-3 w-3" /> {logoState.message}
          </p>
        )}
        {logoState.status === "error" && logoState.message && (
          <p className="text-xs text-destructive">{logoState.message}</p>
        )}
      </form>
    </div>
  );
}
