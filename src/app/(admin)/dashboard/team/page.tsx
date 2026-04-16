import { requireRole } from "@/lib/auth/session";
import { listAllTeamMembers } from "@/lib/queries/team";
import { TeamMemberRow } from "@/components/team/team-member-row";
import { InviteForm } from "@/components/team/invite-form";

export default async function TeamPage() {
  await requireRole(["owner", "admin"]);
  const members = await listAllTeamMembers();

  const active = members.filter((m) => m.active);
  const inactive = members.filter((m) => !m.active);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-10">
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">Admin</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">Team</h1>
      </div>

      {/* Invite form */}
      <section className="rounded-[1.5rem] border border-border/70 bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Invite team member</h2>
        <InviteForm />
      </section>

      {/* Active members */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Active</h2>
          <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium">
            {active.length}
          </span>
        </div>
        {active.length === 0 ? (
          <div className="rounded-[1.75rem] border border-dashed border-border bg-card/70 p-6 text-sm text-muted-foreground">
            No active team members yet.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {active.map((m) => (
              <TeamMemberRow key={m.id} member={m} />
            ))}
          </div>
        )}
      </section>

      {inactive.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-muted-foreground">Inactive</h2>
          <div className="flex flex-col gap-2">
            {inactive.map((m) => (
              <TeamMemberRow key={m.id} member={m} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
