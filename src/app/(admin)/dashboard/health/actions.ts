"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { AgentToolError } from "@/lib/agent/errors";
import { requireRole } from "@/lib/auth/session";
import { runBookabilityScan } from "@/lib/services/bookability-runner";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** Read-only Hostex scan on demand, e.g. right after a pricing change. */
export async function runBookabilityScanAction() {
  const profile = await requireRole(["owner", "admin"]);
  const result = await runBookabilityScan(profile.owner_id);
  revalidatePath("/dashboard", "layout");
  return result;
}

const listingSettings = z.object({
  channelType: z.string().min(1),
  listingId: z.string().min(1),
  pricingAuthority: z.enum(["pricelabs", "turnflow", "manual"]).optional(),
  intentionallyClosed: z.boolean().optional(),
  expectedRatio: z.number().positive().max(10).nullable().optional(),
});
export type ChannelListingSettings = z.input<typeof listingSettings>;

/** Owner settings only; RLS and column grants keep scan data out of reach. Shared by the form and agents. */
export async function updateChannelListingSettings(input: ChannelListingSettings) {
  await requireRole(["owner", "admin"]);
  const v = listingSettings.parse(input);
  const changes = {
    ...(v.pricingAuthority !== undefined && { pricing_authority: v.pricingAuthority }),
    ...(v.intentionallyClosed !== undefined && { intentionally_closed: v.intentionallyClosed }),
    ...(v.expectedRatio !== undefined && { expected_ratio: v.expectedRatio }),
  };
  if (!Object.keys(changes).length) throw new AgentToolError("Nothing to change.");
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("channel_listings").update(changes)
    .eq("channel_type", v.channelType).eq("listing_id", v.listingId)
    .select("channel_type, listing_id, property_title, pricing_authority, intentionally_closed, expected_ratio, authority_changed_at");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new AgentToolError("Channel calendar not found.");
  revalidatePath("/dashboard", "layout");
  return data[0];
}

export async function updateChannelListingAction(formData: FormData) {
  const ratio = String(formData.get("expectedRatio") ?? "").trim();
  await updateChannelListingSettings({
    channelType: String(formData.get("channelType")),
    listingId: String(formData.get("listingId")),
    pricingAuthority: formData.get("pricingAuthority") as "pricelabs" | "turnflow" | "manual",
    intentionallyClosed: formData.get("intentionallyClosed") === "on",
    expectedRatio: ratio ? Number(ratio) : null,
  });
}
