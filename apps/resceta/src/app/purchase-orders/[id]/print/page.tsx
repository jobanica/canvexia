import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { getPurchaseOrder } from "@/server/pharmacy/purchase-orders";
import { can } from "@/lib/pharmacy/roles";
import { peso, manilaDate } from "@/lib/money";
import { pharmacyDb } from "@/server/tenancy/scoped-db";
import { PrintNow } from "./PrintNow";

export const dynamic = "force-dynamic";

/**
 * The purchase order as a document to send a supplier.
 *
 * NO APP SHELL. A nav bar down the side of an order faxed to a distributor is
 * wasted paper, and `display: none` on print is one stylesheet change away from
 * not working. The simplest way for the chrome not to print is for the page not
 * to have any — the same reasoning as the receipt print view.
 *
 * ON WHITE, always. This app is dark; a dark document is a page of toner.
 */
export default async function PrintPoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");
  if (!can(staff.role, "manageStock")) redirect("/");

  const { id } = await params;
  const { auto } = await searchParams;

  const [po, shop] = await Promise.all([
    // Scoped: another pharmacy's order is not found, not forbidden.
    getPurchaseOrder(staff.pharmacyId, id),
    pharmacyDb(staff.pharmacyId, (tx) =>
      tx.pharmacy.findUnique({
        where: { id: staff.pharmacyId },
        select: { displayName: true, name: true, address: true, phone: true, tin: true },
      }),
    ),
  ]);
  if (!po) notFound();

  const total = po.items.reduce(
    (n, i) => n + i.quantityOrdered * i.unitCostCentavos,
    0,
  );
  const shopName = shop?.displayName ?? shop?.name ?? "";
  const showCost = can(staff.role, "viewReports");

  return (
    <div className="min-h-screen bg-slate-100 py-6 text-black print:bg-white print:py-0">
      <div data-print-hide className="mx-auto mb-6 flex max-w-3xl items-center gap-3 px-6 print:hidden">
        <Link href={`/purchase-orders/${id}`} className="text-sm text-slate-600 hover:underline">
          ← back to the order
        </Link>
        <div className="ml-auto">
          <PrintNow auto={auto === "1"} />
        </div>
      </div>

      <div className="mx-auto max-w-3xl bg-white p-8 shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-6 border-b border-black/20 pb-4">
          <div>
            <h1 className="text-lg font-bold">{shopName}</h1>
            {shop?.address && <p className="text-xs">{shop.address}</p>}
            {shop?.phone && <p className="text-xs">{shop.phone}</p>}
            {shop?.tin && <p className="text-xs">TIN {shop.tin}</p>}
          </div>
          <div className="text-right">
            <p className="text-sm font-bold uppercase tracking-wide">Purchase order</p>
            <p className="font-mono text-lg font-bold">{po.poNumber}</p>
            <p className="text-xs">Raised {manilaDate(po.createdAt)}</p>
            {po.expectedDate && (
              <p className="text-xs">Expected {manilaDate(po.expectedDate)}</p>
            )}
          </div>
        </div>

        <div className="mt-4 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-black/60">To</p>
          {po.supplier ? (
            <>
              <p className="font-semibold">{po.supplier.name}</p>
              {po.supplier.phone && <p className="text-xs">{po.supplier.phone}</p>}
              {po.supplier.email && <p className="text-xs">{po.supplier.email}</p>}
            </>
          ) : (
            // Said plainly rather than left blank: an order with no supplier is
            // a draft, and printing it as if it were addressed hides that.
            <p className="italic text-black/60">No supplier chosen yet — this is a draft.</p>
          )}
        </div>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-black/30 text-left text-xs uppercase tracking-wide">
              <th className="py-2 font-semibold">Item</th>
              <th className="py-2 text-right font-semibold">Qty</th>
              {showCost && (
                <>
                  <th className="py-2 text-right font-semibold">Unit cost</th>
                  <th className="py-2 text-right font-semibold">Line total</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {po.items.map((i) => (
              <tr key={i.id} className="border-b border-black/10 align-top">
                <td className="py-2">
                  {i.product.name}
                  {i.product.genericName && (
                    <span className="block text-xs text-black/60">{i.product.genericName}</span>
                  )}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {i.quantityOrdered} {i.product.unit}
                </td>
                {showCost && (
                  <>
                    <td className="py-2 text-right tabular-nums">{peso(i.unitCostCentavos)}</td>
                    <td className="py-2 text-right tabular-nums">
                      {peso(i.quantityOrdered * i.unitCostCentavos)}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
          {showCost && (
            <tfoot>
              <tr className="font-bold">
                <td className="py-3" colSpan={3}>
                  Total
                </td>
                <td className="py-3 text-right tabular-nums">{peso(total)}</td>
              </tr>
            </tfoot>
          )}
        </table>

        {po.notes && (
          <div className="mt-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-black/60">Notes</p>
            <p className="whitespace-pre-wrap">{po.notes}</p>
          </div>
        )}

        <div className="mt-12 flex gap-12 text-xs">
          <div className="flex-1 border-t border-black/40 pt-1">Prepared by</div>
          <div className="flex-1 border-t border-black/40 pt-1">Received by</div>
        </div>
      </div>
    </div>
  );
}
