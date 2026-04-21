/**
 * Web Push delivery via VAPID. Real delivery through the web-push library.
 * Failures update device_subscriptions.active when the endpoint returns 410/404
 * so dead subscriptions are cleaned up automatically.
 */

import "server-only";

import webpush from "web-push";

import { createServiceSupabaseClient } from "@/lib/supabase/service";

let vapidConfigured = false;

function configureVapid() {
  if (vapidConfigured) return;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:admin@turnflow.app";
  if (!publicKey || !privateKey) return;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
}

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

async function sendToEndpoint(
  endpoint: string,
  p256dh: string,
  authKey: string,
  payload: PushPayload,
): Promise<SendPushResult> {
  configureVapid();

  if (!vapidConfigured) {
    console.log("[push:no-vapid]", { endpoint: endpoint.slice(0, 40), payload });
    return { success: false, error: "VAPID keys not configured on server." };
  }

  try {
    await webpush.sendNotification(
      { endpoint, keys: { p256dh, auth: authKey } },
      JSON.stringify(payload),
      { TTL: 60 * 60 * 24 }, // 24-hour TTL
    );
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
