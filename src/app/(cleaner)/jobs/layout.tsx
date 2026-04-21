import type { ReactNode } from "react";

import { CleanerNav } from "@/components/cleaner/cleaner-nav";
import { requireRole } from "@/lib/auth/session";
import { countUnreadNotifications } from "@/lib/queries/notifications";

export default async function CleanerJobsLayout({
  children,
}: {
  children: ReactNode;
}) {
  const profile = await requireRole(["cleaner", "owner", "admin", "supervisor"]);
  const unread = await countUnreadNotifications(profile.id);

  return (
    <div className="min-h-screen pb-24">
      {children}
      <CleanerNav unreadCount={unread} />
    </div>
  );
}
