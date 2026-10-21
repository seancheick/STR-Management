import { NextRequest, NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/lib/auth/cron";
import { listBookabilityOwners, runBookabilityScan } from "@/lib/services/bookability-runner";

/**
 * Vercel Cron: GET /api/cron/bookability
 * Read-only scan of every Hostex channel calendar for bookability problems.
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const owners = await listBookabilityOwners();
  const results = [];
  for (const ownerId of owners) results.push({ ownerId, ...(await runBookabilityScan(ownerId)) });
  return NextResponse.json({ scanned: owners.length, results });
}
