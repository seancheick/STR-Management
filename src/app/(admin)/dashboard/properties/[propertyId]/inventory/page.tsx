import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { requireRole } from "@/lib/auth/session";
import { listInventoryForProperty } from "@/lib/queries/issues";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { InventoryItemRow } from "@/components/inventory/inventory-item-row";
import { AddInventoryItemForm } from "@/components/inventory/add-inventory-item-form";
import { addInventoryItemAction } from "./actions";

type Props = {
  params: Promise<{ propertyId: string }>;
};

export default async function PropertyInventoryPage({ params }: Props) {
  await requireRole(["owner", "admin", "supervisor"]);
  const { propertyId } = await params;

  const supabase = await createServerSupabaseClient();
  const { data: property } = await supabase
    .from("properties")
    .select("id, name")
    .eq("id", propertyId)
    .maybeSingle();

  if (!property) {
    notFound();
  }

  const items = await listInventoryForProperty(propertyId);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-10">
      <div className="flex flex-col gap-3">
        <Link
          className="text-sm text-muted-foreground"
          href={`/dashboard/properties/${propertyId}` as Route}
        >
          ← Back to property
        </Link>
        <div>
          <p className="text-sm uppercase tracking-[0.25em] text-muted-foreground">
            {property.name}
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight">Inventory</h1>
        </div>
      </div>

      {/* Current inventory */}
      <section className="rounded-[1.75rem] border border-border/70 bg-card p-6 shadow-sm">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No inventory items yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="pb-3 font-medium">Item</th>
                <th className="pb-3 font-medium">Category</th>
                <th className="pb-3 font-medium">Qty</th>
                <th className="pb-3 font-medium">Threshold</th>
                <th className="pb-3 font-medium">Status</th>
                <th className="pb-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border/40">
              {items.map((item) => (
                <InventoryItemRow key={item.id} item={item} />
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* Add new item */}
      <section className="rounded-[1.75rem] border border-border/70 bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-base font-semibold">Add item</h2>
        <AddInventoryItemForm action={addInventoryItemAction} propertyId={propertyId} />
      </section>
    </main>
  );
}
