import { Activity, AlertTriangle, CheckCircle2, CircleHelp } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";

import { getHealthReport } from "@/lib/queries/health";
import { calendarSourceHealth, healthTimeAgo, type HealthState } from "@/lib/services/system-health";
import { formatInTimeZone } from "@/lib/ical/timezone";

function Status({ state, children }: { state: HealthState; children: React.ReactNode }) {
  const Icon = state === "healthy" ? CheckCircle2 : state === "attention" ? AlertTriangle : CircleHelp;
  const color = state === "healthy" ? "bg-emerald-50 text-emerald-800" : state === "attention" ? "bg-amber-50 text-amber-900" : "bg-muted text-muted-foreground";
  return <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${color}`}><Icon className="h-3.5 w-3.5" aria-hidden="true" />{children}</span>;
}

export default async function HealthPage() {
  // The report itself authorizes the caller and scopes all data to this workspace.
  const h = await getHealthReport();
  const now = Date.parse(h.checkedAt);
  const sources = h.calendarSources.map((source) => ({ ...source, health: calendarSourceHealth(source, now) }))
    .sort((a, b) => ({ attention: 0, unknown: 1, healthy: 2 })[a.health.state] - ({ attention: 0, unknown: 1, healthy: 2 })[b.health.state] || a.property_name.localeCompare(b.property_name));
  const calendarAttention = sources.filter((source) => source.health.state !== "healthy").length;
  const actions: Array<{ text: string; href: Route }> = [];
  if (calendarAttention) actions.push({ text: `${calendarAttention} calendar ${calendarAttention === 1 ? "source needs" : "sources need"} a check`, href: "/dashboard/calendar" });
  if ((h.notifications.last_24h_failed ?? 0) > 0) actions.push({ text: `${h.notifications.last_24h_failed} notifications created in the last 24 hours have failed`, href: "/dashboard/notifications" });
  if ((h.assignments.unassigned_next_7d ?? 0) > 0) actions.push({ text: `${h.assignments.unassigned_next_7d} upcoming cleanings still need a cleaner`, href: "/dashboard/assignments" });
  if ((h.assignments.tight_turnovers_next_7d ?? 0) > 0) actions.push({ text: `${h.assignments.tight_turnovers_next_7d} upcoming cleanings have a window of six hours or less`, href: "/dashboard/schedule" });
  if ((h.assignments.stuck_pending_review ?? 0) > 0) actions.push({ text: `${h.assignments.stuck_pending_review} cleanings have waited over 24 hours for review`, href: "/dashboard/review" });
  const unknownSources = sources.some((source) => source.health.state === "unknown");
  const overall: HealthState = actions.length ? "attention" : h.unavailableChecks.length || unknownSources ? "unknown" : "healthy";
  const automation = [
    { label: "Calendar sync", schedule: "Daily at 08:00 UTC", iso: h.crons.last_sync_calendars_at, evidence: "Latest recorded sync attempt" },
    { label: "Cleaning reminders", schedule: "Daily at 09:00 UTC", iso: h.crons.last_send_reminders_at, evidence: "Latest reminder notification created" },
    { label: "Recurring tasks", schedule: "Daily at 10:00 UTC", iso: null, evidence: "Run history is not recorded" },
    { label: "Weekly summary", schedule: "Mondays at 11:00 UTC", iso: h.crons.last_weekly_digest_at, evidence: "Latest weekly notification created" },
  ];
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">Operations</p>
          <h1 className="mt-1.5 flex items-center gap-2 text-3xl font-semibold tracking-tight"><Activity className="h-7 w-7 text-primary" aria-hidden="true" />System health</h1>
          <p className="mt-2 text-sm text-muted-foreground">Calendar syncs, notifications and work that needs your attention.</p>
          <p className="mt-1 text-xs text-muted-foreground">Checked {formatInTimeZone(h.checkedAt, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}. Open this page again to refresh.</p>
        </div>
        <Status state={overall}>{overall === "attention" ? "Needs attention" : overall === "unknown" ? "Some checks unavailable" : "No issues found in available checks"}</Status>
      </header>

      {h.unavailableChecks.length > 0 && <section role="status" className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
        <h2 className="font-semibold">Some checks could not be completed</h2>
        <p className="mt-2 text-sm">{[...new Set(h.unavailableChecks)].join(", ")}. Unavailable values are not counted as zero. Refresh to try again.</p>
      </section>}

      <section className="rounded-2xl border border-border/70 bg-card p-5">
        <h2 className="text-base font-semibold">Needs attention</h2>
        {actions.length ? <ul className="mt-3 divide-y divide-border/60">{actions.map((action) => <li key={action.href} className="py-3"><Link href={action.href} className="text-sm font-medium text-primary underline underline-offset-4">{action.text} →</Link></li>)}</ul>
          : <p className="mt-3 text-sm text-muted-foreground">{h.unavailableChecks.length ? "No issues found in the checks that completed. Review the unavailable checks above." : "No calendar, notification or cleaning issues found in the available checks."}</p>}
      </section>

      <section aria-label="Workspace totals" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Properties" value={h.database.total_properties} />
        <Tile label="Active cleaners" value={h.database.total_active_cleaners} />
        <Tile label="Reservations" value={h.database.total_reservations} />
        <Tile label="Assignments" value={h.database.total_assignments} />
      </section>

      <section className="rounded-2xl border border-border/70 bg-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-semibold">Calendar sources</h2><Link href="/dashboard/calendar" className="text-sm text-primary underline underline-offset-4">Manage calendars</Link></div>
        {!sources.length ? <p className="mt-3 text-sm text-muted-foreground">{h.unavailableChecks.includes("Calendar sources") ? "Calendar sources could not be loaded." : "No active calendar sources connected yet."}</p>
          : <ul className="mt-3 divide-y divide-border/60">{sources.map((source) => <li key={source.id} className="flex flex-col items-start gap-3 py-4 sm:flex-row sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium">{source.property_name} <span className="font-normal text-muted-foreground">· {source.platform}</span></p>
              <p className="mt-1 text-xs text-muted-foreground">Last sync: {healthTimeAgo(source.last_synced_at, now)}</p>
              {source.sync_logs && <p className="mt-1 text-xs text-muted-foreground">Latest attempt: {healthTimeAgo(source.sync_logs.synced_at, now)} · {source.sync_logs.events_found} events · {source.sync_logs.assignments_created} cleanings created{source.sync_logs.conflict_count > 0 && ` · ${source.sync_logs.conflict_count} conflicts`}</p>}
              {source.sync_logs?.error_message && <p className="mt-2 break-words text-sm text-destructive">{source.sync_logs.error_message}</p>}
            </div>
            <Status state={source.health.state}>{source.health.label}</Status>
          </li>)}</ul>}
      </section>

      <section className="rounded-2xl border border-border/70 bg-card p-5">
        <h2 className="text-base font-semibold">Scheduled automation</h2>
        <p className="mt-2 text-sm text-muted-foreground">Activity shows that work was recorded, not that every scheduled run succeeded. A quiet period can also mean nothing needed doing. Run success is not currently tracked.</p>
        <ul className="mt-3 divide-y divide-border/60">{automation.map((item) => <li key={item.label} className="flex flex-wrap items-start justify-between gap-3 py-4">
          <div><p className="text-sm font-medium">{item.label}</p><p className="mt-1 text-xs text-muted-foreground">{item.schedule}</p><p className="mt-1 text-xs text-muted-foreground">{item.evidence}{item.iso ? ` · ${healthTimeAgo(item.iso, now)}` : ""}</p></div>
          <Status state="unknown">Run status unknown</Status>
        </li>)}</ul>
        <p className="mt-3 text-xs text-muted-foreground">Reminders currently run once a day. Two-hour alerts only cover jobs near that daily check.</p>
      </section>

      <section className="rounded-2xl border border-border/70 bg-card p-5">
        <h2 className="mb-3 text-base font-semibold">Notifications</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><Tile label="Sent · last 24 hours" value={h.notifications.last_24h_sent} /><Tile label="Failed · created in last 24 hours" value={h.notifications.last_24h_failed} /><Tile label="Queued · all time" value={h.notifications.pending} /></div>
        <p className="mt-3 text-xs text-muted-foreground">Sent means the notification was sent by the app; it does not confirm the person saw it.</p>
      </section>

      <section className="rounded-2xl border border-border/70 bg-card p-5">
        <h2 className="mb-3 text-base font-semibold">Browser notifications</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><Tile label="Active subscriptions" value={h.pushSubscriptions.active} /><Tile label="Disabled subscriptions" value={h.pushSubscriptions.inactive} /><Tile label="Active · registered 30+ days ago" value={h.pushSubscriptions.stale_30d} /></div>
        <p className="mt-3 text-xs text-muted-foreground">Registration age does not establish whether a browser is still in use. Subscriptions are disabled when their push endpoint reports it no longer exists.</p>
      </section>
    </main>
  );
}

function Tile({ label, value }: { label: string; value: number | null }) {
  return <div className="rounded-2xl border border-border/70 bg-card px-4 py-3"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 font-semibold tabular-nums ${value === null ? "text-sm text-muted-foreground" : "text-2xl"}`}>{value === null ? "Unavailable" : value.toLocaleString("en-US")}</p></div>;
}
