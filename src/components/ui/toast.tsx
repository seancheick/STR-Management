"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

export type ToastVariant = "success" | "error";
export type ToastPayload = {
  id: number;
  message: string;
  variant: ToastVariant;
};

const TOAST_EVENT = "str-ops-toast";
const AUTO_DISMISS_MS = 3200;

export function showToast(message: string, variant: ToastVariant = "success") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ToastPayload>(TOAST_EVENT, {
      detail: { id: Date.now() + Math.random(), message, variant },
    }),
  );
}

export function ToastHost() {
  const [toasts, setToasts] = useState<ToastPayload[]>([]);

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<ToastPayload>).detail;
      if (!detail) return;
      setToasts((prev) => [...prev, detail]);
      window.setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== detail.id));
      }, AUTO_DISMISS_MS);
    }
    window.addEventListener(TOAST_EVENT, handler);
    return () => window.removeEventListener(TOAST_EVENT, handler);
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-6 right-6 z-[100] flex flex-col items-end gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex animate-in slide-in-from-right-4 items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium shadow-xl duration-200 ${
            t.variant === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
          role="status"
        >
          {t.variant === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}
