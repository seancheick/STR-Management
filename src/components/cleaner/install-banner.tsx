"use client";

import { useEffect, useState } from "react";
import { Smartphone, X } from "lucide-react";

// Chrome / Edge fire this event instead of showing the default install prompt.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const STORAGE_KEY = "turnflow.install-banner.dismissed";

export function InstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Already installed?
    const displayMode = window.matchMedia("(display-mode: standalone)").matches;
    const iosStandalone =
      "standalone" in window.navigator &&
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (displayMode || iosStandalone) {
      setStandalone(true);
      return;
    }

    // User dismissed it recently?
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const ts = Number(raw);
      // Re-show after 14 days
      if (Date.now() - ts < 14 * 24 * 60 * 60 * 1000) return;
    }

    setDismissed(false);

    // iOS detection (no beforeinstallprompt event on Safari)
    const ua = window.navigator.userAgent;
    if (/iPhone|iPad|iPod/.test(ua) && !/CriOS|FxiOS/.test(ua)) {
      setIsIos(true);
      return;
    }

    // Android / desktop PWA install event
    function onBefore(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onBefore);
    return () => window.removeEventListener("beforeinstallprompt", onBefore);
  }, []);

  if (standalone || dismissed) return null;
  if (!deferredPrompt && !isIos) return null;

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
    setDismissed(true);
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    dismiss();
  }

  return (
    <div className="fixed inset-x-0 bottom-20 z-30 mx-auto w-full max-w-md px-4">
      <div className="flex items-start gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-lg">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Smartphone className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          {isIos ? (
            <>
              <p className="text-sm font-semibold">Add TurnFlow to your home screen</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                Tap <span className="font-semibold">Share</span> in Safari, then
                <span className="font-semibold"> Add to Home Screen</span>. Push
                notifications need this on iPhone.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold">Install TurnFlow on your phone</p>
              <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                One-tap install so job alerts land on your lock screen, not just
                in the browser tab.
              </p>
              <button
                className="mt-2 inline-flex h-9 items-center gap-2 rounded-full bg-primary px-3 text-xs font-semibold text-[#f7f5ef]"
                onClick={install}
                type="button"
              >
                Install app
              </button>
            </>
          )}
        </div>
        <button
          aria-label="Dismiss"
          className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
          onClick={dismiss}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
