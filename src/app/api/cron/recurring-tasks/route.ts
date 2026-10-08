import { NextRequest, NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/lib/auth/cron";
import { runRecurringTaskSweep } from "@/lib/services/recurring-tasks";

/**
 * Vercel Cron endpoint: GET /api/cron/recurring-tasks
 * Sweeps active recurring_tasks whose next_run_at has passed and
 * materialises each into an assignment, then rolls next_run_at forward.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runRecurringTaskSweep();
  return NextResponse.json(result);
}
