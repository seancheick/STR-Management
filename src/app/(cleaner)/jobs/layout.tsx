import { LiveJobUpdates } from "@/components/shared/live-job-updates";
import type { ReactNode } from "react";

import { CleanerNav } from "@/components/cleaner/cleaner-nav";
import { NotificationPrompt } from "@/components/cleaner/notification-prompt";
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
      <LiveJobUpdates ownerId={profile.owner_id} userId={profile.id} cleanerId={profile.cleanerId??profile.id} cleaner />
      {profile.role === "cleaner" && <NotificationPrompt userId={profile.id} />}
      {children}
      <CleanerNav unreadCount={unread} />
    </div>
  );
}
