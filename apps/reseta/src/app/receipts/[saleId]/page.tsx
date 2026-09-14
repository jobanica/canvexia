import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { saleForReversal } from "@/server/pharmacy/reversal";
import { canVoid } from "@/lib/pharmacy/reversal";
import { can } from "@/lib/pharmacy/roles";
import { peso, manilaDate } from "@/lib/money";
import { VoidForm, ReturnForm, type ReversalLine } from "./ReversalForms";

export const dynamic = "force-dynamic";

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ saleId: string }>;
}) {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login?next=%2Freceipts");
  if (!can(staff.role, "sell")) redirect("/");

  const { saleId } = await params;
  // Scoped: another pharmacy's sale id is simply not found.
  const sale = await saleForReversal(staff.pharmacyId, saleId);
  if (!sale) notFound();

  const lines: ReversalLine[] = sale.items.map((i) => ({
    saleItemId: i.id,
    productName: i.nameAtTime,
    generic: i.genericAtTime,
    lotNumber: i.lotNumberAtTime,
    quantity: i.quantity,
    alreadyReturned: i.returnItems.reduce((s, r) => s + r.quantity, 0),
    unitPriceCentavos: i.unitPriceCentavos,
  }));

  const voidable = canVoid(
    {
      status: sale.status as "completed" | "voided",
      createdAt: sale.createdAt,
      returnCount: sale._count.returns,
    },
    new Date(),
  );

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Link href="/receipts" className="text-sm text-slate-500 hover:underline">
          ← receipts
        </Link>
        <h1 className="mt-1 flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
          <span className="font-mono">{sale.receiptNumber}</span>
          {sale.status === "voided" && (
            <span className="rounded bg-red-100 px-2 py-0.5 text-sm font-medium text-red-800">
              voided
            </span>
          )}
        </h1>
        <p className="mb-8 text-sm text-slate-500">{manilaDate(sale.createdAt)}</p>

        <section className="mb-8 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <ul className="divide-y divide-slate-100 text-sm">
            {sale.items.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-x-4 px-4 py-2">
                <span className="font-medium">{i.nameAtTime}</span>
                <span className="font-mono text-xs text-slate-500">
                  {i.lotNumberAtTime ?? "no lot"}
                </span>
                <span className="ml-auto tabular-nums text-slate-500">
                  {i.quantity} × {peso(i.unitPriceCentavos)}
                </span>
                <span className="w-24 text-right tabular-nums">
                  {peso(i.quantity * i.unitPriceCentavos)}
                </span>
              </li>
            ))}
          </ul>
          <dl className="space-y-1 border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-600">Subtotal</dt>
              <dd className="tabular-nums">{peso(sale.subtotalCentavos)}</dd>
            </div>
            {sale.discountCentavos > 0 && (
              <div className="flex justify-between text-emerald-700">
                <dt>Discount ({sale.discountType})</dt>
                <dd className="tabular-nums">−{peso(sale.discountCentavos)}</dd>
              </div>
            )}
            <div className="flex justify-between font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{peso(sale.totalCentavos)}</dd>
            </div>
            {sale.vatExemptCentavos > 0 && (
              <div className="flex justify-between text-xs text-slate-500">
                <dt>VAT-exempt</dt>
                <dd className="tabular-nums">{peso(sale.vatExemptCentavos)}</dd>
              </div>
            )}
          </dl>
        </section>

        {sale.returns.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Credit notes
            </h2>
            <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
              {sale.returns.map((r) => {
                const restocked = r.items
                  .filter((i) => i.disposition === "restocked")
                  .reduce((s, i) => s + i.quantity, 0);
                const destroyed = r.items
                  .filter((i) => i.disposition === "destroyed")
                  .reduce((s, i) => s + i.quantity, 0);
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 px-4 py-2">
                    <span className="font-mono text-xs text-slate-500">{r.returnNumber}</span>
                    <span className="text-slate-500">{manilaDate(r.createdAt)}</span>
                    {r.reason && <span className="text-slate-600">{r.reason}</span>}
                    <span className="text-xs text-slate-500">
                      {restocked > 0 && `${restocked} restocked`}
                      {restocked > 0 && destroyed > 0 && " · "}
                      {destroyed > 0 && `${destroyed} written off`}
                    </span>
                    <span className="ml-auto tabular-nums">−{peso(r.totalCentavos)}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {sale.status === "voided" ? (
          <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
            This receipt was voided. The stock went back to the batches it came
            from and the figures above are kept as they were printed.
          </p>
        ) : (
          <div className="space-y-8">
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                Return
              </h2>
              <ReturnForm
                saleId={sale.id}
                lines={lines}
                canRestock={can(staff.role, "manageStock")}
              />
            </section>

            {can(staff.role, "voidSale") && (
              <section>
                <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Void
                </h2>
                {voidable.ok ? (
                  <VoidForm saleId={sale.id} receiptNumber={sale.receiptNumber} />
                ) : (
                  <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
                    {voidable.message}
                  </p>
                )}
              </section>
            )}
          </div>
        )}
      </main>
    </AppShell>
  );
}
