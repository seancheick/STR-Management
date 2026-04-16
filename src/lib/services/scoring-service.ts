/**
 * Scoring Service — Sprint 7: Intelligence
 *
 * Pure functions with no I/O. All inputs come from the analytics query layer.
 * Scores are 0–100. Higher is always better.
 */

export type CleanerRawStats = {
  cleanerId: string;
  fullName: string;
  totalAssigned: number;        // assignments ever assigned to this cleaner
  totalAccepted: number;        // ack_status = 'accepted'
  totalDeclinedOrExpired: number;
  totalCompleted: number;       // reached completed_pending_review or approved
  totalApproved: number;        // final status = 'approved'
  totalRecleans: number;        // final status = 'needs_reclean' (triggered reclean)
  totalIssuesReported: number;  // issues where reported_by_id = cleanerId
  avgMinutesLate: number | null; // avg (completed_at - due_at) in minutes (positive = late)
};

export type PropertyRawStats = {
  propertyId: string;
  name: string;
  totalJobs: number;
  totalApproved: number;
  totalRecleans: number;
  totalOpenIssues: number;
  totalIssues30d: number;       // issues reported in the last 30 days
  avgExpectedMin: number | null;
  avgActualMin: number | null;  // avg (completed_at - started_at) in minutes
};

export type CleanerScore = {
  cleanerId: string;
  fullName: string;
  score: number;              // 0–100
  grade: "A" | "B" | "C" | "D" | "F";
  acceptanceRate: number;     // 0–1
  qualityRate: number;        // 0–1 (approved / completed)
  completionRate: number;     // 0–1 (completed / assigned)
  issueRate: number;          // issues / max(1, completed) — lower is better
  totalJobs: number;
  totalApproved: number;
  totalRecleans: number;
};

export type PropertyHealthScore = {
  propertyId: string;
  name: string;
  score: number;              // 0–100
  grade: "A" | "B" | "C" | "D" | "F";
  approvalRate: number;       // 0–1
  recleanRate: number;        // 0–1 (lower is better)
  issuesPer10Jobs: number;    // normalized issue density (lower is better)
  totalJobs: number;
  totalApproved: number;
  totalRecleans: number;
  openIssues: number;
  durationVariancePct: number | null; // (actual - expected) / expected * 100
};

// ─── Grade thresholds ─────────────────────────────────────────────────────────

function scoreToGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 85) return "A";
  if (score >= 70) return "B";
  if (score >= 55) return "C";
  if (score >= 40) return "D";
  return "F";
}

// ─── Cleaner score ─────────────────────────────────────────────────────────────

/**
 * Weighted cleaner reliability score.
 *
 * Weights:
 *  40% quality (approved / completed) — most important: did the work pass?
 *  30% acceptance (accepted / offered) — reliability: do they accept jobs?
 *  20% completion (completed / assigned) — did they finish what they started?
 *  10% issue rate penalty (issues / completed, capped at 1.0 penalty)
 *
 * Cleaners with < 3 jobs get a confidence-adjusted score toward 50.
 */
export function calculateCleanerScore(stats: CleanerRawStats): CleanerScore {
  const {
    totalAssigned,
    totalAccepted,
    totalDeclinedOrExpired,
    totalCompleted,
    totalApproved,
    totalRecleans,
    totalIssuesReported,
  } = stats;

  const offered = totalAccepted + totalDeclinedOrExpired;
  const acceptanceRate = offered > 0 ? totalAccepted / offered : 1.0;

  const qualityRate =
    totalCompleted > 0 ? totalApproved / totalCompleted : 0;

  const completionRate =
    totalAssigned > 0 ? totalCompleted / totalAssigned : 0;

  // Issue rate: cap at 2 issues/job (beyond that, max penalty applied)
  const issueRate = totalIssuesReported / Math.max(1, totalCompleted);
  const issueRateNormalized = Math.min(issueRate / 2, 1.0);

  const rawScore =
    0.4 * qualityRate * 100 +
    0.3 * acceptanceRate * 100 +
    0.2 * completionRate * 100 +
    0.1 * (1 - issueRateNormalized) * 100;

  // Confidence shrinkage: fewer jobs → pull score toward 50
  const jobCount = Math.min(totalCompleted, 10);
  const confidence = jobCount / 10; // 0–1
  const score = Math.round(confidence * rawScore + (1 - confidence) * 50);

  return {
    cleanerId: stats.cleanerId,
    fullName: stats.fullName,
    score,
    grade: scoreToGrade(score),
    acceptanceRate,
    qualityRate,
    completionRate,
    issueRate,
    totalJobs: totalAssigned,
    totalApproved,
    totalRecleans,
  };
}

// ─── Property health score ─────────────────────────────────────────────────────

/**
 * Weighted property health score.
 *
 * Weights:
 *  45% approval rate (approved / completed) — quality of cleans
 *  35% reclean rate penalty (recleans / completed — lower is better)
 *  20% issue density penalty (issues per 10 jobs — lower is better)
 *
 * Properties with < 3 jobs get confidence-adjusted scores toward 60.
 */
export function calculatePropertyHealthScore(
  stats: PropertyRawStats,
): PropertyHealthScore {
  const {
    totalJobs,
    totalApproved,
    totalRecleans,
    totalIssues30d,
    avgExpectedMin,
    avgActualMin,
  } = stats;

  const completed = totalApproved + totalRecleans;

  const approvalRate = completed > 0 ? totalApproved / completed : 1.0;
  const recleanRate = completed > 0 ? totalRecleans / completed : 0;

  // Issue density: issues per 10 jobs, capped at 3 for scoring purposes
  const issuesPer10Jobs = (totalIssues30d / Math.max(1, totalJobs)) * 10;
  const issuePenalty = Math.min(issuesPer10Jobs / 3, 1.0);

  const rawScore =
    0.45 * approvalRate * 100 +
    0.35 * (1 - recleanRate) * 100 +
    0.2 * (1 - issuePenalty) * 100;

  // Confidence shrinkage toward 60 (property default is neutral-positive)
  const jobCount = Math.min(totalJobs, 8);
  const confidence = jobCount / 8;
  const score = Math.round(confidence * rawScore + (1 - confidence) * 60);

  // Duration variance %
  let durationVariancePct: number | null = null;
  if (avgExpectedMin && avgExpectedMin > 0 && avgActualMin !== null) {
    durationVariancePct = Math.round(
      ((avgActualMin - avgExpectedMin) / avgExpectedMin) * 100,
    );
  }

  return {
    propertyId: stats.propertyId,
    name: stats.name,
    score,
    grade: scoreToGrade(score),
    approvalRate,
    recleanRate,
    issuesPer10Jobs: Math.round(issuesPer10Jobs * 10) / 10,
    totalJobs,
    totalApproved,
    totalRecleans,
    openIssues: stats.totalOpenIssues,
    durationVariancePct,
  };
}

// ─── Portfolio aggregates ─────────────────────────────────────────────────────

export type PortfolioSummary = {
  avgCleanerScore: number;
  avgPropertyScore: number;
  overallApprovalRate: number;   // 0–1
  totalJobsLast30d: number;
  topCleaner: string | null;
  worstProperty: string | null;
};

export function calculatePortfolioSummary(
  cleanerScores: CleanerScore[],
  propertyScores: PropertyHealthScore[],
  totalJobs30d: number,
  totalApproved30d: number,
): PortfolioSummary {
  const avgCleanerScore =
    cleanerScores.length > 0
      ? Math.round(
          cleanerScores.reduce((s, c) => s + c.score, 0) / cleanerScores.length,
        )
      : 0;

  const avgPropertyScore =
    propertyScores.length > 0
      ? Math.round(
          propertyScores.reduce((s, p) => s + p.score, 0) / propertyScores.length,
        )
      : 0;

  const overallApprovalRate =
    totalJobs30d > 0 ? totalApproved30d / totalJobs30d : 0;

  const topCleaner =
    cleanerScores.length > 0
      ? [...cleanerScores].sort((a, b) => b.score - a.score)[0].fullName
      : null;

  const worstProperty =
    propertyScores.length > 0
      ? [...propertyScores].sort((a, b) => a.score - b.score)[0].name
      : null;

  return {
    avgCleanerScore,
    avgPropertyScore,
    overallApprovalRate,
    totalJobsLast30d: totalJobs30d,
    topCleaner,
    worstProperty,
  };
}
