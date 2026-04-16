import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/session";

const subscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  userAgent: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const profile = await requireRole(["cleaner", "owner", "admin", "supervisor"]);
    const body = await req.json();
    const parsed = subscribeSchema.parse(body);

    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.from("device_subscriptions").upsert(
      {
        user_id: profile.id,
        endpoint: parsed.endpoint,
        p256dh: parsed.keys.p256dh,
        auth_key: parsed.keys.auth,
        user_agent: parsed.userAgent ?? null,
        active: true,
      },
      { onConflict: "user_id,endpoint" },
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid subscription data." }, { status: 400 });
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const profile = await requireRole(["cleaner", "owner", "admin", "supervisor"]);
    const body = await req.json();
    const endpoint = z.string().url().parse(body.endpoint);

    const supabase = await createServerSupabaseClient();
    await supabase
      .from("device_subscriptions")
      .update({ active: false })
      .eq("user_id", profile.id)
      .eq("endpoint", endpoint);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
