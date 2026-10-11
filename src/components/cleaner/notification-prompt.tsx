"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { EnablePushButton } from "@/components/cleaner/enable-push-button";

/** One reminder per device/account, shared across every cleaner route. */
export function NotificationPrompt({ userId }: { userId: string }) {
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState<string>("unknown");
  const storageKey = `turnflow.notifications.dismissed.${userId}`;

  useEffect(() => {
    if (!window.matchMedia("(max-width: 767px)").matches) return;
    try {
      const dismissed = Number(localStorage.getItem(storageKey));
      if (dismissed && Date.now() - dismissed < 14 * 24 * 60 * 60 * 1000) return;
    } catch { /* Storage may be disabled; the reminder still works. */ }
    const timer = window.setTimeout(() => setVisible(true), 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  function dismiss() {
    try { localStorage.setItem(storageKey, String(Date.now())); } catch { /* Optional persistence. */ }
    setVisible(false);
  }

  if (!visible || status === "subscribed" || status === "unsupported") return null;

  return (
    <aside aria-label="Job notification reminder" className="mx-auto max-w-lg px-5 pt-5">
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="mb-3 flex items-start gap-3">
          <Bell aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div>
            <h2 className="text-sm font-semibold">Stay on top of your cleanings</h2>
            <p className="mt-1 text-sm text-muted-foreground">Get an alert when a cleaning is assigned to you, then accept or decline from your phone.</p>
          </div>
        </div>
        <EnablePushButton onStatusChange={setStatus} />
        <button type="button" onClick={dismiss} className="mt-2 min-h-11 w-full rounded-full px-4 text-sm font-medium text-muted-foreground hover:bg-muted">Not now</button>
        <p className="text-center text-xs text-muted-foreground">You can also enable notifications in Settings.</p>
      </div>
    </aside>
  );
}
