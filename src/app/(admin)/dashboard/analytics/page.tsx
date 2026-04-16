import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";

import { requireRole } from "@/lib/auth/session";
import {
  getCleanerAnalytics,
  getPortfolioSummary,
  getPropertyAnalytics,
} from "@/lib/queries/analytics";
import { ScoreBar } from "@/components/analytics/score-bar";

function fmtPct(rate: number) {
  return `${Math.round(rate * 100)}%`;
}

function fmtVariance(v: number | null) {
  if (v === null) return "—";
  const sign = v >= 0 ? "+" : "";
  return `${sign}${v}%`;
}

function varianceColor(v: number | null) {
  if (v === null) return "text-muted-foreground";
  if (v > 15) return "text-red-600";
  if (v > 0) return "text-amber-600";
  return "text-green-600";
}

export default async function AnalyticsPage() {
  await requireRole(["owner", "admin", "supervisor"]);

  const [cleanerScores, propertyScores] = await Promise.all([
    getCleanerAnalytics(),
    getPropertyAnalytics(),
  ]);

  const portfolio = await getPortfolioSummary(cleanerScores, propertyScores);

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-8 px-6 py-10">
      {/* Header */}
      <div>
        <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
          Intelligence
        </p>
        <h1 className="mt-1.5 text-3xl font-semibold tracking-tight">
          Analytics
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Scores update in real time from completed job data.
        </p>
      </div>

      {/* Portfolio KPI strip */}
      <section aria-label="Portfolio overview" className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <p className="text-sm text-muted-foreground">Avg cleaner score</p>
            <Users className="h-4 w-4 text-muted-foreground/60" aria-hidden="true" />
          </div>
          <p className="mt-3 text-4xl font-semibold tabular-nums tracking-tight">
            {portfolio.avgCleanerScore}
          </p>
          {portfolio.topCleaner && (
            <p className="mt-2 text-xs text-muted-foreground">
              Top: {portfolio.topCleaner}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <p className="text-sm text-muted-foreground">Avg property health</p>
            <BarChart3 className="h-4 w-4 text-muted-foreground/60" aria-hidden="true" />
          </div>
          <p className="mt-3 text-4xl font-semibold tabular-nums tracking-tight">
            {portfolio.avgPropertyScore}
          </p>
          {portfolio.worstProperty && (
            <p className="mt-2 text-xs text-amber-600">
              Needs attention: {portfolio.worstProperty}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <p className="text-sm text-muted-foreground">Approval rate (30d)</p>
            <CheckCircle2 className="h-4 w-4 text-muted-foreground/60" aria-hidden="true" />
          </div>
          <p className="mt-3 text-4xl font-semibold tabular-nums tracking-tight">
            {fmtPct(portfolio.overallApprovalRate)}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Jobs approved on first pass
          </p>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <p className="text-sm text-muted-foreground">Jobs last 30d</p>
            <Clock className="h-4 w-4 text-muted-foreground/60" aria-hidden="true" />
          </div>
          <p className="mt-3 text-4xl font-semibold tabular-nums tracking-tight">
            {portfolio.totalJobsLast30d}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">Completed cleanings</p>
        </div>
      </section>

      {/* Cleaner performance table */}
      <section aria-label="Cleaner performance" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Cleaner performance</h2>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
            {cleanerScores.length} cleaners
          </span>
        </div>

        {cleanerScores.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/70 px-5 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No cleaner data yet — scores appear once jobs are completed.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Cleaner</th>
                  <th className="px-5 py-3 font-medium">Score</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">Acceptance</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">Quality</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">Issue rate</th>
                  <th className="px-4 py-3 font-medium text-right">Jobs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {cleanerScores.map((c) => (
                  <tr key={c.cleanerId} className="hover:bg-muted/30">
                    <td className="px-5 py-3.5">
                      <p className="font-medium">{c.fullName}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {c.totalApproved} approved · {c.totalRecleans} re-cleans
                      </p>
                    </td>
                    <td className="min-w-[160px] px-5 py-3.5">
                      <ScoreBar score={c.score} grade={c.grade} />
                    </td>
                    <td className="hidden px-4 py-3.5 tabular-nums sm:table-cell">
                      {fmtPct(c.acceptanceRate)}
                    </td>
                    <td className="hidden px-4 py-3.5 tabular-nums sm:table-cell">
                      {fmtPct(c.qualityRate)}
                    </td>
                    <td className="hidden px-4 py-3.5 tabular-nums sm:table-cell">
                      <span
                        className={
                          c.issueRate > 1
                            ? "font-medium text-red-600"
                            : c.issueRate > 0.5
                              ? "text-amber-600"
                              : "text-muted-foreground"
                        }
                      >
                        {c.issueRate.toFixed(1)}/job
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-muted-foreground">
                      {c.totalJobs}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Property health table */}
      <section aria-label="Property health" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Property health</h2>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
            {propertyScores.length} properties
          </span>
        </div>

        {propertyScores.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/70 px-5 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              No property data yet — scores appear once jobs are completed.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Property</th>
                  <th className="px-5 py-3 font-medium">Health score</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">Re-clean rate</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">Open issues</th>
                  <th className="hidden px-4 py-3 font-medium sm:table-cell">Duration</th>
                  <th className="px-4 py-3 font-medium text-right">Jobs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {propertyScores.map((p) => (
                  <tr key={p.propertyId} className="hover:bg-muted/30">
                    <td className="px-5 py-3.5">
                      <p className="font-medium">{p.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {fmtPct(p.approvalRate)} approval rate
                      </p>
                    </td>
                    <td className="min-w-[160px] px-5 py-3.5">
                      <ScoreBar score={p.score} grade={p.grade} />
                    </td>
                    <td className="hidden px-4 py-3.5 tabular-nums sm:table-cell">
                      <span
                        className={
                          p.recleanRate > 0.2
                            ? "font-medium text-red-600"
                            : p.recleanRate > 0.1
                              ? "text-amber-600"
                              : "text-muted-foreground"
                        }
                      >
                        {fmtPct(p.recleanRate)}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3.5 sm:table-cell">
                      {p.openIssues > 0 ? (
                        <span className="flex items-center gap-1 font-medium text-amber-600">
                          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                          {p.openIssues}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </td>
                    <td className="hidden px-4 py-3.5 sm:table-cell">
                      <span className={`flex items-center gap-1 text-xs ${varianceColor(p.durationVariancePct)}`}>
                        {p.durationVariancePct !== null && (
                          p.durationVariancePct > 0
                            ? <TrendingUp className="h-3.5 w-3.5" aria-hidden="true" />
                            : <TrendingDown className="h-3.5 w-3.5" aria-hidden="true" />
                        )}
                        <span className="tabular-nums font-medium">
                          {fmtVariance(p.durationVariancePct)}
                        </span>
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-muted-foreground">
                      {p.totalJobs}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Score methodology note */}
      <section className="rounded-2xl border border-border/60 bg-muted/40 px-5 py-4 text-xs text-muted-foreground">
        <p className="font-medium text-foreground/70 mb-1.5">How scores are calculated</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <p className="font-medium">Cleaner score (0–100)</p>
            <p>40% quality (approved / completed) · 30% acceptance rate · 20% completion rate · 10% issue rate</p>
          </div>
          <div>
            <p className="font-medium">Property health (0–100)</p>
            <p>45% approval rate · 35% re-clean rate · 20% issue density. Scores adjust for confidence when fewer than 8 jobs are on record.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
