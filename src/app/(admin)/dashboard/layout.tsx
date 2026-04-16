import { SidebarNav } from "@/components/dashboard/sidebar-nav";

type DashboardLayoutProps = {
  children: React.ReactNode;
};

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="flex min-h-dvh">
      {/* Desktop sidebar — fixed, full viewport height */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 lg:flex lg:flex-col">
        <SidebarNav />
      </aside>

      {/* Mobile top bar */}
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center border-b border-border/60 bg-card px-4 lg:hidden">
        <p className="font-semibold tracking-tight">STR Manager</p>
      </header>

      {/* Content — offset for desktop sidebar, padded for mobile top bar */}
      <div className="flex w-full flex-col pt-14 lg:pl-60 lg:pt-0">
        {children}
      </div>
    </div>
  );
}
