import { requireRole } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  summarizeReviewEvidence,
  type ReviewEvidenceIssue,
  type ReviewEvidenceNote,
} from "@/lib/services/review-evidence";
import { ReviewActionButtons } from "@/components/assignments/review-action-buttons";
import { CheckCircle2, Clock, User } from "lucide-react";

type PendingReviewJob = {
  id: string;
  due_at: string;
  properties: { name: string } | null;
  cleaners: { full_name: string } | null;
  checklist_total: number;
  checklist_done: number;
  photo_count: number;
  cleaner_notes: Array<{
    body: string;
    created_at: string;
    users?: { full_name: string } | null;
  }>;
  reported_issues: Array<{
    id: string;
    title: string;
    severity: string;
    status: string;
    description: string | null;
    created_at: string;
  }>;
};

async function listPendingReviewJobs(): Promise<PendingReviewJob[]> {
  const supabase = await createServerSupabaseClient();

  const { data: assignments, error } = await supabase
    .from("assignments")
    .select(
      `id, due_at,
       properties:property_id ( name ),
       cleaners:cleaner_id ( full_name ),
       assignment_checklist_items ( id, completed ),
       assignment_photos ( id ),
       assignment_notes ( id, note_type, body, created_at, users:user_id ( full_name ) ),
       issues ( id, title, severity, status, description, created_at )`,
    )
    .eq("status", "completed_pending_review")
    .order("due_at", { ascending: true });

  if (error) throw new Error(error.message);

  return (assignments ?? []).map((a) => {
    const items = (a.assignment_checklist_items as { id: string; completed: boolean }[]) ?? [];
    const photos = (a.assignment_photos as { id: string }[]) ?? [];
    const evidence = summarizeReviewEvidence({
      notes: ((a.assignment_notes as unknown) as ReviewEvidenceNote[]) ?? [],
      issues: ((a.issues as unknown) as ReviewEvidenceIssue[]) ?? [],
    });
    return {
      id: a.id,
      due_at: a.due_at,
      properties: a.properties as unknown as { name: string } | null,
      cleaners: a.cleaners as unknown as { full_name: string } | null,
      checklist_total: items.length,
      checklist_done: items.filter((i) => i.completed).length,
      photo_count: photos.length,
      cleaner_notes: evidence.cleanerNotes.map((note) => ({
        body: note.body,
        created_at: note.created_at,
        users: note.users ?? null,
      })),
      reported_issues: evidence.reportedIssues.map((issue) => ({
        id: issue.id,
        title: issue.title,
        severity: issue.severity,
        status: issue.status,
        description: issue.description ?? null,
        created_at: issue.created_at,
      })),
    };
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function ReviewQueuePage() {
  await requireRole(["owner", "admin", "supervisor"]);

  const jobs = await listPendingReviewJobs();

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-8 px-6 py-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight">Review queue</h1>
          <p className="mt-1 text-sm text-muted-foreground">Jobs waiting for a ready or re-clean decision.</p>
        </div>
        <span className="rounded-full border border-purple-200 bg-purple-50 px-4 py-1.5 text-sm font-semibold tabular-nums text-purple-700">
          {jobs.length} pending
        </span>
      </div>

      {jobs.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-[1.75rem] border border-dashed border-border bg-card/70 px-6 py-12 text-center">
          <CheckCircle2 className="h-10 w-10 text-green-500/60" />
          <div>
            <p className="font-semibold">All caught up</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">No jobs awaiting review right now.</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {jobs.map((job) => (
            <div
              key={job.id}
              className="rounded-[1.5rem] border border-border/70 bg-card p-6 shadow-sm transition duration-200 hover:shadow-md"
            >
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                {/* Job summary */}
                <div className="flex-1 space-y-1">
                  <p className="text-lg font-bold">{job.properties?.name ?? "Unknown property"}</p>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <User className="h-3.5 w-3.5" />
                    {job.cleaners?.full_name ?? "Unassigned"}
                  </p>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {formatDate(job.due_at)}
                  </p>

                  {/* Progress bar */}
                  {job.checklist_total > 0 && (
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-300"
                        style={{ width: `${Math.round((job.checklist_done / job.checklist_total) * 100)}%` }}
                      />
                    </div>
                  )}

                  {/* Progress indicators */}
                  <div className="mt-2 flex flex-wrap gap-3">
                    <span
                      className={
                        job.checklist_done === job.checklist_total && job.checklist_total > 0
                          ? "rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-medium text-green-700"
                          : "rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700"
                      }
                    >
                      Checklist {job.checklist_done}/{job.checklist_total}
                    </span>
                    <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                      {job.photo_count} photo{job.photo_count !== 1 ? "s" : ""}
                    </span>
                    {job.cleaner_notes.length > 0 && (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-700">
                        {job.cleaner_notes.length} note{job.cleaner_notes.length !== 1 ? "s" : ""}
                      </span>
                    )}
                    {job.reported_issues.length > 0 && (
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
                        {job.reported_issues.length} issue{job.reported_issues.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>

                  {(job.cleaner_notes.length > 0 || job.reported_issues.length > 0) && (
                    <div className="mt-4 space-y-3 rounded-2xl border border-border/70 bg-background/60 p-4">
                      {job.cleaner_notes.map((note) => (
                        <div key={`${note.created_at}-${note.body}`}>
                          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                            Cleaner note
                          </p>
                          <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{note.body}</p>
                        </div>
                      ))}
                      {job.reported_issues.map((issue) => (
                        <div
                          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2"
                          key={issue.id}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-medium text-amber-900">{issue.title}</p>
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700">
                              {issue.severity}
                            </span>
                          </div>
                          {issue.description && (
                            <p className="mt-1 text-xs leading-5 text-amber-800/80">
                              {issue.description}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Review actions */}
                <div className="w-full sm:w-64">
                  <ReviewActionButtons assignmentId={job.id} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
