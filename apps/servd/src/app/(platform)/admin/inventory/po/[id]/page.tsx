import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { featureLockOr } from "@/server/billing/feature-lock-gate";
import { getPurchaseOrder, listInventory } from "@/server/inventory/queries";
import { addPurchaseOrderItem, receivePurchaseOrder } from "@/server/inventory/actions";
import { formatPeso } from "@/lib/money";
import { manilaDateTime } from "@/lib/time/manila";

export default async function PurchaseOrderDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { restaurantId } = await requireAdminPage();
  const locked = await featureLockOr(restaurantId, "inventory", "Purchase order");
  if (locked) return locked;
  const [po, items] = await Promise.all([
    getPurchaseOrder(restaurantId, id),
    listInventory(restaurantId),
  ]);
  if (!po) notFound();

  const received = po.status === "received";
  const total = po.items.reduce((s, it) => s + it.quantity * it.unitCost, 0);

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin/inventory/po" className="text-sm text-plum-ink/50">← Purchase orders</Link>
          <h1 className="font-heading text-2xl font-bold">{po.supplier?.name ?? "Purchase order"}</h1>
          <p className="text-sm text-plum-ink/50">Status: {po.status}</p>
        </div>
        {!received && po.items.length > 0 && (
          <form action={receivePurchaseOrder}>
            <input type="hidden" name="purchaseOrderId" value={po.id} />
            <button className="rounded-full px-5 py-2 text-sm font-semibold btn-brand">Receive stock</button>
          </form>
        )}
      </div>

      <ul className="rounded-tile border border-plum-ink/10 bg-white divide-y divide-plum-ink/5">
        {po.items.map((it) => (
          <li key={it.id} className="flex justify-between p-3 text-sm">
            <span>{it.inventoryItem.name} <span className="text-plum-ink/40">× {it.quantity} {it.inventoryItem.unit}</span></span>
            <span className="font-medium">{formatPeso(it.quantity * it.unitCost)}</span>
          </li>
        ))}
        {po.items.length === 0 && <li className="p-3 text-sm text-plum-ink/40">No items yet.</li>}
        <li className="flex justify-between p-3 font-heading font-bold">
          <span>Total</span><span>{formatPeso(total)}</span>
        </li>
      </ul>

      {!received && (
        <form action={addPurchaseOrderItem} className="flex flex-wrap items-end gap-2 rounded-tile border border-plum-ink/10 bg-white p-4">
          <input type="hidden" name="purchaseOrderId" value={po.id} />
          <select name="inventoryItemId" required className="flex-1 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm">
            <option value="">Ingredient…</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
          </select>
          <input name="quantity" type="number" step="0.01" min="0" placeholder="Qty" required className="w-24 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
          <input name="unitCostPesos" type="number" step="0.01" min="0" placeholder="Unit cost ₱" required className="w-28 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
          <button className="rounded-lg px-4 py-2 text-sm font-semibold btn-brand">Add line</button>
        </form>
      )}
      {received && (
        <p className="text-sm text-mango">Received {po.receivedAt ? manilaDateTime(po.receivedAt) : "—"} — stock + weighted-average cost updated.</p>
      )}
    </div>
  );
}
