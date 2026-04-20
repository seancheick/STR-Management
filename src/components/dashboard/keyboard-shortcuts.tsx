"use client";

import { Keyboard, X } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Shortcut = {
  keys: string[];
  label: string;
  href?: Route;
};

const SHORTCUTS: Shortcut[] = [
  { keys: ["g", "t"], label: "Dashboard (today)", href: "/dashboard" as Route },
  { keys: ["g", "s"], label: "Schedule", href: "/dashboard/schedule" as Route },
  { keys: ["g", "a"], label: "Assignments", href: "/dashboard/assignments" as Route },
  { keys: ["g", "p"], label: "Properties", href: "/dashboard/properties" as Route },
  { keys: ["g", "i"], label: "Issues", href: "/dashboard/issues" as Route },
  { keys: ["g", "r"], label: "Review queue", href: "/dashboard/review" as Route },
  { keys: ["g", "y"], label: "Payout reports", href: "/dashboard/payouts" as Route },
  { keys: ["g", "c"], label: "Calendar sync", href: "/dashboard/calendar" as Route },
  { keys: ["?"], label: "Show / hide this help" },
];

/**
 * Global keyboard navigation for admins.
 * Uses "g, then x" chords (classic Gmail/Linear pattern) so single-letter
 * keys aren't stolen from typed text. "?" toggles the help overlay.
 */
export function KeyboardShortcuts() {
  const router = useRouter();
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [gLeader, setGLeader] = useState(false);

  useEffect(() => {
    let leaderTimer: number | undefined;

    function resetLeader() {
      setGLeader(false);
      if (leaderTimer) window.clearTimeout(leaderTimer);
    }

    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase() ?? "";
      const inInput =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        target?.isContentEditable;
      if (inInput) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setOverlayOpen((v) => !v);
        return;
      }

      if (e.key === "Escape" && overlayOpen) {
        setOverlayOpen(false);
        return;
      }

      if (!gLeader) {
        if (e.key === "g") {
          setGLeader(true);
          leaderTimer = window.setTimeout(resetLeader, 1500);
        }
        return;
      }

      // In "g" chord
      const match = SHORTCUTS.find(
        (s) => s.keys.length === 2 && s.keys[0] === "g" && s.keys[1] === e.key,
      );
      resetLeader();
      if (match?.href) {
        e.preventDefault();
        router.push(match.href);
        setOverlayOpen(false);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (leaderTimer) window.clearTimeout(leaderTimer);
    };
  }, [router, gLeader, overlayOpen]);

  if (!overlayOpen) return null;

  return (
    <div
      aria-label="Keyboard shortcuts"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/20 backdrop-blur-[2px]"
      onClick={() => setOverlayOpen(false)}
      role="dialog"
    >
      <div
        className="w-full max-w-md rounded-[1.75rem] border border-border/70 bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-lg font-semibold">Keyboard shortcuts</h2>
          </div>
          <button
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            onClick={() => setOverlayOpen(false)}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="mt-4 flex flex-col gap-2">
          {SHORTCUTS.map((s) => (
            <li className="flex items-center justify-between gap-3" key={s.label}>
              <span className="text-sm text-muted-foreground">{s.label}</span>
              <span className="flex items-center gap-1">
                {s.keys.map((k, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <kbd className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-md border border-border/70 bg-muted px-1.5 text-xs font-semibold text-foreground">
                      {k === "?" ? "?" : k.toUpperCase()}
                    </kbd>
                    {i < s.keys.length - 1 && (
                      <span className="text-xs text-muted-foreground">then</span>
                    )}
                  </span>
                ))}
              </span>
            </li>
          ))}
        </ul>

        <p className="mt-5 text-xs text-muted-foreground">
          Press <kbd className="inline-flex h-5 items-center rounded border px-1">?</kbd>{" "}
          any time to see this list.
        </p>
      </div>
    </div>
  );
}
