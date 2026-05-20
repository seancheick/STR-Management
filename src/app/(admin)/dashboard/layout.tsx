import Image from "next/image";

import { HeaderBell } from "@/components/dashboard/header-bell";
import { KeyboardShortcuts } from "@/components/dashboard/keyboard-shortcuts";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { requireRole } from "@/lib/auth/session";
import { getDashboardStats } from "@/lib/queries/assignments";
import { getExceptionCounts } from "@/lib/queries/issues";
import { getTenantBranding } from "@/lib/queries/tenant";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const [profile, stats, exceptions] = await Promise.all([
    requireRole(["owner", "admin", "supervisor"]),
    getDashboardStats(),
    getExceptionCounts(),
  ]);
  const branding = await getTenantBranding(profile.owner_id);

  const bellCounts = {
    unassigned: stats.unassigned,
    atRisk: stats.atRisk,
    pendingReview: stats.pendingReview,
    openIssues: exceptions.open_issues,
    criticalIssues: exceptions.critical_issues,
  };

  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar — fixed, full viewport height */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 lg:flex lg:flex-col">
        <SidebarNav branding={branding} />
      </aside>

      {/* Mobile top bar — branded with tenant logo + name */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-border/60 bg-card px-4 lg:hidden">
        <div className="flex min-w-0 items-center gap-2">
          {branding?.logoUrl ? (
            <Image
              alt=""
              className="h-7 w-7 shrink-0 rounded-lg object-cover"
              height={28}
              src={branding.logoUrl}
              unoptimized
              width={28}
            />
          ) : null}
          <p className="truncate font-semibold tracking-tight">
            {branding?.name ?? "TurnFlow"}
          </p>
        </div>
        <HeaderBell counts={bellCounts} />
      </header>

      {/* Desktop floating bell — top-right of the content area */}
      <div className="fixed right-6 top-4 z-30 hidden lg:block">
        <HeaderBell counts={bellCounts} />
      </div>

      {/* Global keyboard shortcuts — "g then x" chords + ? overlay */}
      <KeyboardShortcuts />

      {/* Content — offset for desktop sidebar, padded for mobile top bar */}
      <div className="flex w-full flex-col pt-14 lg:pl-60 lg:pt-0">
        {children}
      </div>
    </div>
  );
}
