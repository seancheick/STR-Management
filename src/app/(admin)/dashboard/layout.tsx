import { HeaderBell } from "@/components/dashboard/header-bell";
import { SidebarNav } from "@/components/dashboard/sidebar-nav";
import { getDashboardStats } from "@/lib/queries/assignments";
import { getExceptionCounts } from "@/lib/queries/issues";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const [stats, exceptions] = await Promise.all([
    getDashboardStats(),
    getExceptionCounts(),
  ]);

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
        <SidebarNav />
      </aside>

      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center justify-between border-b border-border/60 bg-card px-4 lg:hidden">
        <p className="font-semibold tracking-tight">STR Manager</p>
        <HeaderBell counts={bellCounts} />
      </header>

      {/* Desktop floating bell — top-right of the content area */}
      <div className="fixed right-6 top-4 z-30 hidden lg:block">
        <HeaderBell counts={bellCounts} />
      </div>

      {/* Content — offset for desktop sidebar, padded for mobile top bar */}
      <div className="flex w-full flex-col pt-14 lg:pl-60 lg:pt-0">
        {children}
      </div>
    </div>
  );
}
