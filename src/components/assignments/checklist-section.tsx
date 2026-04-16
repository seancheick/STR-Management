"use client";

import { useTransition } from "react";

import { toggleChecklistItemAction } from "@/app/(cleaner)/jobs/actions";
import type { AssignmentChecklistItemRecord } from "@/lib/queries/assignments";

type ChecklistSectionProps = {
  assignmentId: string;
  section: string;
  items: AssignmentChecklistItemRecord[];
  readOnly: boolean;
};

export function ChecklistSection({
  assignmentId,
  section,
  items,
  readOnly,
}: ChecklistSectionProps) {
  const [isPending, startTransition] = useTransition();

  function handleToggle(itemId: string, checked: boolean) {
    if (readOnly) return;
    startTransition(async () => {
      await toggleChecklistItemAction(itemId, assignmentId, checked);
    });
  }

  return (
    <div className="rounded-[1.5rem] border border-border/70 bg-card p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {section}
      </h3>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.id} className="flex items-start gap-3">
            <input
              checked={item.completed}
              className="mt-0.5 h-5 w-5 flex-shrink-0 cursor-pointer accent-primary disabled:opacity-50"
              disabled={readOnly || isPending}
              id={item.id}
              onChange={(e) => handleToggle(item.id, e.target.checked)}
              type="checkbox"
            />
            <label
              className={`flex flex-col gap-0.5 text-sm leading-snug ${
                item.completed ? "line-through text-muted-foreground" : ""
              } ${!readOnly ? "cursor-pointer" : ""}`}
              htmlFor={item.id}
            >
              <span>
                {item.label}
                {item.required && !item.completed && (
                  <span className="ml-1 text-xs text-destructive">*</span>
                )}
              </span>
              {item.photo_category && (
                <span className="text-xs text-muted-foreground">
                  Photo required: {item.photo_category}
                </span>
              )}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
