import { Activity, AlertTriangle, CheckCircle2, Clock } from "lucide-react";

import { requireRole } from "@/lib/auth/session";
import { getHealthReport } from "@/lib/queries/health";

function ago(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function Tone({
  ok,
  children,
}: {
  ok: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex h-5 items-center gap-1 rounded-full px-2 text-[10px] font-semibold uppercase tracking-wider ${
        ok
          ? "bg-emerald-50 text-emerald-700"
          : "bg-red-50 text-red-700"
      }`}
    >
      {ok ? <CheckCircle2 className="h-2.5 w-2.5" /> : <AlertTriangle className="h-2.5 w-2.5" />}
      {children}
    </span>
  );
}

export default async function HealthPage() {
  await requireRole(["owner", "admin"]);
  const h = await getHealthReport();

  // Cron health: a cron is considered healthy if it ran within the expected window + slack
  const cronChecks = [
    { label: "iCal calendar sync", iso: h.crons.last_sync_calendars_at, slackHours: 28 },
    { label: "Due-soon reminders", iso: h.crons.last_send_reminders_at, slackHours: 28 },
    { label: "Recurring tasks", iso: h.crons.last_recurring_tasks_at, slackHours: 28 },
    { label: "Weekly digest", iso: h.crons.last_weekly_digest_at, slackHours: 8 * 24 },
  ];

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-10">
      <header>
        <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">Operations</p>
        <h1 className="mt-1.5 flex items-center gap-2 text-3xl font-semibold tracking-tight">
          <Activity className="h-7 w-7 text-primary" aria-hidden="true" />
          System health
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          One page to eyeball whether everything under the hood is still running.
        </p>
      </header>

      {/* Top KPIs */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile
          label="Properties"
          value={h.database.total_properties}
        />
        <Tile
          label="Active cleaners"
          value={h.database.total_active_cleaners}
        />
        <Tile
          label="Reservations"
          value={h.database.total_reservations.toLocaleString()}
        />
        <Tile
          label="Assignments"
          value={h.database.total_assignments.toLocaleString()}
        />
      </section>

      {/* Crons */}
      <section className="rounded-2xl border border-border/70 bg-card p-5">
        <h2 className="mb-3 text-base font-semibold">Cron jobs</h2>
        <ul className="divide-y divide-border/60">
          {cronChecks.map((c) => {
            const ok =
              c.iso !== null &&
              Date.now() - new Date(c.iso).getTime() < c.slackHours * 3_600_000;
            return (
              <li className="flex items-center justify-between gap-2 py-3" key={c.label}>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{c.label}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Last run: {ago(c.iso)}
                  </p>
                </div>
                <Tone ok={ok}>{ok ? "on track" : "stale"}</Tone>
              </li>
            );
          })}
        </ul>
      </section>

      {/* iCal sources */}
      <section className="rounded-2xl border border-border/70 bg-card p-5">
        <h2 className="mb-3 text-base font-semibold">iCal calendar sources</h2>
        {h.calendarSources.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active calendar sources connected yet.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {h.calendarSources.map((s) => {
              const ok = s.stale_hours !== null && s.stale_hours < 28;
              return (
                <li className="flex flex-col gap-1 py-3 md:flex-row md:items-center md:justify-between" key={s.id}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {s.property_name} <span className="font-normal text-muted-foreground">· {s.platform}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Last sync: {ago(s.last_synced_at)}
                      {s.sync_logs && (
                        <>
                          {" · "}
                          {s.sync_logs.events_found} events
                          {" · "}
                          {s.sync_logs.assignments_created} created
                          {s.sync_logs.conflict_count > 0 && ` · ${s.sync_logs.conflict_count} conflicts`}
                          {s.sync_logs.error_message && ` · ${s.sync_logs.error_message}`}
                        </>
                      )}
                    </p>
                  </div>
                  <Tone ok={ok}>{ok ? "healthy" : "stale"}</Tone>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Push subscriptions */}
      <section className="rounded-2xl border border-border/70 bg-card p-5">
        <h2 className="mb-3 text-base font-semibold">Web push</h2>
        <div className="grid grid-cols-3 gap-3">
          <Tile label="Active" value={h.pushSubscriptions.active} />
          <Tile label="Inactive / dead" value={h.pushSubscriptions.inactive} />
          <Tile label="Stale (30d+)" value={h.pushSubscriptions.stale_30d} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Inactive subscriptions are auto-disabled when their endpoints return 410/404.
          Stale ones are still marked active but haven&apos;t re-registered in 30 days — might be long-gone browsers.
        </p>
      </section>

      {/* Notifications 24h */}
      <section className="rounded-2xl border border-border/70 bg-card p-5">
        <h2 className="mb-3 text-base font-semibold">Notifications · last 24 hours</h2>
        <div className="grid grid-cols-3 gap-3">
          <Tile label="Delivered" value={h.notifications.last_24h_sent} />
          <Tile label="Failed" value={h.notifications.last_24h_failed} tone={h.notifications.last_24h_failed > 0 ? "red" : undefined} />
          <Tile label="Pending" value={h.notifications.pending} />
        </div>
      </section>

      {/* Assignment attention */}
      <section className="rounded-2xl border border-border/70 bg-card p-5">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-base font-semibold">Attention over the next week</h2>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <Tile
            label="Unassigned"
            tone={h.assignments.unassigned_next_7d > 0 ? "amber" : undefined}
            value={h.assignments.unassigned_next_7d}
          />
          <Tile
            label="Tight turns"
            tone={h.assignments.tight_turnovers_next_7d > 0 ? "amber" : undefined}
            value={h.assignments.tight_turnovers_next_7d}
          />
          <Tile
            label="Stuck in review"
            tone={h.assignments.stuck_pending_review > 0 ? "red" : undefined}
            value={h.assignments.stuck_pending_review}
          />
        </div>
      </section>
    </main>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "amber" | "red";
}) {
  const toneCls =
    tone === "red"
      ? "border-red-200 bg-red-50 text-red-900"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-900"
        : "border-border/70 bg-card";
  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneCls}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
