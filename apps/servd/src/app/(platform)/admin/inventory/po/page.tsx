import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { featureLockOr } from "@/server/billing/feature-lock-gate";
import { listPurchaseOrders, listSuppliers } from "@/server/inventory/queries";
import { createPurchaseOrder } from "@/server/inventory/actions";
import { formatPeso } from "@/lib/money";
import { manilaDate } from "@/lib/time/manila";

export default async function PurchaseOrdersPage() {
  const { restaurantId } = await requireAdminPage();
  const locked = await featureLockOr(restaurantId, "inventory", "Purchase orders");
  if (locked) return locked;
  const [pos, suppliers] = await Promise.all([
    listPurchaseOrders(restaurantId),
    listSuppliers(restaurantId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/inventory" className="text-sm text-plum-ink/50">← Inventory</Link>
        <h1 className="font-heading text-2xl font-bold">Purchase orders</h1>
      </div>

      <form action={createPurchaseOrder} className="flex items-end gap-2 rounded-tile border border-plum-ink/10 bg-white p-4">
        <div className="flex-1">
          <label className="block text-xs font-medium text-plum-ink/60">New PO — supplier</label>
          <select name="supplierId" className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm">
            <option value="">No supplier</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <button className="rounded-lg px-4 py-2 text-sm font-semibold btn-brand">Create PO</button>
      </form>

      <ul className="space-y-2">
        {pos.map((po) => {
          const total = po.items.reduce((s, it) => s + it.quantity * it.unitCost, 0);
          return (
            <li key={po.id}>
              <Link href={`/admin/inventory/po/${po.id}`} className="flex items-center justify-between rounded-tile border border-plum-ink/10 bg-white p-4 hover:border-brand-primary">
                <div>
                  <span className="font-medium">{po.supplier?.name ?? "No supplier"}</span>
                  <span className="block text-xs text-plum-ink/40">
                    {manilaDate(po.createdAt)} · {po.items.length} item(s)
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-semibold">{formatPeso(total)}</span>
                  <span className="block text-xs text-plum-ink/50">{po.status}</span>
                </div>
              </Link>
            </li>
          );
        })}
        {pos.length === 0 && <p className="text-sm text-plum-ink/40">No purchase orders yet.</p>}
      </ul>
    </div>
  );
}
