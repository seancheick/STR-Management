"use client";

import type { Route } from "next";
import Link from "next/link";
import { Banknote, CalendarDays, CheckCircle2, ClipboardList, Settings } from "lucide-react";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/jobs", label: "Jobs", icon: ClipboardList, exact: true },
  { href: "/jobs/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/jobs/history", label: "History", icon: CheckCircle2 },
  { href: "/jobs/pay", label: "Pay", icon: Banknote },
  { href: "/jobs/settings", label: "Settings", icon: Settings },
] as const;

export function CleanerNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-card/95 px-2 pb-3 pt-2 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur md:left-1/2 md:max-w-lg md:-translate-x-1/2 md:rounded-t-3xl md:border-x">
      <ul className="grid grid-cols-5 gap-1">
        {navItems.map((item) => {
          const { href, label, icon: Icon } = item;
          const exact = "exact" in item && item.exact;
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-2 text-[11px] font-medium transition ${
                  active
                    ? "bg-primary text-[#f7f5ef]"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                href={href as Route}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
