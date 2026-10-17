"use server";

import { bulkAssignCleanerAction } from "@/app/(admin)/dashboard/assignments/actions";
import { listActiveCleaners } from "@/lib/queries/team";
import { getAssignmentDetail } from "@/lib/queries/assignments";
import { requireRole } from "@/lib/auth/session";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { summarizeReviewEvidence } from "@/lib/services/review-evidence";

export type CleanerSuggestion = {
  id: string;
  fullName: string;
  isDefault: boolean;
  isAvailable: boolean;
  conflictReason: string | null;
};

export type AssignmentDetailAction = Awaited<ReturnType<typeof fetchAssignmentDetail>>;

export async function fetchAssignmentDetail(assignmentId: string) {
  await requireRole(["owner", "admin", "supervisor"]);
  const detail = await getAssignmentDetail(assignmentId);
  if (!detail) return null;

  const completedItems = detail.checklist_items.filter((i) => i.completed).length;
  const totalItems = detail.checklist_items.length;
  const photoCount = detail.photos.length;
  const evidence = summarizeReviewEvidence({
    notes: detail.notes,
    issues: detail.issues,
  });

  return {
    availableCleaners: await listActiveCleaners(),
    extras: detail.assignment_extras ?? [],
    id: detail.id,
    propertyName: detail.properties?.name ?? "Property",
    propertyAddress: detail.properties?.address_line_1 ?? null,
    propertyCity: detail.properties?.city ?? null,
    cleanerName: detail.cleaners?.full_name ?? null,
    status: detail.status,
    ackStatus: detail.ack_status,
    priority: detail.priority,
    dueAt: detail.due_at,
    checkoutAt: detail.checkout_at,
    nextCheckinAt: detail.next_checkin_at,
    timeZone: detail.properties?.timezone ?? null,
    expectedDurationMin: detail.expected_duration_min,
    fixedPayoutAmount: detail.fixed_payout_amount,
    paidAt: detail.paid_at,
    paymentMethod: detail.payment_method,
    paymentReference: detail.payment_reference,
    assignmentType: detail.assignment_type,
    checklistCompleted: completedItems,
    checklistTotal: totalItems,
    photoCount,
    propertyId: detail.property_id,
    cleanerId: detail.cleaner_id,
    cleanerNotes: evidence.cleanerNotes.map((note) => ({
      body: note.body,
      createdAt: note.created_at,
      authorName: note.users?.full_name ?? null,
    })),
    reportedIssues: evidence.reportedIssues.map((issue) => ({
      id: issue.id,
      title: issue.title,
      severity: issue.severity,
      status: issue.status,
      description: issue.description ?? null,
      createdAt: issue.created_at,
    })),
  };
}

export async function assignCleanerAction(assignmentId: string, cleanerId: string, mode: "request" | "direct" = "request"): Promise<{ok:boolean;error?:string}> {
 const result = await bulkAssignCleanerAction([assignmentId],cleanerId,mode);
 return result.error || !result.assigned ? {ok:false,error:result.error ?? "This job is no longer unassigned. Refresh and review it."} : {ok:true};
}

export async function getCleanerSuggestionsAction(
  assignmentId: string,
): Promise<CleanerSuggestion[]> {
  await requireRole(["owner", "admin", "supervisor"]);
  const supabase = await createServerSupabaseClient();

  // Get assignment info for window + default cleaner check
  const [assignmentRes, cleanersRes] = await Promise.all([
    supabase
      .from("assignments")
      .select("due_at, expected_duration_min, property_id, properties:property_id(default_cleaner_id)")
      .eq("id", assignmentId)
      .maybeSingle(),
    supabase
      .from("cleaners")
      .select("id, full_name")
      .eq("role", "cleaner")
      .eq("active", true)
      .order("full_name"),
  ]);

  if (!assignmentRes.data || !cleanersRes.data) return [];

  const a = assignmentRes.data as {
    due_at: string;
    expected_duration_min: number | null;
    property_id: string;
    properties: { default_cleaner_id: string | null } | { default_cleaner_id: string | null }[] | null;
  };

  const defaultCleanerId =
    Array.isArray(a.properties)
      ? (a.properties[0]?.default_cleaner_id ?? null)
      : (a.properties as { default_cleaner_id: string | null } | null)?.default_cleaner_id ?? null;

  // Determine cleaning window
  const windowStart = new Date(a.due_at);
  const expectedMs = (a.expected_duration_min ?? 120) * 60_000;
  const windowEnd = new Date(windowStart.getTime() + expectedMs);

  // Check each cleaner for overlapping assignments
  const cleaners = cleanersRes.data as Array<{ id: string; full_name: string }>;
  const suggestions = await Promise.all(
    cleaners.map(async (c) => {
      const { count } = await supabase
        .from("assignments")
        .select("id", { count: "exact", head: true })
        .eq("cleaner_id", c.id)
        .not("status", "in", '("cancelled","approved")')
        .lt("due_at", windowEnd.toISOString())
        .gt("due_at", new Date(windowStart.getTime() - expectedMs).toISOString());

      const hasConflict = (count ?? 0) > 0;
      return {
        id: c.id,
        fullName: c.full_name,
        isDefault: c.id === defaultCleanerId,
        isAvailable: !hasConflict,
        conflictReason: hasConflict ? "Has another job in this window" : null,
      };
    }),
  );

  // Sort: default first, then available, then by name
  return suggestions.sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    if (a.isAvailable !== b.isAvailable) return a.isAvailable ? -1 : 1;
    return a.fullName.localeCompare(b.fullName);
  });
}
