import { requireRole } from "@/lib/auth/session";
import { listRecentNotifications, getNotificationStats } from "@/lib/queries/notifications";
import { PushEnableButton } from "@/components/notifications/push-enable-button";

const statusColors: Record<string, string> = {
  sent: "bg-green-100 text-green-700",
  failed: "bg-red-100 text-red-700",
  pending: "bg-yellow-100 text-yellow-700",
  skipped: "bg-slate-100 text-slate-600",
};

const typeLabels: Record<string, string> = {
  new_assignment: "New job",
  reminder_24h: "24h reminder",
  reminder_2h: "2h reminder",
  overdue: "Overdue",
  sla_breach: "SLA breach",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function NotificationsPage() {
  await requireRole(["owner", "admin", "supervisor"]);

  const [notifications, stats] = await Promise.all([
    listRecentNotifications(50),
    getNotificationStats(),
  ]);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">Diagnostics</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">Notification log</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Push notifications the system sent to cleaners and supervisors
            (new-job alerts, reminders, overdue warnings). Check here if someone
            says they didn&apos;t get an alert — <span className="font-medium">Delivered</span>
            {" "}means the cleaner&apos;s device acknowledged it,
            {" "}<span className="font-medium">Failed</span> usually means push is disabled on
            their browser, and <span className="font-medium">Pending</span> means it&apos;s queued
            for the next cron run.
          </p>
        </div>
        <PushEnableButton />
      </div>

      {/* Stats */}
      <section className="grid gap-4 md:grid-cols-4">
        {[
          { label: "Total sent", value: stats.total },
          { label: "Delivered", value: stats.sent },
          { label: "Failed", value: stats.failed },
          { label: "Pending", value: stats.pending },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-[1.5rem] border border-border/70 bg-card p-5 shadow-sm"
          >
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className="mt-3 text-3xl font-semibold">{s.value}</p>
          </div>
        ))}
      </section>

      {/* Notification log */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Recent notifications</h2>

        {notifications.length === 0 ? (
          <div className="rounded-[1.75rem] border border-dashed border-border bg-card/70 p-6">
            <p className="text-sm text-muted-foreground">No notifications yet.</p>
          </div>
        ) : (
          <div className="rounded-[1.75rem] border border-border/70 bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Recipient</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Title</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {notifications.map((n) => (
                  <tr key={n.id}>
                    <td className="px-5 py-3 font-medium">
                      {n.recipient?.full_name ?? "—"}
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">
                      {typeLabels[n.notification_type] ?? n.notification_type}
                    </td>
                    <td className="px-5 py-3 max-w-xs truncate">{n.title}</td>
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[n.status] ?? "bg-muted text-muted-foreground"}`}
                      >
                        {n.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground whitespace-nowrap">
                      {formatDate(n.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
