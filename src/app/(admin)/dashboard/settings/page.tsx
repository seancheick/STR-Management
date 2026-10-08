import { headers } from "next/headers";
import { Building2, CalendarDays, Settings as SettingsIcon } from "lucide-react";

import { requireRole } from "@/lib/auth/session";
import { getOrCreateCalendarFeedToken, getTenantBranding } from "@/lib/queries/tenant";
import { TenantBrandingForm } from "@/components/dashboard/tenant-branding-form";

import { regenerateCalendarFeedTokenAction } from "./actions";

export default async function SettingsPage() {
  const profile = await requireRole(["owner", "admin", "supervisor"]);
  const branding = await getTenantBranding(profile.owner_id);
  const isOwner = profile.role === "owner";
  const feedUrl = isOwner ? await calendarFeedUrl(profile.owner_id) : null;

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

      {feedUrl ? (
        <section className="rounded-2xl border border-border/70 bg-card p-6">
          <div className="mb-2 flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-base font-semibold">Calendar feed</h2>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Subscribe to upcoming turnovers in Google or Apple Calendar with this private link.
            Anyone with the link can see your schedule, so keep it to yourself.
          </p>
          <input
            readOnly
            aria-label="Calendar feed URL"
            value={feedUrl}
            className="h-12 w-full rounded-xl border border-input bg-background px-4 font-mono text-xs"
          />
          <form action={regenerateCalendarFeedTokenAction} className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              Regenerate link
            </button>
            <p className="text-xs text-muted-foreground">
              Calendars subscribed with the old link stop updating.
            </p>
          </form>
        </section>
      ) : null}
    </main>
  );
}

async function calendarFeedUrl(ownerId: string): Promise<string | null> {
  // Settings must keep rendering even if the feed-token table is unavailable.
  const token = await getOrCreateCalendarFeedToken(ownerId).catch((err) => {
    console.error("[SettingsPage] calendar feed token", err);
    return null;
  });
  if (!token) return null;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}/api/ical/owner/${token}`;
}
