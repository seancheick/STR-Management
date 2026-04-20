"use client";

import { AlertCircle, Clock, Loader2, MessageSquare, Send, Sparkles } from "lucide-react";
import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import {
  postJobMessageAction,
  type PostJobMessageState,
} from "@/app/actions/job-messages";
import type { JobMessageRecord } from "@/lib/queries/job-messages";
import { showToast } from "@/components/ui/toast";

const initial: PostJobMessageState = { status: "idle", message: null };

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type Props = {
  assignmentId: string;
  messages: JobMessageRecord[];
  /** Current user's id — used to right-align own bubbles. */
  currentUserId: string;
  /** Compact layout (no title, shorter input) — used inside the admin drawer. */
  compact?: boolean;
};

export function JobMessageThread({
  assignmentId,
  messages,
  currentUserId,
  compact,
}: Props) {
  const [state, formAction] = useActionState(postJobMessageAction, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
    } else if (state.status === "error" && state.message) {
      showToast(state.message, "error");
    }
  }, [state]);

  return (
    <section
      aria-label="Job messages"
      className={compact ? "flex flex-col gap-3" : "flex flex-col gap-4"}
    >
      {!compact && (
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <h2 className="text-lg font-semibold">Messages</h2>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {messages.length}
          </span>
        </div>
      )}

      <div
        className={`flex flex-col gap-3 overflow-y-auto rounded-2xl border border-border/70 bg-background/60 p-4 ${
          compact ? "max-h-64" : "max-h-96"
        }`}
        ref={scrollRef}
      >
        {messages.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            No messages yet. Say hello — the cleaner will see this on the job screen.
          </p>
        ) : (
          messages.map((m) => {
            const isOwn = m.author_id === currentUserId;
            const isSystem =
              m.message_type === "decline" ||
              m.message_type === "running_late" ||
              m.message_type === "system";

            if (isSystem) {
              return <SystemMessageRow key={m.id} message={m} />;
            }

            return (
              <div
                className={`flex flex-col gap-1 ${isOwn ? "items-end" : "items-start"}`}
                key={m.id}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-5 ${
                    isOwn
                      ? "bg-primary text-[#f7f5ef]"
                      : "border border-border/70 bg-card"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                </div>
                <p className="px-1 text-[10px] text-muted-foreground">
                  {m.author?.full_name ?? "Someone"} · {formatTime(m.created_at)}
                </p>
              </div>
            );
          })
        )}
      </div>

      <form action={formAction} className="flex flex-col gap-2" ref={formRef}>
        <input name="assignmentId" type="hidden" value={assignmentId} />
        <textarea
          className="min-h-12 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          maxLength={2000}
          name="body"
          placeholder="Write a message…"
          required
          rows={compact ? 2 : 3}
        />
        <SubmitButton />
      </form>
    </section>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-xs font-semibold text-[#f7f5ef] transition hover:opacity-90 disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <Send className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      Send
    </button>
  );
}

function SystemMessageRow({ message }: { message: JobMessageRecord }) {
  const icon =
    message.message_type === "decline" ? (
      <AlertCircle className="h-3 w-3" aria-hidden="true" />
    ) : message.message_type === "running_late" ? (
      <Clock className="h-3 w-3" aria-hidden="true" />
    ) : (
      <Sparkles className="h-3 w-3" aria-hidden="true" />
    );

  const color =
    message.message_type === "decline"
      ? "border-red-200 bg-red-50 text-red-800"
      : message.message_type === "running_late"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-border/70 bg-muted/50 text-muted-foreground";

  return (
    <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${color}`}>
      {icon}
      <span className="flex-1">
        <span className="font-medium">{message.author?.full_name ?? "Someone"}</span>{" "}
        {message.body}
      </span>
      <span className="text-[10px] opacity-60">
        {new Date(message.created_at).toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        })}
      </span>
    </div>
  );
}
