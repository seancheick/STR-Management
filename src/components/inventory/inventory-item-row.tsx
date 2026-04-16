"use client";

import { useState, useTransition } from "react";

import type { InventoryItemRecord } from "@/lib/queries/issues";
import {
  updateInventoryQuantityAction,
  archiveInventoryItemAction,
} from "@/app/(admin)/dashboard/properties/[propertyId]/inventory/actions";

type Props = { item: InventoryItemRecord };

export function InventoryItemRow({ item }: Props) {
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState(String(item.current_quantity));
  const [isPending, startTransition] = useTransition();

  const isLow = item.current_quantity <= item.reorder_threshold;

  function handleSave() {
    const newQty = parseInt(qty, 10);
    if (isNaN(newQty)) return;
    startTransition(async () => {
      await updateInventoryQuantityAction(item.id, item.property_id, newQty);
      setEditing(false);
    });
  }

  return (
    <tr className="text-sm">
      <td className="py-3 font-medium">{item.name}</td>
      <td className="py-3 text-muted-foreground">{item.category ?? "—"}</td>
      <td className="py-3">
        {editing ? (
          <input
            className="h-8 w-20 rounded-lg border border-input bg-background px-2 text-sm"
            min="0"
            onChange={(e) => setQty(e.target.value)}
            type="number"
            value={qty}
          />
        ) : (
          <span className={isLow ? "font-semibold text-amber-600" : ""}>
            {item.current_quantity}
          </span>
        )}
      </td>
      <td className="py-3 text-muted-foreground">{item.reorder_threshold}</td>
      <td className="py-3">
        {isLow ? (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
            Low
          </span>
        ) : (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
            OK
          </span>
        )}
      </td>
      <td className="py-3">
        <div className="flex items-center justify-end gap-2">
          {editing ? (
            <>
              <button
                className="text-xs text-primary underline-offset-2 hover:underline disabled:opacity-60"
                disabled={isPending}
                onClick={handleSave}
                type="button"
              >
                Save
              </button>
              <button
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => { setQty(String(item.current_quantity)); setEditing(false); }}
                type="button"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => setEditing(true)}
                type="button"
              >
                Edit qty
              </button>
              <button
                className="text-xs text-destructive underline-offset-2 hover:underline disabled:opacity-60"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => { await archiveInventoryItemAction(item.id, item.property_id); })
                }
                type="button"
              >
                Archive
              </button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
