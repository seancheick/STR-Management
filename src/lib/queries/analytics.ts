import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  calculateCleanerScore,
  calculatePortfolioSummary,
  calculatePropertyHealthScore,
  type CleanerRawStats,
  type CleanerScore,
  type PortfolioSummary,
  type PropertyHealthScore,
  type PropertyRawStats,
} from "@/lib/services/scoring-service";

// ─── Cleaner analytics ────────────────────────────────────────────────────────

export async function getCleanerAnalytics(): Promise<CleanerScore[]> {
  const supabase = await createServerSupabaseClient();

  // All assignments for active cleaners
  const { data: assignments } = await supabase
    .from("assignments")
    .select(
      "cleaner_id, status, ack_status, due_at, completed_at, started_at, users:cleaner_id ( full_name )",
    )
    .not("cleaner_id", "is", null)
    .not("status", "eq", "cancelled");

  // Issues reported by cleaners
  const { data: issues } = await supabase
    .from("issues")
    .select("reported_by_id")
    .not("reported_by_id", "is", null);

  if (!assignments) return [];

  // Group by cleaner
  const statsMap = new Map<string, CleanerRawStats>();

  for (const a of assignments as Array<{
    cleaner_id: string;
    status: string;
    ack_status: string;
    due_at: string;
    completed_at: string | null;
    started_at: string | null;
    users: { full_name: string }[] | null;
  }>) {
    if (!a.cleaner_id) continue;

    if (!statsMap.has(a.cleaner_id)) {
      statsMap.set(a.cleaner_id, {
        cleanerId: a.cleaner_id,
        fullName: (Array.isArray(a.users) ? a.users[0]?.full_name : (a.users as { full_name: string } | null)?.full_name) ?? "Unknown",
        totalAssigned: 0,
        totalAccepted: 0,
        totalDeclinedOrExpired: 0,
        totalCompleted: 0,
        totalApproved: 0,
        totalRecleans: 0,
        totalIssuesReported: 0,
        avgMinutesLate: null,
      });
    }

    const s = statsMap.get(a.cleaner_id)!;
    s.totalAssigned++;

    if (a.ack_status === "accepted") s.totalAccepted++;
    if (a.ack_status === "declined" || a.ack_status === "expired") s.totalDeclinedOrExpired++;

    if (
      a.status === "completed_pending_review" ||
      a.status === "approved" ||
      a.status === "needs_reclean"
    ) {
      s.totalCompleted++;
    }
    if (a.status === "approved") s.totalApproved++;
    if (a.status === "needs_reclean") s.totalRecleans++;
  }

  // Add issue counts
  for (const issue of (issues ?? []) as Array<{ reported_by_id: string }>) {
    const s = statsMap.get(issue.reported_by_id);
    if (s) s.totalIssuesReported++;
  }

  return Array.from(statsMap.values())
    .map(calculateCleanerScore)
    .sort((a, b) => b.score - a.score);
}

// ─── Property analytics ───────────────────────────────────────────────────────

export async function getPropertyAnalytics(): Promise<PropertyHealthScore[]> {
  const supabase = await createServerSupabaseClient();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const cutoff = thirtyDaysAgo.toISOString();

  const [assignmentsRes, issuesRes, propertiesRes] = await Promise.all([
    supabase
      .from("assignments")
      .select(
        "property_id, status, expected_duration_min, started_at, completed_at",
      )
      .not("status", "eq", "cancelled"),
    supabase
      .from("issues")
      .select("property_id, status, created_at"),
    supabase
      .from("properties")
      .select("id, name")
      .eq("active", true),
  ]);

  const propertyNames = new Map<string, string>(
    ((propertiesRes.data ?? []) as Array<{ id: string; name: string }>).map(
      (p) => [p.id, p.name],
    ),
  );

  const statsMap = new Map<string, PropertyRawStats>();

  // Initialize all active properties (even ones with no jobs)
  for (const [id, name] of propertyNames) {
    statsMap.set(id, {
      propertyId: id,
      name,
      totalJobs: 0,
      totalApproved: 0,
      totalRecleans: 0,
      totalOpenIssues: 0,
      totalIssues30d: 0,
      avgExpectedMin: null,
      avgActualMin: null,
    });
  }

  // Process assignments
  const durationByProp = new Map<
    string,
    { expectedTotal: number; actualTotal: number; count: number }
  >();

  for (const a of (assignmentsRes.data ?? []) as Array<{
    property_id: string;
    status: string;
    expected_duration_min: number | null;
    started_at: string | null;
    completed_at: string | null;
  }>) {
    const s = statsMap.get(a.property_id);
    if (!s) continue;

    s.totalJobs++;
    if (a.status === "approved") s.totalApproved++;
    if (a.status === "needs_reclean") s.totalRecleans++;

    // Collect duration data
    if (a.expected_duration_min && a.started_at && a.completed_at) {
      const actualMin =
        (new Date(a.completed_at).getTime() -
          new Date(a.started_at).getTime()) /
        60_000;
      if (actualMin > 0 && actualMin < 1440) {
        // cap at 24h to filter outliers
        const d = durationByProp.get(a.property_id) ?? {
          expectedTotal: 0,
          actualTotal: 0,
          count: 0,
        };
        d.expectedTotal += a.expected_duration_min;
        d.actualTotal += actualMin;
        d.count++;
        durationByProp.set(a.property_id, d);
      }
    }
  }

  // Inject duration averages
  for (const [pid, dur] of durationByProp) {
    const s = statsMap.get(pid);
    if (s && dur.count > 0) {
      s.avgExpectedMin = dur.expectedTotal / dur.count;
      s.avgActualMin = dur.actualTotal / dur.count;
    }
  }

  // Process issues
  for (const issue of (issuesRes.data ?? []) as Array<{
    property_id: string;
    status: string;
    created_at: string;
  }>) {
    const s = statsMap.get(issue.property_id);
    if (!s) continue;

    if (issue.status === "open" || issue.status === "acknowledged") {
      s.totalOpenIssues++;
    }
    if (issue.created_at >= cutoff) {
      s.totalIssues30d++;
    }
  }

  return Array.from(statsMap.values())
    .map(calculatePropertyHealthScore)
    .sort((a, b) => a.score - b.score); // worst first
}

// ─── Portfolio summary ────────────────────────────────────────────────────────

export async function getPortfolioSummary(
  cleanerScores: CleanerScore[],
  propertyScores: PropertyHealthScore[],
): Promise<PortfolioSummary> {
  const supabase = await createServerSupabaseClient();

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [totalRes, approvedRes] = await Promise.all([
    supabase
      .from("assignments")
      .select("id", { count: "exact", head: true })
      .gte("due_at", thirtyDaysAgo.toISOString())
      .not("status", "eq", "cancelled"),
    supabase
      .from("assignments")
      .select("id", { count: "exact", head: true })
      .gte("due_at", thirtyDaysAgo.toISOString())
      .eq("status", "approved"),
  ]);

  return calculatePortfolioSummary(
    cleanerScores,
    propertyScores,
    totalRes.count ?? 0,
    approvedRes.count ?? 0,
  );
}
