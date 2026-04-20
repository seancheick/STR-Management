"use client";

import { useTransition } from "react";

import type { TeamMemberRecord } from "@/lib/queries/team";
import { toggleMemberActiveAction, updateMemberRoleAction } from "@/app/(admin)/dashboard/team/actions";
import { showToast } from "@/components/ui/toast";

const ROLES = ["cleaner", "supervisor", "admin"];
const ROLE_LANDING: Record<string, string> = {
  cleaner: "/jobs",
  supervisor: "/dashboard",
  admin: "/dashboard",
};

type Props = { member: TeamMemberRecord };

export function TeamMemberRow({ member }: Props) {
  const [isPending, startTransition] = useTransition();

  function handleToggleActive() {
    startTransition(async () => {
      const result = await toggleMemberActiveAction(member.id, !member.active);
      if (result.error) {
        showToast(result.error, "error");
      } else {
        showToast(
          member.active ? `${member.full_name} deactivated.` : `${member.full_name} reactivated.`,
        );
      }
    });
  }

  function handleRoleChange(role: string) {
    const landing = ROLE_LANDING[role] ?? "/dashboard";
    startTransition(async () => {
      const result = await updateMemberRoleAction(member.id, role);
      if (result.error) {
        showToast(result.error, "error");
      } else {
        showToast(`${member.full_name} is now ${role}. They'll land on ${landing}.`);
      }
    });
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-4 rounded-2xl border px-5 py-4 transition ${
        member.active
          ? "border-border/70 bg-card"
          : "border-border/40 bg-muted/30 opacity-60"
      }`}
    >
      <div className="flex-1 space-y-0.5">
        <p className="font-medium">{member.full_name}</p>
        <p className="text-sm text-muted-foreground">{member.email}</p>
        {member.phone && (
          <p className="text-xs text-muted-foreground">{member.phone}</p>
        )}
      </div>

      <select
        className="rounded-full border border-border bg-background px-3 py-1.5 text-sm focus:outline-none disabled:opacity-60"
        defaultValue={member.role}
        disabled={isPending}
        onChange={(e) => handleRoleChange(e.target.value)}
      >
        {ROLES.map((r) => (
          <option key={r} value={r}>{r}</option>
        ))}
      </select>

      <button
        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition hover:opacity-80 disabled:opacity-60 ${
          member.active
            ? "border-destructive/30 text-destructive"
            : "border-green-300 text-green-700"
        }`}
        disabled={isPending}
        onClick={handleToggleActive}
        type="button"
      >
        {member.active ? "Deactivate" : "Reactivate"}
      </button>
    </div>
  );
}
