import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { saleForReversal } from "@/server/pharmacy/reversal";
import { canVoid } from "@/lib/pharmacy/reversal";
import { summaryRows } from "@/lib/pharmacy/receipt";
import type { DiscountType } from "@/lib/pharmacy/discount";
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
            <span className="rounded bg-red-500/15 px-2 py-0.5 text-sm font-medium text-red-300">
              voided
            </span>
          )}
        </h1>
        <p className="mb-8 flex flex-wrap items-center gap-3 text-sm text-slate-500">
          {manilaDate(sale.createdAt)}
          <Link
            href={`/receipts/${sale.id}/print`}
            className="font-medium text-slate-200 underline"
          >
            Print receipt
          </Link>
        </p>

        <section className="mb-8 overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] backdrop-blur-xl">
          <ul className="divide-y divide-white/10 text-sm">
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
          {/* The same rows the paper receipt prints, from the same function.
              This used to show "Discount (sc) −₱32.00", which on a ₱112 shelf
              price states a 28.6% discount — the other ₱12 is VAT that came off
              before it. Two screens disagreeing about a statutory figure is
              worse than either of them being wrong alone. */}
          <dl className="space-y-1 border-t border-white/10 bg-white/[0.06] px-4 py-3 text-sm">
            {summaryRows(
              {
                subtotalCentavos: sale.subtotalCentavos,
                discountCentavos: sale.discountCentavos,
                totalCentavos: sale.totalCentavos,
                discountType: sale.discountType as DiscountType,
              },
              staff.vatRatePct,
            ).map((row, i) => (
              <div
                key={i}
                className={`flex justify-between ${
                  row.kind === "due" ? "font-semibold" : "text-slate-300"
                }`}
              >
                <dt>{row.label}</dt>
                <dd className="tabular-nums">
                  {row.kind === "deduction" ? `−${peso(row.centavos)}` : peso(row.centavos)}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {sale.returns.length > 0 && (
          <section className="mb-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Credit notes
            </h2>
            <ul className="divide-y divide-white/10 overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] backdrop-blur-xl text-sm">
              {sale.returns.map((r) => {
                const restocked = r.items
                  .filter((i) => i.disposition === "restocked")
                  .reduce((s, i) => s + i.quantity, 0);
                const destroyed = r.items
                  .filter((i) => i.disposition === "destroyed")
                  .reduce((s, i) => s + i.quantity, 0);
                return (
                  <li key={r.id} className="flex flex-wrap items-center gap-x-3 px-4 py-2">
                    <Link
                      href={`/returns/${r.id}/print?from=${sale.id}`}
                      className="font-mono text-xs text-slate-200 underline"
                    >
                      {r.returnNumber}
                    </Link>
                    <span className="text-slate-500">{manilaDate(r.createdAt)}</span>
                    {r.reason && <span className="text-slate-300">{r.reason}</span>}
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
          <p className="rounded-lg border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 text-sm text-slate-300">
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
                  <p className="rounded-lg border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 text-sm text-slate-300">
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
