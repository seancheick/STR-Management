import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

export type IssueRecord = {
  id: string;
  owner_id: string;
  assignment_id: string | null;
  property_id: string;
  reported_by_id: string | null;
  issue_type: string;
  severity: string;
  status: string;
  title: string;
  description: string | null;
  resolved_at: string | null;
  resolution_notes?: string | null;
  resolved_by?: { full_name: string } | null;
  created_at: string;
  updated_at: string;
  properties: { name: string; city: string | null } | null;
  reported_by: { full_name: string } | null;
};

export type IssueMediaRecord = {
  id: string;
  issue_id: string;
  storage_path: string;
  file_size_bytes: number;
  created_at: string;
};

export type InventoryItemRecord = {
  id: string;
  owner_id: string;
  property_id: string;
  name: string;
  category: string | null;
  unit: string;
  current_quantity: number;
  reorder_threshold: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type RestockRequestRecord = {
  id: string;
  owner_id: string;
  assignment_id: string | null;
  inventory_item_id: string;
  requested_by_id: string | null;
  quantity_needed: number;
  status: string;
  notes: string | null;
  created_at: string;
  inventory_item: { name: string; unit: string; property_id: string } | null;
};

export async function listOpenIssues(propertyId?: string): Promise<IssueRecord[]> {
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("issues")
    .select(`
      id, owner_id, assignment_id, property_id, reported_by_id,
      issue_type, severity, status, title, description,
      resolved_at, created_at, updated_at,
      properties:property_id ( name, city ),
      reported_by:reported_by_id ( full_name )
    `)
    .in("status", ["open", "acknowledged", "in_progress"])
    .order("severity", { ascending: false })
    .order("created_at", { ascending: false });

  if (propertyId) {
    query = query.eq("property_id", propertyId);
  }

  const { data } = await query;
  return (data as unknown as IssueRecord[]) ?? [];
}

export async function listResolvedIssues(limit = 25): Promise<IssueRecord[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("issues")
    .select(`
      id, owner_id, assignment_id, property_id, reported_by_id,
      issue_type, severity, status, title, description,
      resolved_at, resolution_notes, created_at, updated_at,
      properties:property_id ( name, city ),
      reported_by:reported_by_id ( full_name ),
      resolved_by:resolved_by_id ( full_name )
    `)
    .eq("status", "resolved")
    .order("resolved_at", { ascending: false })
    .limit(limit);
  return (data as unknown as IssueRecord[]) ?? [];
}

export async function listIssuesForAssignment(assignmentId: string): Promise<IssueRecord[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("issues")
    .select(`
      id, owner_id, assignment_id, property_id, reported_by_id,
      issue_type, severity, status, title, description,
      resolved_at, created_at, updated_at,
      properties:property_id ( name, city ),
      reported_by:reported_by_id ( full_name )
    `)
    .eq("assignment_id", assignmentId)
    .order("created_at", { ascending: false });
  return (data as unknown as IssueRecord[]) ?? [];
}

export async function listIssueMedia(issueId: string): Promise<IssueMediaRecord[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("issue_media")
    .select("id, issue_id, storage_path, file_size_bytes, created_at")
    .eq("issue_id", issueId)
    .order("created_at");
  return (data as unknown as IssueMediaRecord[]) ?? [];
}

export async function listInventoryForProperty(propertyId: string): Promise<InventoryItemRecord[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("property_inventory_items")
    .select("id, owner_id, property_id, name, category, unit, current_quantity, reorder_threshold, active, created_at, updated_at")
    .eq("property_id", propertyId)
    .eq("active", true)
    .order("category", { ascending: true })
    .order("name", { ascending: true });
  return (data as unknown as InventoryItemRecord[]) ?? [];
}

export async function listLowInventory(): Promise<{
  id: string;
  property_id: string;
  property_name: string;
  item_name: string;
  category: string | null;
  unit: string;
  current_quantity: number;
  reorder_threshold: number;
}[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("v_low_inventory")
    .select("id, property_id, property_name, item_name, category, unit, current_quantity, reorder_threshold");
  return (data as unknown as ReturnType<typeof listLowInventory> extends Promise<infer T> ? T : never) ?? [];
}

export async function listPendingRestockRequests(propertyId?: string): Promise<RestockRequestRecord[]> {
  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from("restock_requests")
    .select(`
      id, owner_id, assignment_id, inventory_item_id, requested_by_id,
      quantity_needed, status, notes, created_at,
      inventory_item:inventory_item_id ( name, unit, property_id )
    `)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (propertyId) {
    query = query.eq("inventory_item.property_id", propertyId);
  }

  const { data } = await query;
  return (data as unknown as RestockRequestRecord[]) ?? [];
}

export async function getExceptionCounts(): Promise<{
  open_issues: number;
  critical_issues: number;
  open_maintenance: number;
  pending_recleans: number;
  low_inventory_items: number;
}> {
  const supabase = await createServerSupabaseClient();

  const [exceptionRes, recleanRes, lowInvRes] = await Promise.all([
    supabase
      .from("v_exception_counts")
      .select("open_issues, critical_issues, open_maintenance")
      .maybeSingle(),
    supabase
      .from("v_pending_recleans")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("v_low_inventory")
      .select("id", { count: "exact", head: true }),
  ]);

  return {
    open_issues: (exceptionRes.data?.open_issues as number) ?? 0,
    critical_issues: (exceptionRes.data?.critical_issues as number) ?? 0,
    open_maintenance: (exceptionRes.data?.open_maintenance as number) ?? 0,
    pending_recleans: recleanRes.count ?? 0,
    low_inventory_items: lowInvRes.count ?? 0,
  };
}
