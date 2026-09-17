import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { listPurchaseOrders } from "@/server/pharmacy/purchase-orders";
import { can } from "@/lib/pharmacy/roles";
import { peso, manilaDate } from "@/lib/money";

export const dynamic = "force-dynamic";

const TONE: Record<string, string> = {
  draft: "bg-white/10 text-slate-200",
  sent: "bg-blue-500/15 text-blue-300",
  partial: "bg-amber-500/15 text-amber-200",
  received: "bg-emerald-500/15 text-emerald-300",
  cancelled: "bg-red-500/15 text-red-300",
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
              className="rounded-lg brand-gradient px-4 py-2 text-sm font-semibold text-white"
            >
              Raise an order
            </Link>
          )}
        </div>

        {rows.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 text-sm text-slate-300">
            No purchase orders yet. Raise one to record what you have asked a
            supplier for — then receive against it when the boxes arrive.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl text-sm">
              <thead className="bg-white/[0.06] text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Order</th>
                  <th className="px-4 py-2 font-medium">Supplier</th>
                  <th className="px-4 py-2 font-medium">Expected</th>
                  <th className="px-4 py-2 text-right font-medium">Units</th>
                  <th className="px-4 py-2 text-right font-medium">Value</th>
                  <th className="px-4 py-2 font-medium">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {rows.map((po) => (
                  <tr key={po.id}>
                    <td className="px-4 py-2">
                      <Link href={`/purchase-orders/${po.id}`} className="font-mono text-xs underline">
                        {po.poNumber}
                      </Link>
                      <p className="text-xs text-slate-500">{manilaDate(po.createdAt)}</p>
                    </td>
                    <td className="px-4 py-2 text-slate-300">{po.supplierName ?? "—"}</td>
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
