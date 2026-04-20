"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

import type { TeamMemberRecord } from "@/lib/queries/team";
import {
  AssignmentEditForm,
  type EditableAssignment,
} from "@/components/schedule/assignment-edit-form";

type AssignmentForSheet = EditableAssignment & {
  properties?: { name: string } | null;
};

type Props = {
  assignment: AssignmentForSheet | null;
  cleaners: TeamMemberRecord[];
  onClose: () => void;
  title?: string;
};

/**
 * Right-side slide-in sheet containing the shared AssignmentEditForm.
 * Used by the Assignments list, the Schedule grid, and the Dashboard calendar
 * so every "open assignment" surface behaves identically.
 */
export function AssignmentDrawerSheet({
  assignment,
  cleaners,
  onClose,
  title,
}: Props) {
  useEffect(() => {
    if (!assignment) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [assignment, onClose]);

  if (!assignment) return null;

  return (
    <>
      <div
        aria-hidden="true"
        className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside
        aria-label={title ?? "Edit assignment"}
        aria-modal="true"
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md animate-in slide-in-from-right-4 flex-col overflow-y-auto bg-card shadow-2xl duration-200"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4 border-b border-border/60 px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              {title ?? "Edit assignment"}
            </p>
            <h2 className="mt-0.5 text-lg font-semibold">
              {assignment.properties?.name ?? "Assignment"}
            </h2>
          </div>
          <button
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
            onClick={onClose}
            type="button"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 px-5 py-5">
          <AssignmentEditForm
            assignment={assignment}
            cleaners={cleaners}
            onCancel={onClose}
            onDeleted={onClose}
            onSaved={onClose}
          />
        </div>
      </aside>
    </>
  );
}
