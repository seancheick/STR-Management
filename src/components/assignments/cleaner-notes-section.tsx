"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";

import type { CleanerNoteState } from "@/app/(cleaner)/jobs/actions";
import type { ReviewEvidenceNote } from "@/lib/services/review-evidence";

type Props = {
  action: (state: CleanerNoteState, formData: FormData) => Promise<CleanerNoteState>;
  assignmentId: string;
  notes: ReviewEvidenceNote[];
  readOnly: boolean;
};

const initial: CleanerNoteState = { status: "idle", message: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="inline-flex h-10 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-[#f7f5ef] transition hover:opacity-90 disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Saving…" : "Add note"}
    </button>
  );
}

function formatNoteDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CleanerNotesSection({ action, assignmentId, notes, readOnly }: Props) {
  const router = useRouter();
  const [state, formAction] = useActionState(action, initial);

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
    }
  }, [router, state.status]);

  return (
    <section className="rounded-2xl border border-border/70 bg-card p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">Cleaner notes</h2>
        {state.status === "success" && (
          <span className="text-sm text-green-600">{state.message}</span>
        )}
      </div>

      {notes.length > 0 ? (
        <div className="mt-4 flex flex-col gap-3">
          {notes.map((note) => (
            <article
              className="rounded-xl border border-border/70 bg-background/60 px-4 py-3"
              key={`${note.created_at}-${note.body}`}
            >
              <p className="whitespace-pre-wrap text-sm leading-6">{note.body}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {note.users?.full_name ?? "Cleaner"} · {formatNoteDate(note.created_at)}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          No cleaner notes yet.
        </p>
      )}

      {!readOnly && (
        <form action={formAction} className="mt-4 space-y-3">
          <input name="assignmentId" type="hidden" value={assignmentId} />
          <textarea
            className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm"
            maxLength={1000}
            name="body"
            placeholder="Add anything the manager should know before the next guest arrives."
            rows={3}
          />
          {state.status === "error" && (
            <p className="text-sm text-destructive">
              {state.fieldErrors?.body?.[0] ?? state.message}
            </p>
          )}
          <SubmitButton />
        </form>
      )}
    </section>
  );
}
