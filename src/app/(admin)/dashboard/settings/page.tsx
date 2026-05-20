import { Building2, Settings as SettingsIcon } from "lucide-react";

import { requireRole } from "@/lib/auth/session";
import { getTenantBranding } from "@/lib/queries/tenant";
import { TenantBrandingForm } from "@/components/dashboard/tenant-branding-form";

export default async function SettingsPage() {
  const profile = await requireRole(["owner", "admin", "supervisor"]);
  const branding = await getTenantBranding(profile.owner_id);
  const isOwner = profile.role === "owner";

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">Workspace</p>
        <h1 className="mt-1.5 flex items-center gap-2 text-3xl font-semibold tracking-tight">
          <SettingsIcon className="h-7 w-7 text-primary" aria-hidden="true" />
          Settings
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Personalize how TurnFlow looks inside your workspace.
        </p>
      </header>

      <section className="rounded-2xl border border-border/70 bg-card p-6">
        <div className="mb-5 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-base font-semibold">Branding</h2>
        </div>

        {isOwner ? (
          <TenantBrandingForm
            initialLogoUrl={branding?.logoUrl ?? null}
            initialName={branding?.name ?? ""}
          />
        ) : (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              Workspace name: <span className="font-medium text-foreground">{branding?.name}</span>
            </p>
            <p>Only the workspace owner can change branding. Ask them to update it.</p>
          </div>
        )}
      </section>
    </main>
  );
}
