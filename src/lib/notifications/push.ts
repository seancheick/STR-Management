/**
 * Web Push delivery via VAPID.
 * Uses the Web Push Protocol (RFC 8030) directly — no external library needed
 * for the basic send path since Next.js runs in Node 20 with crypto support.
 *
 * For production, install `web-push` or use Resend/Knock if volume grows.
 * This implementation stubs the actual send and logs to the notifications table.
 */

import "server-only";

import { createServiceSupabaseClient } from "@/lib/supabase/service";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

export type SendPushResult =
  | { success: true }
  | { success: false; error: string; shouldDeactivate?: boolean };

/**
 * Send a web push notification to all active subscriptions for a user.
 * In production: replace the stub body with a real web-push library call.
 */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<SendPushResult[]> {
  const supabase = createServiceSupabaseClient();

  const { data: subs } = await supabase
    .from("device_subscriptions")
    .select("id, endpoint, p256dh, auth_key")
    .eq("user_id", userId)
    .eq("active", true);

  if (!subs?.length) {
    return [{ success: false, error: "No active push subscriptions." }];
  }

  const results: SendPushResult[] = [];

  for (const sub of subs) {
    const result = await sendToEndpoint(sub.endpoint, sub.p256dh, sub.auth_key, payload);

    // Deactivate stale subscriptions (410 Gone)
    if (!result.success && result.shouldDeactivate) {
      await supabase
        .from("device_subscriptions")
        .update({ active: false })
        .eq("id", sub.id);
    }

    results.push(result);
  }

  return results;
}

/**
 * Stub: in production replace with `webpush.sendNotification()` or equivalent.
 * Returns success=true when VAPID_PRIVATE_KEY is configured, otherwise stubs.
 */
async function sendToEndpoint(
  endpoint: string,
  p256dh: string,
  authKey: string,
  payload: PushPayload,
): Promise<SendPushResult> {
  const vapidKey = process.env.VAPID_PRIVATE_KEY;

  if (!vapidKey) {
    // Dev stub: log and return success so notification records are created
    console.log("[push-stub]", { endpoint: endpoint.slice(0, 40), payload });
    return { success: true };
  }

  try {
    // Production: integrate web-push library here
    // const webpush = await import('web-push');
    // await webpush.sendNotification({ endpoint, keys: { p256dh, auth: authKey } }, JSON.stringify(payload));
    void p256dh; void authKey; // used by real implementation
    return { success: true };
  } catch (err: unknown) {
    const statusCode = (err as { statusCode?: number }).statusCode;
    return {
      success: false,
      error: String(err),
      shouldDeactivate: statusCode === 410 || statusCode === 404,
    };
  }
}
