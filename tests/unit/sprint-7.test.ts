import { describe, expect, it } from "vitest";

import {
  calculateCleanerScore,
  calculatePortfolioSummary,
  calculatePropertyHealthScore,
  type CleanerRawStats,
  type CleanerScore,
  type PropertyRawStats,
  type PropertyHealthScore,
} from "@/lib/services/scoring-service";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeCleaner(overrides: Partial<CleanerRawStats> = {}): CleanerRawStats {
  return {
    cleanerId: "c1",
    fullName: "Test Cleaner",
    totalAssigned: 10,
    totalAccepted: 9,
    totalDeclinedOrExpired: 1,
    totalCompleted: 9,
    totalApproved: 8,
    totalRecleans: 1,
    totalIssuesReported: 1,
    avgMinutesLate: null,
    ...overrides,
  };
}

function makeProperty(overrides: Partial<PropertyRawStats> = {}): PropertyRawStats {
  return {
    propertyId: "p1",
    name: "Oak Street",
    totalJobs: 10,
    totalApproved: 9,
    totalRecleans: 1,
    totalOpenIssues: 0,
    totalIssues30d: 1,
    avgExpectedMin: 120,
    avgActualMin: 130,
    ...overrides,
  };
}

// ─── Cleaner score tests ───────────────────────────────────────────────────────

describe("calculateCleanerScore", () => {
  it("returns a score between 0 and 100", () => {
    const result = calculateCleanerScore(makeCleaner());
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("gives a high score to a reliable cleaner", () => {
    const result = calculateCleanerScore(
      makeCleaner({
        totalAssigned: 20,
        totalAccepted: 20,
        totalDeclinedOrExpired: 0,
        totalCompleted: 20,
        totalApproved: 20,
        totalRecleans: 0,
        totalIssuesReported: 0,
      }),
    );
    expect(result.score).toBeGreaterThan(85);
    expect(result.grade).toBe("A");
  });

  it("gives a low score to an unreliable cleaner", () => {
    const result = calculateCleanerScore(
      makeCleaner({
        totalAssigned: 10,
        totalAccepted: 3,
        totalDeclinedOrExpired: 7,
        totalCompleted: 3,
        totalApproved: 1,
        totalRecleans: 2,
        totalIssuesReported: 5,
      }),
    );
    expect(result.score).toBeLessThan(55);
  });

  it("applies confidence shrinkage for cleaners with fewer than 10 completed jobs", () => {
    const highPerformer = calculateCleanerScore(
      makeCleaner({
        totalCompleted: 1,
        totalApproved: 1,
        totalRecleans: 0,
        totalAssigned: 1,
        totalAccepted: 1,
        totalDeclinedOrExpired: 0,
        totalIssuesReported: 0,
      }),
    );
    // With only 1 job, score should be pulled toward 50 (not a full 100)
    expect(highPerformer.score).toBeLessThan(65);
    expect(highPerformer.score).toBeGreaterThan(40);
  });

  it("handles a cleaner with no jobs", () => {
    const result = calculateCleanerScore(
      makeCleaner({
        totalAssigned: 0,
        totalAccepted: 0,
        totalDeclinedOrExpired: 0,
        totalCompleted: 0,
        totalApproved: 0,
        totalRecleans: 0,
        totalIssuesReported: 0,
      }),
    );
    expect(result.score).toBe(50); // fully shrunk to neutral
  });

  it("caps issue rate penalty at 100%", () => {
    const result = calculateCleanerScore(
      makeCleaner({
        totalCompleted: 1,
        totalIssuesReported: 100,
      }),
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("returns correct rates", () => {
    const result = calculateCleanerScore(
      makeCleaner({
        totalAssigned: 10,
        totalAccepted: 8,
        totalDeclinedOrExpired: 2,
        totalCompleted: 8,
        totalApproved: 6,
        totalRecleans: 2,
        totalIssuesReported: 2,
      }),
    );
    expect(result.acceptanceRate).toBeCloseTo(0.8);
    expect(result.qualityRate).toBeCloseTo(0.75);
    expect(result.completionRate).toBeCloseTo(0.8);
    expect(result.issueRate).toBeCloseTo(0.25);
  });

  it("assigns correct grades", () => {
    const gradeA = calculateCleanerScore(
      makeCleaner({
        totalAssigned: 20,
        totalAccepted: 20,
        totalDeclinedOrExpired: 0,
        totalCompleted: 20,
        totalApproved: 20,
        totalRecleans: 0,
        totalIssuesReported: 0,
      }),
    );
    expect(gradeA.grade).toBe("A");

    // 10+ completed jobs = full confidence, rawScore well below 40 → F
    const gradeF = calculateCleanerScore(
      makeCleaner({
        totalAssigned: 20,
        totalAccepted: 2,
        totalDeclinedOrExpired: 18,
        totalCompleted: 12,
        totalApproved: 0,
        totalRecleans: 12,
        totalIssuesReported: 24,
      }),
    );
    expect(gradeF.grade).toBe("F");
  });
});

// ─── Property health score tests ──────────────────────────────────────────────

describe("calculatePropertyHealthScore", () => {
  it("returns a score between 0 and 100", () => {
    const result = calculatePropertyHealthScore(makeProperty());
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("gives a high score to a healthy property", () => {
    const result = calculatePropertyHealthScore(
      makeProperty({
        totalJobs: 20,
        totalApproved: 20,
        totalRecleans: 0,
        totalOpenIssues: 0,
        totalIssues30d: 0,
      }),
    );
    expect(result.score).toBeGreaterThan(80);
    expect(result.grade).toBe("A");
  });

  it("gives a low score to a problematic property", () => {
    const result = calculatePropertyHealthScore(
      makeProperty({
        totalJobs: 10,
        totalApproved: 4,
        totalRecleans: 6,
        totalOpenIssues: 5,
        totalIssues30d: 8,
      }),
    );
    expect(result.score).toBeLessThan(50);
  });

  it("calculates duration variance correctly", () => {
    const result = calculatePropertyHealthScore(
      makeProperty({
        avgExpectedMin: 100,
        avgActualMin: 120,
      }),
    );
    expect(result.durationVariancePct).toBe(20); // 20% over expected
  });

  it("returns null duration variance when data is missing", () => {
    const result = calculatePropertyHealthScore(
      makeProperty({ avgExpectedMin: null, avgActualMin: null }),
    );
    expect(result.durationVariancePct).toBeNull();
  });

  it("applies confidence shrinkage for properties with fewer than 8 jobs", () => {
    const perfect = calculatePropertyHealthScore(
      makeProperty({
        totalJobs: 2,
        totalApproved: 2,
        totalRecleans: 0,
        totalIssues30d: 0,
      }),
    );
    // Should be pulled toward 60, not at 100
    expect(perfect.score).toBeLessThan(80);
    expect(perfect.score).toBeGreaterThan(50);
  });

  it("handles a property with no jobs", () => {
    const result = calculatePropertyHealthScore(
      makeProperty({
        totalJobs: 0,
        totalApproved: 0,
        totalRecleans: 0,
        totalIssues30d: 0,
      }),
    );
    expect(result.score).toBe(60); // fully shrunk to neutral
  });
});

// ─── Portfolio summary tests ──────────────────────────────────────────────────

describe("calculatePortfolioSummary", () => {
  const mockCleaners: CleanerScore[] = [
    {
      cleanerId: "c1",
      fullName: "Alice",
      score: 90,
      grade: "A",
      acceptanceRate: 1,
      qualityRate: 0.95,
      completionRate: 1,
      issueRate: 0.1,
      totalJobs: 20,
      totalApproved: 19,
      totalRecleans: 1,
    },
    {
      cleanerId: "c2",
      fullName: "Bob",
      score: 60,
      grade: "C",
      acceptanceRate: 0.7,
      qualityRate: 0.8,
      completionRate: 0.8,
      issueRate: 0.5,
      totalJobs: 10,
      totalApproved: 8,
      totalRecleans: 2,
    },
  ];

  const mockProperties: PropertyHealthScore[] = [
    {
      propertyId: "p1",
      name: "Oak Street",
      score: 85,
      grade: "A",
      approvalRate: 0.9,
      recleanRate: 0.1,
      issuesPer10Jobs: 1,
      totalJobs: 10,
      totalApproved: 9,
      totalRecleans: 1,
      openIssues: 0,
      durationVariancePct: 5,
    },
    {
      propertyId: "p2",
      name: "Beach House",
      score: 45,
      grade: "D",
      approvalRate: 0.6,
      recleanRate: 0.4,
      issuesPer10Jobs: 5,
      totalJobs: 5,
      totalApproved: 3,
      totalRecleans: 2,
      openIssues: 3,
      durationVariancePct: 30,
    },
  ];

  it("calculates average cleaner score correctly", () => {
    const summary = calculatePortfolioSummary(mockCleaners, mockProperties, 20, 15);
    expect(summary.avgCleanerScore).toBe(75); // (90 + 60) / 2
  });

  it("calculates average property score correctly", () => {
    const summary = calculatePortfolioSummary(mockCleaners, mockProperties, 20, 15);
    expect(summary.avgPropertyScore).toBe(65); // (85 + 45) / 2
  });

  it("calculates overall approval rate correctly", () => {
    const summary = calculatePortfolioSummary(mockCleaners, mockProperties, 20, 15);
    expect(summary.overallApprovalRate).toBeCloseTo(0.75);
  });

  it("identifies top cleaner by score", () => {
    const summary = calculatePortfolioSummary(mockCleaners, mockProperties, 20, 15);
    expect(summary.topCleaner).toBe("Alice");
  });

  it("identifies worst property by score", () => {
    const summary = calculatePortfolioSummary(mockCleaners, mockProperties, 20, 15);
    expect(summary.worstProperty).toBe("Beach House");
  });

  it("handles empty arrays gracefully", () => {
    const summary = calculatePortfolioSummary([], [], 0, 0);
    expect(summary.avgCleanerScore).toBe(0);
    expect(summary.avgPropertyScore).toBe(0);
    expect(summary.overallApprovalRate).toBe(0);
    expect(summary.topCleaner).toBeNull();
    expect(summary.worstProperty).toBeNull();
  });
});
