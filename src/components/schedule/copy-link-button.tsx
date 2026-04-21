"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Link as LinkIcon } from "lucide-react";

/** Copies a shareable URL for the current schedule view to the clipboard. */
export function CopyLinkButton({ href, label = "Share view" }: { href?: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimer.current !== null) {
        window.clearTimeout(resetTimer.current);
        resetTimer.current = null;
      }
    };
  }, []);

  async function onClick() {
    const url =
      href ??
      (typeof window !== "undefined"
        ? `${window.location.origin}${window.location.pathname}${window.location.search}`
        : "");
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (resetTimer.current !== null) window.clearTimeout(resetTimer.current);
      resetTimer.current = window.setTimeout(() => {
        setCopied(false);
        resetTimer.current = null;
      }, 1600);
    } catch {
      // Clipboard blocked (older Safari / no-permission). Fall back to prompt.
      window.prompt("Copy this URL:", url);
    }
  }

  return (
    <button
      className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/70 bg-card px-3 text-xs font-medium transition hover:bg-muted"
      onClick={onClick}
      title="Copy a direct link to this view — great for cleaners or co-hosts"
      type="button"
    >
      {copied ? (
        <>
          <Check className="h-3 w-3 text-green-600" aria-hidden="true" />
          Copied
        </>
      ) : (
        <>
          <LinkIcon className="h-3 w-3" aria-hidden="true" />
          {label}
        </>
      )}
    </button>
  );
}
