"use client";

import { FileText } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useState, useTransition } from "react";

import type { TeamMemberRecord } from "@/lib/queries/team";
import {
  toggleContractorFlagAction,
  toggleMemberActiveAction,
  updateMemberRoleAction,
} from "@/app/(admin)/dashboard/team/actions";
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
  // Controlled so a failed or cancelled change snaps back to the saved role.
  const [role, setRole] = useState(member.role);
  // The workspace owner isn't an editable role; changing or deactivating
  // that row from here would lock the owner out.
  const isOwner = member.role === "owner";

  function handleToggleActive() {
    if (member.active && !window.confirm(`Deactivate ${member.full_name}? They won't be able to sign in.`)) {
      return;
    }
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

  function handleToggleContractor() {
    const next = !member.is_1099_contractor;
    startTransition(async () => {
      const result = await toggleContractorFlagAction(member.id, next);
      if (result.error) showToast(result.error, "error");
      else showToast(next ? "Marked as 1099 contractor." : "Cleared contractor flag.");
    });
  }

  function handleRoleChange(next: string) {
    if (!window.confirm(`Change ${member.full_name}'s role to ${next}?`)) return;
    const landing = ROLE_LANDING[next] ?? "/dashboard";
    setRole(next);
    startTransition(async () => {
      const result = await updateMemberRoleAction(member.id, next);
      if (result.error) {
        setRole(member.role);
        showToast(result.error, "error");
      } else {
        showToast(`${member.full_name} is now ${next}. They'll land on ${landing}.`);
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

      {isOwner ? (
        <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary">
          Owner
        </span>
      ) : (
        <select
          aria-label={`Role for ${member.full_name}`}
          className="rounded-full border border-border bg-background px-3 py-1.5 text-sm focus:outline-none disabled:opacity-60"
          disabled={isPending}
          onChange={(e) => handleRoleChange(e.target.value)}
          value={role}
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      )}

      {member.role === "cleaner" && (
        <>
          <button
            aria-pressed={member.is_1099_contractor ?? false}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition hover:opacity-80 disabled:opacity-60 ${
              member.is_1099_contractor
                ? "border-amber-300 bg-amber-50 text-amber-800"
                : "border-border text-muted-foreground"
            }`}
            disabled={isPending}
            onClick={handleToggleContractor}
            type="button"
          >
            1099
          </button>
          <Link
            className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
            href={
              `/dashboard/payouts/export/${member.id}/${new Date().getFullYear()}` as Route
            }
            target="_blank"
          >
            <FileText className="h-3 w-3" />
            Annual export
          </Link>
        </>
      )}

      {!isOwner && (
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
      )}
    </div>
  );
}
