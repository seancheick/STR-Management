import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AssignmentListRecord = {
  id: string;
  owner_id: string;
  property_id: string;
  cleaner_id: string | null;
  assignment_type: string;
  status: string;
  ack_status: string;
  priority: string;
  checkout_at: string | null;
  next_checkin_at: string | null;
  due_at: string;
  expected_duration_min: number | null;
  fixed_payout_amount: number | null;
  created_at: string;
  properties: { name: string; address_line_1: string | null; city: string | null } | null;
  cleaners: { full_name: string } | null;
};

export type AssignmentDetailRecord = AssignmentListRecord & {
  checklist_items: AssignmentChecklistItemRecord[];
  photos: AssignmentPhotoRecord[];
};

export type AssignmentChecklistItemRecord = {
  id: string;
  assignment_id: string;
  template_item_id: string | null;
  section_name: string | null;
  label: string;
  instruction_text: string | null;
  reference_media_url: string | null;
  required: boolean;
  sort_order: number;
  photo_category: string | null;
  completed: boolean;
  completed_at: string | null;
};

export type AssignmentPhotoRecord = {
  id: string;
  assignment_id: string;
  photo_category: string;
  storage_path: string;
  captured_at: string | null;
};

const ASSIGNMENT_LIST_SELECT = `
  id, owner_id, property_id, cleaner_id, assignment_type,
  status, ack_status, priority, checkout_at, next_checkin_at, due_at,
  expected_duration_min, fixed_payout_amount, created_at,
  properties:property_id ( name, address_line_1, city ),
  cleaners:cleaner_id ( full_name )
`.trim();

export async function listAssignmentsForAdmin(): Promise<AssignmentListRecord[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("assignments")
    .select(ASSIGNMENT_LIST_SELECT)
    .order("due_at", { ascending: true });

  return (data as AssignmentListRecord[] | null) ?? [];
}

export async function listTodaysAssignmentsForAdmin(): Promise<AssignmentListRecord[]> {
  const supabase = await createServerSupabaseClient();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setUTCHours(23, 59, 59, 999);

  const { data } = await supabase
    .from("assignments")
    .select(ASSIGNMENT_LIST_SELECT)
    .gte("due_at", todayStart.toISOString())
    .lte("due_at", todayEnd.toISOString())
    .not("status", "in", '("cancelled","approved")')
    .order("due_at", { ascending: true });

  return (data as AssignmentListRecord[] | null) ?? [];
}

export async function listAtRiskAssignments(): Promise<AssignmentListRecord[]> {
  const supabase = await createServerSupabaseClient();
  const now = new Date().toISOString();

  const { data } = await supabase
    .from("assignments")
    .select(ASSIGNMENT_LIST_SELECT)
    .lt("due_at", now)
    .not("status", "in", '("cancelled","approved","completed_pending_review")')
    .order("due_at", { ascending: true })
    .limit(20);

  return (data as AssignmentListRecord[] | null) ?? [];
}

export async function listUnassignedAssignments(): Promise<AssignmentListRecord[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("assignments")
    .select(ASSIGNMENT_LIST_SELECT)
    .eq("status", "unassigned")
    .order("due_at", { ascending: true });

  return (data as AssignmentListRecord[] | null) ?? [];
}

export async function listAssignmentsForCleaner(
  cleanerId: string,
): Promise<AssignmentListRecord[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("assignments")
    .select(ASSIGNMENT_LIST_SELECT)
    .eq("cleaner_id", cleanerId)
    .not("status", "in", '("cancelled","approved")')
    .order("due_at", { ascending: true });

  return (data as AssignmentListRecord[] | null) ?? [];
}

export async function getAssignmentDetail(
  assignmentId: string,
): Promise<AssignmentDetailRecord | null> {
  const supabase = await createServerSupabaseClient();

  const [assignmentRes, checklistRes, photosRes] = await Promise.all([
    supabase
      .from("assignments")
      .select(ASSIGNMENT_LIST_SELECT)
      .eq("id", assignmentId)
      .maybeSingle(),
    supabase
      .from("assignment_checklist_items")
      .select(
        "id, assignment_id, template_item_id, section_name, label, instruction_text, reference_media_url, required, sort_order, photo_category, completed, completed_at",
      )
      .eq("assignment_id", assignmentId)
      .order("sort_order", { ascending: true }),
    supabase
      .from("assignment_photos")
      .select("id, assignment_id, photo_category, storage_path, captured_at")
      .eq("assignment_id", assignmentId),
  ]);

  if (!assignmentRes.data) {
    return null;
  }

  return {
    ...(assignmentRes.data as unknown as AssignmentListRecord),
    checklist_items: (checklistRes.data as AssignmentChecklistItemRecord[] | null) ?? [],
    photos: (photosRes.data as AssignmentPhotoRecord[] | null) ?? [],
  };
}

export async function getDashboardCounts(): Promise<{
  todaysJobs: number;
  atRisk: number;
  unassigned: number;
}> {
  const [todays, atRisk, unassigned] = await Promise.all([
    listTodaysAssignmentsForAdmin(),
    listAtRiskAssignments(),
    listUnassignedAssignments(),
  ]);

  return {
    todaysJobs: todays.length,
    atRisk: atRisk.length,
    unassigned: unassigned.length,
  };
}

// ─── Schedule view ────────────────────────────────────────────────────────────

export type AssignmentScheduleRecord = {
  id: string;
  property_id: string;
  cleaner_id: string | null;
  status: string;
  priority: string;
  checkout_at: string | null;
  next_checkin_at: string | null;
  due_at: string;
  expected_duration_min: number | null;
  fixed_payout_amount: number | null;
  properties: { name: string; address_line_1: string | null; city: string | null } | null;
  cleaners: { full_name: string } | null;
};

const SCHEDULE_SELECT = `
  id, property_id, cleaner_id, status, priority,
  checkout_at, next_checkin_at, due_at, expected_duration_min, fixed_payout_amount,
  properties:property_id ( name, address_line_1, city ),
  cleaners:cleaner_id ( full_name )
`.trim();

export async function listAssignmentsForSchedule(
  weekStart: string,
  weekEnd: string,
): Promise<AssignmentScheduleRecord[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("assignments")
    .select(SCHEDULE_SELECT)
    .gte("due_at", weekStart)
    .lte("due_at", weekEnd)
    .not("status", "eq", "cancelled")
    .order("due_at", { ascending: true });

  return (data as AssignmentScheduleRecord[] | null) ?? [];
}

export type PropertyTodayStatus = {
  propertyId: string;
  name: string;
  status: "unassigned" | "assigned" | "in_progress" | "pending_review" | "ready" | "quiet";
  cleanerName: string | null;
  dueAt: string | null;
};

export async function getPropertyTodayStatuses(): Promise<PropertyTodayStatus[]> {
  const supabase = await createServerSupabaseClient();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setUTCHours(23, 59, 59, 999);

  const [propertiesRes, assignmentsRes] = await Promise.all([
    supabase.from("properties").select("id, name").eq("active", true).order("name"),
    supabase
      .from("assignments")
      .select("property_id, status, due_at, cleaners:cleaner_id ( full_name )")
      .gte("due_at", todayStart.toISOString())
      .lte("due_at", todayEnd.toISOString())
      .not("status", "eq", "cancelled"),
  ]);

  const assignmentMap = new Map<string, { status: string; cleanerName: string | null; dueAt: string }>();
  for (const a of (assignmentsRes.data ?? []) as Array<{
    property_id: string;
    status: string;
    due_at: string;
    cleaners: { full_name: string } | { full_name: string }[] | null;
  }>) {
    const existing = assignmentMap.get(a.property_id);
    // Priority order: in_progress > unassigned > assigned > pending_review > approved
    const priority: Record<string, number> = {
      in_progress: 5, unassigned: 4, assigned: 3, confirmed: 3,
      completed_pending_review: 2, approved: 1, needs_reclean: 4,
    };
    const newPriority = priority[a.status] ?? 0;
    const existingPriority = existing ? (priority[existing.status] ?? 0) : -1;
    if (newPriority > existingPriority) {
      const cleanerName = Array.isArray(a.cleaners)
        ? (a.cleaners[0]?.full_name ?? null)
        : (a.cleaners as { full_name: string } | null)?.full_name ?? null;
      assignmentMap.set(a.property_id, { status: a.status, cleanerName, dueAt: a.due_at });
    }
  }

  const statusMapping: Record<string, PropertyTodayStatus["status"]> = {
    unassigned: "unassigned",
    assigned: "assigned",
    confirmed: "assigned",
    in_progress: "in_progress",
    completed_pending_review: "pending_review",
    approved: "ready",
    needs_reclean: "unassigned",
  };

  return ((propertiesRes.data ?? []) as Array<{ id: string; name: string }>).map((p) => {
    const a = assignmentMap.get(p.id);
    return {
      propertyId: p.id,
      name: p.name,
      status: a ? (statusMapping[a.status] ?? "quiet") : "quiet",
      cleanerName: a?.cleanerName ?? null,
      dueAt: a?.dueAt ?? null,
    };
  });
}

export async function getDashboardStats(): Promise<{
  checkoutsToday: number;
  cleaningsDueToday: number;
  unassigned: number;
  inProgress: number;
  pendingReview: number;
  atRisk: number;
}> {
  const supabase = await createServerSupabaseClient();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setUTCHours(23, 59, 59, 999);
  const now = new Date().toISOString();

  const [checkoutsRes, dueRes, unassignedRes, inProgressRes, reviewRes, atRiskRes] =
    await Promise.all([
      // Assignments whose checkout_at is today
      supabase
        .from("assignments")
        .select("id", { count: "exact", head: true })
        .gte("checkout_at", todayStart.toISOString())
        .lte("checkout_at", todayEnd.toISOString())
        .not("status", "in", '("cancelled")'),
      // Cleanings due today
      supabase
        .from("assignments")
        .select("id", { count: "exact", head: true })
        .gte("due_at", todayStart.toISOString())
        .lte("due_at", todayEnd.toISOString())
        .not("status", "in", '("cancelled","approved")'),
      // Unassigned (all time)
      supabase
        .from("assignments")
        .select("id", { count: "exact", head: true })
        .eq("status", "unassigned"),
      // In progress right now
      supabase
        .from("assignments")
        .select("id", { count: "exact", head: true })
        .eq("status", "in_progress"),
      // Pending review
      supabase
        .from("assignments")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed_pending_review"),
      // At-risk: past due, not complete
      supabase
        .from("assignments")
        .select("id", { count: "exact", head: true })
        .lt("due_at", now)
        .not("status", "in", '("cancelled","approved","completed_pending_review")'),
    ]);

  return {
    checkoutsToday: checkoutsRes.count ?? 0,
    cleaningsDueToday: dueRes.count ?? 0,
    unassigned: unassignedRes.count ?? 0,
    inProgress: inProgressRes.count ?? 0,
    pendingReview: reviewRes.count ?? 0,
    atRisk: atRiskRes.count ?? 0,
  };
}
