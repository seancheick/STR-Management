"use client";

import type { Route } from "next";
import Link from "next/link";
import { Banknote, Bell, CalendarDays, ClipboardList, Settings } from "lucide-react";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/jobs", label: "Jobs", icon: ClipboardList, exact: true },
  { href: "/jobs/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/jobs/inbox", label: "Inbox", icon: Bell },
  { href: "/jobs/pay", label: "Pay", icon: Banknote },
  { href: "/jobs/settings", label: "Settings", icon: Settings },
] as const;

export function CleanerNav({ unreadCount = 0 }: { unreadCount?: number }) {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-card/95 px-2 pb-3 pt-2 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur md:left-1/2 md:max-w-lg md:-translate-x-1/2 md:rounded-t-3xl md:border-x">
      <ul className="grid grid-cols-5 gap-1">
        {navItems.map((item) => {
          const { href, label, icon: Icon } = item;
          const exact = "exact" in item && item.exact;
          const active = exact ? pathname === href : pathname.startsWith(href);
          const isInbox = href === "/jobs/inbox";
          const showDot = isInbox && unreadCount > 0 && !active;
          return (
            <li key={href}>
              <Link
                className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-2 text-[11px] font-medium transition ${
                  active
                    ? "bg-primary text-[#f7f5ef]"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                href={href as Route}
              >
                <span className="relative">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {showDot && (
                    <span
                      aria-label={`${unreadCount} unread`}
                      className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-none text-white tabular-nums"
                    >
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </span>
                <span>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
