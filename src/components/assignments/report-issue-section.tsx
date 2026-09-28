"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";

import { uploadIssueMediaAction, type ReportIssueState } from "@/app/(cleaner)/jobs/actions";
import { shrinkPhoto } from "@/components/assignments/photo-upload-section";
import { keepValuesOnError, type WithSubmitted } from "@/lib/form-values";

type Props = {
  action: (state: ReportIssueState, formData: FormData) => Promise<ReportIssueState>;
  assignmentId: string;
  propertyId: string;
};

const initial: ReportIssueState = { status: "idle", message: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      className="inline-flex h-10 items-center justify-center rounded-full bg-destructive px-5 text-sm font-medium text-destructive-foreground transition hover:opacity-90 disabled:opacity-60"
      disabled={pending}
      type="submit"
    >
      {pending ? "Submitting…" : "Report issue"}
    </button>
  );
}

function FieldError({ errors }: { errors?: string[] }) {
  if (!errors?.length) return null;
  return <p className="text-xs text-destructive">{errors[0]}</p>;
}

/** Optional photo for a just-reported issue (uploadIssueMediaAction). */
function IssuePhotoAttach({
  issueId,
  assignmentId,
  propertyId,
}: {
  issueId: string;
  assignmentId: string;
  propertyId: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(0);

  function upload() {
    const picked = fileRef.current?.files?.[0];
    if (!picked) {
      setError("Choose a photo first.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const file = await shrinkPhoto(picked);
      const fd = new FormData();
      fd.set("media", file);
      try {
        const res = await uploadIssueMediaAction(issueId, assignmentId, propertyId, fd);
        if (!res.success) {
          setError(res.error ?? "Upload failed.");
          return;
        }
        setAdded((n) => n + 1);
        if (fileRef.current) fileRef.current.value = "";
      } catch {
        setError("Upload failed. Check your signal and try again.");
      }
    });
  }

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-xl bg-muted/50 p-3">
      <label className="text-sm font-medium" htmlFor={`issue-photo-${issueId}`}>
        Add a photo of the issue {added > 0 && <span className="text-green-700">· {added} added</span>}
      </label>
      <input
        accept="image/*"
        className="text-sm"
        id={`issue-photo-${issueId}`}
        ref={fileRef}
        type="file"
      />
      <button
        className="inline-flex h-10 items-center justify-center self-start rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        disabled={pending}
        onClick={upload}
        type="button"
      >
        {pending ? "Uploading…" : "Upload photo"}
      </button>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/** Remounts the form after each report so a cleaner can file more than one. */
export function ReportIssueSection(props: Props) {
  const [round, setRound] = useState(0);
  return (
    <ReportIssueForm
      key={round}
      {...props}
      onAnother={() => setRound((r) => r + 1)}
      startOpen={round > 0}
    />
  );
}

function ReportIssueForm({
  action,
  assignmentId,
  propertyId,
  onAnother,
  startOpen,
}: Props & { onAnother: () => void; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen);
  const [state, formAction] = useActionState(keepValuesOnError(action), initial as WithSubmitted<typeof initial>);

  // Collapse form after successful submit
  const showForm = open && state.status !== "success";

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Report an issue</h2>
        {state.status === "success" ? (
          <span className="text-sm text-green-600">Issue reported</span>
        ) : (
          <button
            className="text-sm text-muted-foreground underline-offset-2 hover:underline"
            onClick={() => setOpen((v) => !v)}
            type="button"
          >
            {open ? "Cancel" : "Report"}
          </button>
        )}
      </div>

      {state.status === "success" && (
        <>
          <p className="mt-2 text-sm text-muted-foreground">{state.message}</p>
          {state.issueId && (
            <IssuePhotoAttach
              assignmentId={assignmentId}
              issueId={state.issueId}
              propertyId={propertyId}
            />
          )}
          <button
            className="mt-3 text-sm font-medium text-primary underline-offset-2 hover:underline"
            onClick={onAnother}
            type="button"
          >
            Report another issue
          </button>
        </>
      )}

      {showForm && (
        <form action={formAction} className="mt-4 space-y-4">
          <input type="hidden" name="assignmentId" value={assignmentId} />
          <input type="hidden" name="propertyId" value={propertyId} />

          {/* Title */}
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="issue-title">
              Title <span className="text-destructive">*</span>
            </label>
            <input
              className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
              id="issue-title"
              defaultValue={state.submitted?.["title"]}
              name="title"
              placeholder="e.g. Broken towel rail in master bath"
              required
              type="text"
            />
            <FieldError errors={state.fieldErrors?.title} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {/* Type */}
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="issue-type">
                Type
              </label>
              <select
                className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
                defaultValue={state.submitted?.["issueType"] ?? "other"}
                id="issue-type"
                name="issueType"
              >
                <option value="cleaning">Cleaning</option>
                <option value="maintenance">Maintenance</option>
                <option value="damage">Damage</option>
                <option value="inventory">Inventory</option>
                <option value="access">Access</option>
                <option value="other">Other</option>
              </select>
            </div>

            {/* Severity */}
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="issue-severity">
                Severity
              </label>
              <select
                className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm"
                defaultValue={state.submitted?.["severity"] ?? "medium"}
                id="issue-severity"
                name="severity"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="issue-description">
              Description{" "}
              <span className="font-normal text-muted-foreground">(optional)</span>
            </label>
            <textarea
              className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm"
              id="issue-description"
              defaultValue={state.submitted?.["description"]}
              name="description"
              rows={3}
              placeholder="Describe what you found…"
            />
          </div>

          {state.status === "error" && state.message && (
            <p className="text-sm text-destructive">{state.message}</p>
          )}

          <SubmitButton />
        </form>
      )}
    </div>
  );
}
