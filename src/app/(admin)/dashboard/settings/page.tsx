import { getPriceLabsOwner } from "@/lib/pricelabs/auth";
import { getConnectionStatus } from "@/lib/pricelabs/oauth";
import { priceLabsOAuthConfigured } from "@/lib/pricelabs/oauth";
import { ChangePasswordForm } from "@/components/auth/change-password-form";
import { headers } from "next/headers";
import { Building2, CalendarDays, Settings as SettingsIcon } from "lucide-react";

import { requireRole } from "@/lib/auth/session";
import { getOrCreateCalendarFeedToken, getTenantBranding } from "@/lib/queries/tenant";
import { TenantBrandingForm } from "@/components/dashboard/tenant-branding-form";
import { AgentTokensCard } from "@/components/dashboard/agent-tokens-card";
import { listAgentTokens, type AgentTokenRecord } from "@/lib/agent/tokens";

import { regenerateCalendarFeedTokenAction } from "./actions";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ pricelabs?: string }> }) {
  const profile = await requireRole(["owner", "admin", "supervisor"]);
  const branding = await getTenantBranding(profile.owner_id);
  const isOwner = profile.role === "owner";
  const priceLabsOwner = isOwner ? await getPriceLabsOwner() : null;
  const priceLabsReady = priceLabsOAuthConfigured();
  const priceLabsStatus = priceLabsOwner
    ? await getConnectionStatus(priceLabsOwner).catch(() => "unavailable" as const) : null;
  const outcome = (await searchParams).pricelabs;
  const priceLabsMessage = outcome === "connected" ? "PriceLabs connected. The next health scan will verify listing sync."
    : outcome === "disconnected" ? "PriceLabs disconnected."
    : outcome === "failed" ? "The connection could not be completed. Please try again." : null;
  const origin = await requestOrigin();
  const feedUrl = isOwner ? await calendarFeedUrl(profile.owner_id, origin) : null;
  // Settings must keep rendering even if the agent-token table is unavailable.
  const agentTokens: AgentTokenRecord[] | null = isOwner
    ? await listAgentTokens(profile.owner_id).catch((err) => {
        console.error("[SettingsPage] agent tokens", err);
        return null;
      })
    : null;

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

      <ChangePasswordForm />

      {priceLabsOwner ? (
        <section className="rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">PriceLabs</h2>
            <span className="rounded-full border px-3 py-1 text-xs font-medium">
              {priceLabsStatus === "connected" ? "Connected" : priceLabsStatus === "reauthorization_required" ? "Reconnect required" : priceLabsStatus === "unavailable" ? "Status unavailable" : "Not connected"}
            </span>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Connect your PriceLabs account to check listing details and pricing sync health. This connection only reads data.
          </p>
          {priceLabsMessage ? <p role="status" className="mt-3 text-sm">{priceLabsMessage}</p> : null}
          {!priceLabsReady ? <p className="mt-3 text-sm text-muted-foreground">Connection setup is not available yet.</p> : null}
          <div className="mt-4 flex flex-wrap gap-3">
            {priceLabsReady ? (
              <form method="post" action="/api/integrations/pricelabs/connect">
                <button type="submit" className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">
                  {priceLabsStatus === "connected" || priceLabsStatus === "reauthorization_required" ? "Reconnect PriceLabs" : "Connect PriceLabs"}
                </button>
              </form>
            ) : null}
            {priceLabsStatus === "connected" || priceLabsStatus === "reauthorization_required" ? (
              <form method="post" action="/api/integrations/pricelabs/disconnect">
                <button type="submit" className="rounded-full border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Disconnect</button>
              </form>
            ) : null}
          </div>
        </section>
      ) : null}

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

      {agentTokens ? (
        <AgentTokensCard
          tokens={agentTokens}
          mcpUrl={`${origin}/api/mcp`}
          openApiUrl={`${origin}/api/agent/v1/openapi.json`}
        />
      ) : null}
    </main>
  );
}

async function requestOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function calendarFeedUrl(ownerId: string, origin: string): Promise<string | null> {
  // Settings must keep rendering even if the feed-token table is unavailable.
  const token = await getOrCreateCalendarFeedToken(ownerId).catch((err) => {
    console.error("[SettingsPage] calendar feed token", err);
    return null;
  });
  if (!token) return null;
  return `${origin}/api/ical/owner/${token}`;
}
