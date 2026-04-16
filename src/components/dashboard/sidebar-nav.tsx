"use client";

import {
  AlertTriangle,
  Banknote,
  Bell,
  Building2,
  CalendarDays,
  CheckSquare2,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Users,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";

import { signOutAction } from "@/app/actions/auth";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/assignments", label: "Assignments", icon: ClipboardList, exact: false },
  { href: "/dashboard/properties", label: "Properties", icon: Building2, exact: false },
  { href: "/dashboard/team", label: "Team", icon: Users, exact: false },
  { href: "/dashboard/templates", label: "Templates", icon: FileText, exact: false },
  { href: "/dashboard/issues", label: "Issues", icon: AlertTriangle, exact: false },
  { href: "/dashboard/review", label: "Review Queue", icon: CheckSquare2, exact: false },
  { href: "/dashboard/calendar", label: "Calendar Sync", icon: CalendarDays, exact: false },
  { href: "/dashboard/payouts", label: "Payouts", icon: Banknote, exact: false },
  { href: "/dashboard/notifications", label: "Notifications", icon: Bell, exact: false },
];

export function SidebarNav() {
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex h-full flex-col border-r border-border/60 bg-card">
      {/* Brand */}
      <div className="border-b border-border/60 px-5 py-5">
        <p className="text-xs font-medium uppercase tracking-[0.25em] text-muted-foreground">
          Ops Portal
        </p>
        <p className="mt-0.5 text-lg font-semibold tracking-tight">STR Manager</p>
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
        <ul className="flex flex-col gap-0.5" role="list">
          {NAV_ITEMS.map(({ href, label, icon: Icon, exact }) => {
            const isActive = exact
              ? pathname === href
              : pathname.startsWith(href);
            return (
              <li key={href}>
                <Link
                  href={href as Route}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-150 ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-foreground/70 hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Sign out */}
      <div className="border-t border-border/60 px-3 py-4">
        <button
          className="flex w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-foreground/60 transition-colors duration-150 hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isPending}
          onClick={() => startTransition(() => { signOutAction(); })}
          type="button"
        >
          <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
          {isPending ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </div>
  );
}
