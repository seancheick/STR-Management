import Link from "next/link";
import type { Route } from "next";
import { Bell, Inbox } from "lucide-react";

import { InboxAcceptDecline } from "@/components/cleaner/inbox-accept-decline";
import { requireRole } from "@/lib/auth/session";
import { listNotificationsForCleaner } from "@/lib/queries/notifications";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.round(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function CleanerInboxPage() {
  const profile = await requireRole(["cleaner", "owner", "admin", "supervisor"]);
  const notifications = await listNotificationsForCleaner(profile.id, 50);

  // Visiting the inbox implicitly marks everything as seen. We use the
  // service client because RLS would otherwise block the update (cleaners
  // don't have update rights on the notifications table directly). The
  // eq on recipient_id scopes it so one cleaner can never clear another's.
  try {
    const supabase = createServiceSupabaseClient();
    await supabase
      .from("notifications")
      .update({ seen_at: new Date().toISOString() })
      .eq("recipient_id", profile.id)
      .is("seen_at", null);
  } catch {
    // non-blocking — a failed mark-as-seen shouldn't prevent rendering
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-5 py-8">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">Inbox</p>
        <h1 className="text-3xl font-semibold tracking-tight">Notifications</h1>
      </header>

      {notifications.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border bg-card/70 px-6 py-12 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground/40" aria-hidden="true" />
          <div>
            <p className="font-semibold">No notifications yet</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              You&apos;ll see new job assignments and updates here.
            </p>
          </div>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {notifications.map((n) => {
            const href: Route = n.assignment_id
              ? (`/jobs/${n.assignment_id}` as Route)
              : ("/jobs" as Route);
            const showActions =
              n.assignment_id &&
              n.assignment?.status === "assigned" &&
              n.assignment?.ack_status === "pending" &&
              n.assignment?.cleaner_id === profile.id;
            return (
              <li
                className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-sm"
                key={n.id}
              >
                <Link
                  className="flex items-start gap-3 transition hover:opacity-90"
                  href={href}
                >
                  <span
                    className={`mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      n.status === "sent"
                        ? "bg-emerald-50 text-emerald-700"
                        : n.status === "failed"
                          ? "bg-red-50 text-red-700"
                          : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    <Bell className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{n.title}</p>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {formatWhen(n.created_at)}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm leading-5 text-muted-foreground">
                      {n.body}
                    </p>
                  </div>
                </Link>
                {/* Accept/Decline sits OUTSIDE the anchor so the buttons
                    aren't nested inside a link (invalid HTML). */}
                {showActions && (
                  <div className="pl-11">
                    <InboxAcceptDecline assignmentId={n.assignment_id!} />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
