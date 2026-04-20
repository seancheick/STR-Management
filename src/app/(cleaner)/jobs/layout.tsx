import type { ReactNode } from "react";

import { CleanerNav } from "@/components/cleaner/cleaner-nav";

export default function CleanerJobsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen pb-24">
      {children}
      <CleanerNav />
    </div>
  );
}
