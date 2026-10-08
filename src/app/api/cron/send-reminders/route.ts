import { NextRequest, NextResponse } from "next/server";

import { isAuthorizedCronRequest } from "@/lib/auth/cron";
import {
  findUnacceptedDueSoon,
  findOverdueAssignments,
  findSLABreaches,
  sendNotification,
} from "@/lib/notifications/notification-service";

/**
 * Vercel Cron: GET /api/cron/send-reminders
 * Schedule: once daily at 09:00 UTC ("0 9 * * *" in vercel.json).
 * Vercel Hobby only allows daily crons. At that cadence the T-2h and SLA
 * checks only see jobs due between 09:00 and 11:00 UTC; switch the schedule
 * to "0 * * * *" on a Pro plan for the time-sensitive alerts to work.
 *
 * Sends:
 *  - T-24h reminders to cleaners with unaccepted assigned jobs
 *  - T-2h  reminders to cleaners with unaccepted assigned jobs
 *  - Overdue alerts to cleaner + owner
 *  - SLA breach alerts to owner (unassigned jobs due in <2h)
 */
export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [due24h, due2h, overdue, slaBreaches] = await Promise.all([
    findUnacceptedDueSoon(24),
    findUnacceptedDueSoon(2),
    findOverdueAssignments(),
    findSLABreaches(),
  ]);

  // Deduplicate: 2h set is a subset of 24h — send only 2h for those in both
  const due2hIds = new Set(due2h.map((a) => a.id));
  const only24h = due24h.filter((a) => !due2hIds.has(a.id));

  const sends: Promise<void>[] = [];

  // T-24h reminders
  for (const a of only24h) {
    if (!a.cleaner_id) continue;
    sends.push(
      sendNotification({
        ownerId: a.owner_id,
        recipientId: a.cleaner_id,
        assignmentId: a.id,
        type: "reminder_24h",
        title: "Job reminder — 24 hours",
        body: `${a.properties?.name ?? "A property"} is due tomorrow. Please confirm your availability.`,
        url: `/jobs/${a.id}`,
      }),
    );
  }

  // T-2h reminders
  for (const a of due2h) {
    if (!a.cleaner_id) continue;
    sends.push(
      sendNotification({
        ownerId: a.owner_id,
        recipientId: a.cleaner_id,
        assignmentId: a.id,
        type: "reminder_2h",
        title: "Job starting in 2 hours",
        body: `${a.properties?.name ?? "Your job"} starts soon. Head over and get started.`,
        url: `/jobs/${a.id}`,
      }),
    );
  }

  // Overdue alerts
  for (const a of overdue) {
    if (a.cleaner_id) {
      sends.push(
        sendNotification({
          ownerId: a.owner_id,
          recipientId: a.cleaner_id,
          assignmentId: a.id,
          type: "overdue",
          title: "Job is overdue",
          body: `${a.properties?.name ?? "A job"} is past its due time. Please update your status.`,
          url: `/jobs/${a.id}`,
        }),
      );
    }
    // Also notify owner
    sends.push(
      sendNotification({
        ownerId: a.owner_id,
        recipientId: a.owner_id,
        assignmentId: a.id,
        type: "overdue",
        title: "Overdue job alert",
        body: `${a.properties?.name ?? "A job"} is past its due time and may need attention.`,
        url: `/dashboard/assignments`,
      }),
    );
  }

  // SLA breaches (unassigned, due soon)
  for (const a of slaBreaches) {
    sends.push(
      sendNotification({
        ownerId: a.owner_id,
        recipientId: a.owner_id,
        assignmentId: a.id,
        type: "sla_breach",
        title: "Unassigned job — SLA breach",
        body: `${a.properties?.name ?? "A job"} is due in less than 2 hours with no cleaner assigned.`,
        url: `/dashboard/assignments/new`,
      }),
    );
  }

  await Promise.allSettled(sends);

  return NextResponse.json({
    reminders24h: only24h.length,
    reminders2h: due2h.length,
    overdue: overdue.length,
    slaBreaches: slaBreaches.length,
    totalSent: sends.length,
  });
}
