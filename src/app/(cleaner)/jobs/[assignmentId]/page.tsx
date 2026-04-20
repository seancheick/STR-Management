import Link from "next/link";
import { notFound } from "next/navigation";
import { Info } from "lucide-react";

import { requireRole } from "@/lib/auth/session";
import { getAssignmentDetail } from "@/lib/queries/assignments";
import { listInventoryForProperty } from "@/lib/queries/issues";
import { listJobMessages } from "@/lib/queries/job-messages";
import { getProperty } from "@/lib/queries/properties";
import { JobMessageThread } from "@/components/chat/job-message-thread";
import { JobQuickActions } from "@/components/cleaner/job-quick-actions";
import { AccessCodeCard } from "@/components/cleaner/access-code-card";
import { addCleanerNoteAction, reportIssueAction, requestRestockAction } from "@/app/(cleaner)/jobs/actions";
import { summarizeReviewEvidence } from "@/lib/services/review-evidence";
import { ChecklistSection } from "@/components/assignments/checklist-section";
import { PhotoUploadSection } from "@/components/assignments/photo-upload-section";
import { CompleteJobButton } from "@/components/assignments/complete-job-button";
import { CleanerNotesSection } from "@/components/assignments/cleaner-notes-section";
import { ReportIssueSection } from "@/components/assignments/report-issue-section";
import { RestockRequestSection } from "@/components/assignments/restock-request-section";

type JobExecutionPageProps = {
  params: Promise<{ assignmentId: string }>;
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function JobExecutionPage({ params }: JobExecutionPageProps) {
  const profile = await requireRole(["cleaner", "owner", "admin", "supervisor"]);
  const { assignmentId } = await params;

  const assignment = await getAssignmentDetail(assignmentId);

  if (!assignment) {
    notFound();
  }

  const [inventoryItems, propertyResult, messages] = await Promise.all([
    listInventoryForProperty(assignment.property_id),
    getProperty(assignment.property_id),
    listJobMessages(assignmentId),
  ]);
  const cleanerNotes = propertyResult.data?.cleaner_notes ?? null;

  // Cleaners can only see their own jobs
  if (profile.role === "cleaner" && assignment.cleaner_id !== profile.id) {
    notFound();
  }

  const isExecutable = assignment.status === "in_progress";
  const isReadOnly = !isExecutable;

  // Group checklist items by section
  const sections = assignment.checklist_items.reduce<
    Map<string, typeof assignment.checklist_items>
  >((acc, item) => {
    const section = item.section_name ?? "General";
    if (!acc.has(section)) acc.set(section, []);
    acc.get(section)!.push(item);
    return acc;
  }, new Map());

  // Derive required photo categories from checklist items
  const requiredPhotoCategories = Array.from(
    new Set(
      assignment.checklist_items
        .filter((item) => item.required && item.photo_category !== null)
        .map((item) => item.photo_category as string),
    ),
  );

  const uploadedCategories = new Set(assignment.photos.map((p) => p.photo_category));
  const completedCount = assignment.checklist_items.filter((i) => i.completed).length;
  const totalCount = assignment.checklist_items.length;
  const requiredCount = assignment.checklist_items.filter((i) => i.required).length;
  const requiredDoneCount = assignment.checklist_items.filter(
    (i) => i.required && i.completed,
  ).length;
  const evidence = summarizeReviewEvidence({
    notes: assignment.notes,
    issues: assignment.issues,
  });

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-5 py-8">
      <div className="flex flex-col gap-2">
        <Link className="text-sm text-muted-foreground" href="/jobs">
          ← Back to jobs
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">
          {assignment.properties?.name ?? "Job"}
        </h1>
        <p className="text-sm text-muted-foreground">Due: {formatDate(assignment.due_at)}</p>
      </div>

      {/* Quick actions — maps, running late, decline */}
      <JobQuickActions
        address={[
          assignment.properties?.address_line_1,
          assignment.properties?.city,
        ]
          .filter(Boolean)
          .join(", ") || null}
        assignmentId={assignmentId}
        status={assignment.status}
      />

      {/* Access code — door / gate code for this booking */}
      {assignment.access_code && (
        <AccessCodeCard accessCode={assignment.access_code} />
      )}

      {/* Cleaner notes — property-specific instructions */}
      {cleanerNotes && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-2">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-amber-800">
                Read first
              </p>
              <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-amber-900">
                {cleanerNotes}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Progress summary */}
      <section className="rounded-2xl border border-border/70 bg-card p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Checklist progress</span>
          <span className="font-semibold">
            {completedCount}/{totalCount}
            {requiredCount > 0 ? ` (${requiredDoneCount}/${requiredCount} required)` : ""}
          </span>
        </div>
        {totalCount > 0 && (
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${(completedCount / totalCount) * 100}%` }}
            />
          </div>
        )}
      </section>

      {/* Checklist */}
      {sections.size > 0 ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Checklist</h2>
          {Array.from(sections.entries()).map(([section, items]) => (
            <ChecklistSection
              key={section}
              assignmentId={assignmentId}
              section={section}
              items={items}
              readOnly={isReadOnly}
            />
          ))}
        </section>
      ) : (
        <section className="rounded-[1.5rem] border border-dashed border-border bg-card/70 p-5">
          <p className="text-sm text-muted-foreground">No checklist items for this job.</p>
        </section>
      )}

      {/* Photos */}
      <PhotoUploadSection
        assignmentId={assignmentId}
        requiredCategories={requiredPhotoCategories}
        uploadedCategories={Array.from(uploadedCategories)}
        photos={assignment.photos}
        readOnly={isReadOnly}
      />

      <CleanerNotesSection
        action={addCleanerNoteAction}
        assignmentId={assignmentId}
        notes={evidence.cleanerNotes}
        readOnly={isReadOnly}
      />

      {/* Issue reporting — available during in_progress or after */}
      {["in_progress", "completed_pending_review"].includes(assignment.status) && (
        <ReportIssueSection
          action={reportIssueAction}
          assignmentId={assignmentId}
          propertyId={assignment.property_id}
        />
      )}

      {/* Restock requests — available during in_progress */}
      {isExecutable && inventoryItems.length > 0 && (
        <RestockRequestSection
          action={requestRestockAction}
          assignmentId={assignmentId}
          inventoryItems={inventoryItems}
        />
      )}

      {/* Complete button */}
      {isExecutable && (
        <CompleteJobButton assignmentId={assignmentId} />
      )}

      {assignment.status === "completed_pending_review" && (
        <section className="rounded-2xl border border-purple-200 bg-purple-50 p-4 text-sm text-purple-700">
          Submitted for review. Your supervisor will approve this job.
        </section>
      )}

      {assignment.status === "approved" && (
        <section className="rounded-2xl border border-green-200 bg-green-50 p-4 text-sm text-green-700">
          Unit marked ready. The manager dashboard now shows this unit as ready.
        </section>
      )}

      {/* Per-job chat thread */}
      <JobMessageThread
        assignmentId={assignmentId}
        currentUserId={profile.id}
        messages={messages}
      />
    </main>
  );
}
