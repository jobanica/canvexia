import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { PoExport } from "./PoExport";
import { getPurchaseOrder } from "@/server/pharmacy/purchase-orders";
import { outstanding } from "@/lib/pharmacy/po-input";
import { can } from "@/lib/pharmacy/roles";
import { peso, manilaDate } from "@/lib/money";
import { ReceivePanel, PoControls } from "./ReceivePanel";

export const dynamic = "force-dynamic";

export default async function PoPage({ params }: { params: Promise<{ id: string }> }) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");

  const { id } = await params;
  const po = await getPurchaseOrder(staff.pharmacyId, id);
  // The query is scoped to the session's pharmacy, so an id from another one
  // returns nothing — not found and not yours are the same answer.
  if (!po) notFound();

  const canManage = can(staff.role, "manageStock");
  const anythingArrived = po.items.some((i) => i.quantityReceived > 0);
  const ordered = po.items.reduce((t, i) => t + i.quantityOrdered * i.unitCostCentavos, 0);

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <Link href="/purchase-orders" className="text-sm text-slate-500 underline">
          ← Purchase orders
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-mono text-2xl font-semibold tracking-tight">{po.poNumber}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {po.supplier?.name ?? "No supplier chosen"}
              {po.supplier?.phone && (
                <>
                  {" · "}
                  <a href={`tel:${po.supplier.phone}`} className="underline">
                    {po.supplier.phone}
                  </a>
                </>
              )}
              {" · raised "}
              {manilaDate(po.createdAt)}
              {po.expectedDate && ` · expected ${manilaDate(po.expectedDate)}`}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-white/10 px-3 py-1 text-sm font-medium">{po.status}</span>
            {/*
              Print opens the document view with ?auto=1 rather than printing
              this page. A purchase order faxed to a distributor should not
              carry the app's nav down its side, and the print view is already
              laid out on white.
            */}
            <Link
              href={`/purchase-orders/${po.id}/print?auto=1`}
              className="rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-2 text-sm text-slate-200 hover:bg-white/10"
            >
              Print
            </Link>
            <PoExport
              poNumber={po.poNumber}
              header={["Item", "Generic", "Unit", "Ordered", "Received", "Unit cost", "Line total"]}
              rows={po.items.map((i) => [
                i.product.name,
                i.product.genericName ?? "",
                i.product.unit,
                i.quantityOrdered,
                i.quantityReceived,
                (i.unitCostCentavos / 100).toFixed(2),
                ((i.quantityOrdered * i.unitCostCentavos) / 100).toFixed(2),
              ])}
            />
          </div>
        </div>

        {po.notes && <p className="mt-4 text-sm text-slate-300">{po.notes}</p>}

        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Lines
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl text-sm">
              <thead className="bg-white/[0.06] text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Item</th>
                  <th className="px-4 py-2 text-right font-medium">Ordered</th>
                  <th className="px-4 py-2 text-right font-medium">Received</th>
                  <th className="px-4 py-2 text-right font-medium">Still owed</th>
                  <th className="px-4 py-2 text-right font-medium">Unit cost</th>
                  <th className="px-4 py-2 text-right font-medium">Line</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {po.items.map((i) => (
                  <tr key={i.id}>
                    <td className="px-4 py-2">
                      {i.product.name}
                      {i.product.genericName && (
                        <span className="ml-2 text-xs text-slate-500">{i.product.genericName}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{i.quantityOrdered}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{i.quantityReceived}</td>
                    <td
                      className={`px-4 py-2 text-right tabular-nums ${
                        outstanding(i) > 0 ? "font-semibold text-amber-300" : "text-slate-500"
                      }`}
                    >
                      {outstanding(i)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {peso(i.unitCostCentavos)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {peso(i.quantityOrdered * i.unitCostCentavos)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-white/[0.06] font-semibold">
                  <td className="px-4 py-2" colSpan={5}>
                    Ordered value
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{peso(ordered)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        {canManage && (
          <>
            <div className="mt-6">
              <PoControls poId={po.id} status={po.status} anythingArrived={anythingArrived} />
            </div>
            {po.status !== "cancelled" && (
              <section className="mt-8">
                <ReceivePanel
                  poId={po.id}
                  items={po.items.map((i) => ({
                    id: i.id,
                    name: i.product.name,
                    genericName: i.product.genericName,
                    unit: i.product.unit,
                    quantityOrdered: i.quantityOrdered,
                    quantityReceived: i.quantityReceived,
                    unitCostCentavos: i.unitCostCentavos,
                  }))}
                />
              </section>
            )}
          </>
        )}
      </main>
    </AppShell>
  );
}
