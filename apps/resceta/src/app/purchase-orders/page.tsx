import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { listPurchaseOrders } from "@/server/pharmacy/purchase-orders";
import { can } from "@/lib/pharmacy/roles";
import { peso, manilaDate } from "@/lib/money";

export const dynamic = "force-dynamic";

const TONE: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  sent: "bg-blue-100 text-blue-800",
  partial: "bg-amber-100 text-amber-900",
  received: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
};

/**
 * What has been ordered, and what of it has arrived.
 *
 * Receiving already existed and wrote batches directly, which records what came
 * in and answers nothing about what was supposed to. A pharmacy could not tell
 * a short delivery from a complete one, or chase the distributor for the
 * missing boxes.
 */
export default async function PurchaseOrdersPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");

  const rows = await listPurchaseOrders(staff.pharmacyId);
  const canManage = can(staff.role, "manageStock");
  const outstanding = rows.filter((r) => r.status === "sent" || r.status === "partial");

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Purchase orders</h1>
            <p className="mt-1 text-sm text-slate-500">
              {outstanding.length > 0
                ? `${outstanding.length} still outstanding with a supplier.`
                : "Nothing outstanding with a supplier."}
            </p>
          </div>
          {canManage && (
            <Link
              href="/purchase-orders/new"
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Raise an order
            </Link>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            No purchase orders yet. Raise one to record what you have asked a
            supplier for — then receive against it when the boxes arrive.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full overflow-hidden rounded-xl border border-slate-200 bg-white text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Order</th>
                  <th className="px-4 py-2 font-medium">Supplier</th>
                  <th className="px-4 py-2 font-medium">Expected</th>
                  <th className="px-4 py-2 text-right font-medium">Units</th>
                  <th className="px-4 py-2 text-right font-medium">Value</th>
                  <th className="px-4 py-2 font-medium">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((po) => (
                  <tr key={po.id}>
                    <td className="px-4 py-2">
                      <Link href={`/purchase-orders/${po.id}`} className="font-mono text-xs underline">
                        {po.poNumber}
                      </Link>
                      <p className="text-xs text-slate-400">{manilaDate(po.createdAt)}</p>
                    </td>
                    <td className="px-4 py-2 text-slate-600">{po.supplierName ?? "—"}</td>
                    <td className="px-4 py-2 text-slate-500">
                      {po.expectedDate ? manilaDate(po.expectedDate) : "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {/* Received against ordered, side by side: the whole
                          point of the document is the comparison. */}
                      {po.unitsReceived} / {po.unitsOrdered}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{peso(po.totalCentavos)}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-medium ${TONE[po.status] ?? TONE.draft}`}
                      >
                        {po.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </AppShell>
  );
}
