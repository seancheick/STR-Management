"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, Check, Loader2 } from "lucide-react";

import { registerPush, unregisterPush } from "@/lib/notifications/push-client";

type Status = "unknown" | "granted" | "denied" | "prompt" | "subscribed" | "unsupported";

export function EnablePushButton() {
  const [status, setStatus] = useState<Status>("unknown");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window) || !("serviceWorker" in navigator)) {
      setStatus("unsupported");
      return;
    }

    // Prefer the permission state; if granted, check for an active subscription
    const perm = Notification.permission;
    if (perm === "denied") {
      setStatus("denied");
      return;
    }
    if (perm === "default") {
      setStatus("prompt");
      return;
    }

    navigator.serviceWorker.getRegistration("/sw.js").then(async (reg) => {
      if (!reg) {
        setStatus("prompt");
        return;
      }
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? "subscribed" : "granted");
    });
  }, []);

  async function enable() {
    setBusy(true);
    setError(null);
    const res = await registerPush();
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Could not enable notifications.");
      return;
    }
    setStatus("subscribed");
  }

  async function disable() {
    setBusy(true);
    await unregisterPush();
    setBusy(false);
    setStatus("granted");
  }

  if (status === "unsupported") {
    return (
      <p className="text-sm text-muted-foreground">
        Push notifications aren&apos;t supported on this browser. Use Chrome or Safari 16+.
      </p>
    );
  }

  if (status === "subscribed") {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-sm text-green-700">
          <Check className="h-4 w-4" aria-hidden="true" />
          Notifications are on — you&apos;ll get a ping when a job is assigned.
        </p>
        <button
          className="inline-flex h-9 items-center gap-2 rounded-full border border-border/70 px-3 text-xs font-medium text-muted-foreground hover:bg-muted"
          disabled={busy}
          onClick={disable}
          type="button"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <BellOff className="h-3 w-3" />}
          Turn off
        </button>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <p className="text-sm text-destructive">
        Notifications are blocked in your browser settings. Re-enable them for this site
        to get job pings on your phone.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-primary px-5 text-sm font-semibold text-[#f7f5ef] transition hover:opacity-95 disabled:opacity-60"
        disabled={busy}
        onClick={enable}
        type="button"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
        Enable job notifications
      </button>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <p className="text-xs text-muted-foreground">
        Get a push on your phone whenever a new job is assigned to you.
      </p>
    </div>
  );
}
