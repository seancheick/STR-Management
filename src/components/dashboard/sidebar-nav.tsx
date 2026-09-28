"use client";

import {
  Activity,
  AlertTriangle,
  Banknote,
  BarChart3,
  Bell,
  Building2,
  CalendarDays,
  CheckSquare2,
  ClipboardList,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Settings as SettingsIcon,
  Users,
  X,
} from "lucide-react";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { signOutAction } from "@/app/actions/auth";
import type { TenantBranding } from "@/lib/queries/tenant";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/schedule", label: "Schedule", icon: RefreshCw, exact: false },
  { href: "/dashboard/assignments", label: "Assignments", icon: ClipboardList, exact: false },
  { href: "/dashboard/properties", label: "Properties", icon: Building2, exact: false, managerOnly: true },
  { href: "/dashboard/team", label: "Team", icon: Users, exact: false, managerOnly: true },
  { href: "/dashboard/templates", label: "Templates", icon: FileText, exact: false, managerOnly: true },
  { href: "/dashboard/issues", label: "Issues", icon: AlertTriangle, exact: false },
  { href: "/dashboard/review", label: "Review Queue", icon: CheckSquare2, exact: false },
  { href: "/dashboard/calendar", label: "Calendar Sync", icon: CalendarDays, exact: false },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3, exact: false },
  { href: "/dashboard/payouts", label: "Payouts", icon: Banknote, exact: false },
  { href: "/dashboard/notifications", label: "Notification log", icon: Bell, exact: false },
  { href: "/dashboard/health", label: "System health", icon: Activity, exact: false, managerOnly: true },
  { href: "/dashboard/settings", label: "Settings", icon: SettingsIcon, exact: false },
];

type NavProps = {
  branding: TenantBranding | null;
  /** Owners/admins. Supervisors can't open managerOnly pages, so hide them. */
  canManage: boolean;
};

export function SidebarNav({ branding, canManage }: NavProps) {
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex h-full flex-col border-r border-border/60 bg-card">
      {/* Brand — tenant logo + workspace name (falls back to TurnFlow) */}
      <div className="flex items-center gap-3 border-b border-border/60 px-5 py-5">
        {branding?.logoUrl ? (
          <Image
            alt=""
            className="h-9 w-9 shrink-0 rounded-xl object-cover"
            height={36}
            src={branding.logoUrl}
            unoptimized
            width={36}
          />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <span className="text-sm font-bold">
              {(branding?.name ?? "TurnFlow").slice(0, 1).toUpperCase()}
            </span>
          </div>
        )}
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
            Workspace
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold tracking-tight">
            {branding?.name ?? "TurnFlow"}
          </p>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Main navigation">
        <ul className="flex flex-col gap-0.5" role="list">
          {NAV_ITEMS.filter((item) => canManage || !("managerOnly" in item)).map(({ href, label, icon: Icon, exact }) => {
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

/**
 * Below lg the fixed sidebar is hidden, so phones and tablets (supervisors)
 * get the same nav in a slide-over drawer opened from the top bar.
 */
export function MobileNav({ branding, canManage }: NavProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        aria-expanded={open}
        aria-label="Open menu"
        className="-ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground/70 hover:bg-muted hover:text-foreground"
        onClick={() => setOpen(true)}
        type="button"
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-foreground/30"
            onClick={() => setOpen(false)}
          />
          {/* Any link tap navigates away, so close on anchor clicks */}
          <div
            className="relative h-full w-72 max-w-[85vw] shadow-xl"
            onClick={(e) => {
              if ((e.target as HTMLElement).closest("a")) setOpen(false);
            }}
          >
            <SidebarNav branding={branding} canManage={canManage} />
            <button
              aria-label="Close menu"
              className="absolute right-3 top-5 flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
              onClick={() => setOpen(false)}
              type="button"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
