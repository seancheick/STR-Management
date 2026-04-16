import { requireRole } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
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
       assignment_photos ( id )`,
    )
    .eq("status", "completed_pending_review")
    .order("due_at", { ascending: true });

  if (error) throw new Error(error.message);

  return (assignments ?? []).map((a) => {
    const items = (a.assignment_checklist_items as { id: string; completed: boolean }[]) ?? [];
    const photos = (a.assignment_photos as { id: string }[]) ?? [];
    return {
      id: a.id,
      due_at: a.due_at,
      properties: a.properties as unknown as { name: string } | null,
      cleaners: a.cleaners as unknown as { full_name: string } | null,
      checklist_total: items.length,
      checklist_done: items.filter((i) => i.completed).length,
      photo_count: photos.length,
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
          <p className="mt-1 text-sm text-muted-foreground">Jobs waiting for your approval or re-clean decision.</p>
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
                  </div>
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
