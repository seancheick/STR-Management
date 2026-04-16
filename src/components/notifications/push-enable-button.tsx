"use client";

import { useState } from "react";
import { registerPush } from "@/lib/notifications/push-client";

export function PushEnableButton() {
  const [status, setStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  // Don't render on server or if push not supported
  if (typeof window !== "undefined" && !("PushManager" in window)) {
    return null;
  }

  async function handleEnable() {
    setStatus("pending");
    setMessage(null);
    const result = await registerPush();
    if (result.ok) {
      setStatus("success");
      setMessage("Push notifications enabled.");
    } else {
      setStatus("error");
      setMessage(result.error ?? "Failed to enable push.");
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        className="inline-flex h-10 items-center rounded-full bg-primary px-5 text-sm font-medium text-[#f7f5ef] transition hover:opacity-90 disabled:opacity-60"
        disabled={status === "pending" || status === "success"}
        onClick={handleEnable}
        type="button"
      >
        {status === "pending"
          ? "Enabling…"
          : status === "success"
          ? "Enabled"
          : "Enable push notifications"}
      </button>
      {message && (
        <p className={`text-xs ${status === "error" ? "text-destructive" : "text-green-600"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
