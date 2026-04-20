"use client";

import { AlertTriangle, Bell, CheckSquare2, UserMinus } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export type HeaderBellCounts = {
  unassigned: number;
  atRisk: number;
  pendingReview: number;
  openIssues: number;
  criticalIssues: number;
};

type Props = {
  counts: HeaderBellCounts;
};

export function HeaderBell({ counts }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const total =
    counts.unassigned + counts.atRisk + counts.pendingReview + counts.openIssues;
  const hasCritical = counts.criticalIssues > 0;

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const items: Array<{
    href: Route;
    icon: typeof UserMinus;
    label: string;
    count: number;
    tone: "amber" | "red" | "purple" | "orange";
  }> = [];
  if (counts.unassigned > 0) {
    items.push({
      href: "/dashboard/assignments" as Route,
      icon: UserMinus,
      label: "Unassigned jobs",
      count: counts.unassigned,
      tone: "amber",
    });
  }
  if (counts.atRisk > 0) {
    items.push({
      href: "/dashboard/assignments" as Route,
      icon: AlertTriangle,
      label: "At-risk / overdue",
      count: counts.atRisk,
      tone: "red",
    });
  }
  if (counts.pendingReview > 0) {
    items.push({
      href: "/dashboard/review" as Route,
      icon: CheckSquare2,
      label: "Awaiting review",
      count: counts.pendingReview,
      tone: "purple",
    });
  }
  if (counts.openIssues > 0) {
    items.push({
      href: "/dashboard/issues" as Route,
      icon: AlertTriangle,
      label: hasCritical
        ? `Open issues (${counts.criticalIssues} critical)`
        : "Open issues",
      count: counts.openIssues,
      tone: hasCritical ? "red" : "orange",
    });
  }

  const toneClass: Record<string, string> = {
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-800",
    purple: "border-purple-200 bg-purple-50 text-purple-800",
    orange: "border-orange-200 bg-orange-50 text-orange-800",
  };

  return (
    <div className="relative" ref={ref}>
      <button
        aria-expanded={open}
        aria-label={`${total} item${total === 1 ? "" : "s"} need attention`}
        className="relative flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <Bell className="h-4 w-4" />
        {total > 0 && (
          <span
            className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white tabular-nums ${
              hasCritical ? "bg-red-600" : "bg-amber-500"
            }`}
          >
            {total > 99 ? "99+" : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-50 w-72 rounded-2xl border border-border/70 bg-card p-2 shadow-lg">
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
            Needs attention
          </p>
          {items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">
              All clear — nothing urgent right now.
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.label}>
                    <Link
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition hover:shadow-sm ${toneClass[item.tone]}`}
                      href={item.href}
                      onClick={() => setOpen(false)}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span className="flex-1 truncate">{item.label}</span>
                      <span className="rounded-full bg-white/60 px-2 py-0.5 text-xs font-semibold tabular-nums">
                        {item.count}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
