"use client";

import { AlertCircle, CheckCircle2, Star, User, X } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";

import {
  assignCleanerAction,
  getCleanerSuggestionsAction,
  type CleanerSuggestion,
} from "@/app/actions/assignments";

type Props = {
  assignmentId: string;
  propertyName: string;
  dueAt: string;
  onClose: () => void;
  onAssigned: () => void;
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function AssignCleanerModal({
  assignmentId,
  propertyName,
  dueAt,
  onClose,
  onAssigned,
}: Props) {
  const [suggestions, setSuggestions] = useState<CleanerSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Load suggestions on mount
  useEffect(() => {
    setLoading(true);
    getCleanerSuggestionsAction(assignmentId)
      .then(setSuggestions)
      .finally(() => setLoading(false));
  }, [assignmentId]);

  // Close on Escape
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleAssign = useCallback(
    (cleanerId: string) => {
      setAssigning(cleanerId);
      setError(null);
      startTransition(async () => {
        const result = await assignCleanerAction(assignmentId, cleanerId);
        if (result.ok) {
          onAssigned();
        } else {
          setError(result.error ?? "Failed to assign cleaner.");
          setAssigning(null);
        }
      });
    },
    [assignmentId, onAssigned],
  );

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-foreground/25 backdrop-blur-[2px]"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Assign a cleaner"
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-[1.5rem] border border-border/70 bg-card shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border/60 px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">
              Assign cleaner
            </p>
            <h2 className="mt-0.5 text-base font-semibold leading-snug">{propertyName}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">Due {formatTime(dueAt)}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="max-h-80 overflow-y-auto px-3 py-3">
          {loading ? (
            <div className="flex flex-col gap-2 py-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : suggestions.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No active cleaners found.{" "}
              <a href="/dashboard/team" className="text-primary underline underline-offset-2">
                Add a cleaner →
              </a>
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {suggestions.map((c) => (
                <li key={c.id}>
                  <div
                    className={`flex items-center gap-3 rounded-xl px-3 py-3 ${
                      c.isAvailable ? "bg-background/60" : "opacity-60"
                    }`}
                  >
                    {/* Avatar */}
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        c.isDefault ? "bg-primary/15" : "bg-muted"
                      }`}
                    >
                      {c.isDefault ? (
                        <Star className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
                      ) : (
                        <User className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                      )}
                    </div>

                    {/* Name + status */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium leading-snug">{c.fullName}</p>
                      <p
                        className={`text-[11px] ${
                          c.isAvailable
                            ? c.isDefault
                              ? "text-primary/80"
                              : "text-green-600"
                            : "text-muted-foreground"
                        }`}
                      >
                        {c.isAvailable
                          ? c.isDefault
                            ? "Default cleaner · Available"
                            : "Available"
                          : (c.conflictReason ?? "Busy")}
                      </p>
                    </div>

                    {/* Assign button */}
                    <button
                      type="button"
                      disabled={!!assigning || isPending}
                      onClick={() => handleAssign(c.id)}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        assigning === c.id
                          ? "bg-primary/15 text-[#16423c]"
                          : c.isAvailable
                            ? "bg-primary text-[#f7f5ef] hover:opacity-90"
                            : "border border-border/70 text-muted-foreground hover:bg-muted"
                      } disabled:cursor-not-allowed disabled:opacity-50`}
                    >
                      {assigning === c.id ? "Assigning…" : "Assign"}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {error && (
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer hint */}
        {!loading && suggestions.some((c) => !c.isAvailable) && (
          <div className="border-t border-border/60 px-4 py-3">
            <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <CheckCircle2 className="h-3 w-3 text-green-500" aria-hidden="true" />
              Grayed-out cleaners have a conflict in this window — you can still assign them.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
