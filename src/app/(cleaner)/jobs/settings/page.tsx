import { Bell, Settings } from "lucide-react";

import { SignOutButton } from "@/components/auth/sign-out-button";
import { CleanerProfileForm } from "@/components/cleaner/cleaner-profile-form";
import { EnablePushButton } from "@/components/cleaner/enable-push-button";
import { requireRole } from "@/lib/auth/session";

export default async function CleanerSettingsPage() {
  const profile = await requireRole(["cleaner", "owner", "admin", "supervisor"]);

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-6 px-5 py-8">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">Settings</p>
        <h1 className="text-3xl font-semibold tracking-tight">Profile</h1>
      </header>

      <section className="rounded-2xl border border-border/70 bg-card p-5">
        <div className="mb-5 flex items-center gap-2">
          <Settings className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-base font-semibold">Account details</h2>
        </div>
        <CleanerProfileForm profile={profile} />
      </section>

      <section className="rounded-2xl border border-border/70 bg-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Bell className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-base font-semibold">Job notifications</h2>
        </div>
        <EnablePushButton />
      </section>

      <section className="rounded-2xl border border-border/70 bg-card p-5">
        <h2 className="mb-3 text-base font-semibold">Session</h2>
        <SignOutButton />
      </section>
    </main>
  );
}
