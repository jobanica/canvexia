import Link from "next/link";
import { notFound } from "next/navigation";
import { resolveSlug, catalogue, expiryReport, recentSales } from "@/server/pharmacy/queries";
import { peso, manilaDate } from "@/lib/money";

export const dynamic = "force-dynamic";

/**
 * One pharmacy's dashboard.
 *
 * Two questions, in the order a pharmacist actually asks them: what is about to
 * expire, and what is about to run out. Sales are third — they are the record,
 * not the decision.
 */
export default async function PharmacyDashboard({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const pharmacy = await resolveSlug(slug);
  if (!pharmacy) notFound();

  const [stock, expiring, sales] = await Promise.all([
    catalogue(pharmacy.id),
    expiryReport(pharmacy.id, 90),
    recentSales(pharmacy.id, 10),
  ]);

  const lowStock = stock.filter((p) => p.onHand <= p.reorderPoint);
  const expired = expiring.filter((b) => b.expired);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link href="/" className="text-sm text-slate-500 hover:underline">
            ← all pharmacies
          </Link>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {pharmacy.displayName ?? pharmacy.name}
          </h1>
        </div>
        <Link
          href={`/${slug}/pos`}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700"
        >
          Open the counter
        </Link>
      </header>

      {pharmacy.status !== "active" && (
        <p className="mb-8 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          This pharmacy is <strong>{pharmacy.status}</strong>. A pharmacy is
          created pending on purpose — it cannot legally dispense before its FDA
          Licence to Operate is on file, and defaulting to active would put the
          platform in the position of having enabled it.
        </p>
      )}

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Expiring within 90 days
          {expired.length > 0 && (
            <span className="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs normal-case text-red-800">
              {expired.length} already expired
            </span>
          )}
        </h2>
        {expiring.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
            Nothing expiring in the window.
          </p>
        ) : (
          <table className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-4 py-2 font-medium">Lot</th>
                <th className="px-4 py-2 font-medium">Expires</th>
                <th className="px-4 py-2 text-right font-medium">Qty</th>
                <th className="px-4 py-2 text-right font-medium">At cost</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {expiring.map((b) => (
                <tr key={b.batchId} className={b.expired ? "bg-red-50" : undefined}>
                  <td className="px-4 py-2">{b.productName}</td>
                  <td className="px-4 py-2 font-mono text-xs text-slate-500">
                    {b.lotNumber ?? "—"}
                  </td>
                  <td className="px-4 py-2">
                    {manilaDate(b.expiryDate)}
                    {b.expired && (
                      <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-800">
                        expired
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{b.quantity}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {peso(b.valueCentavos)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Stock
        </h2>
        {stock.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
            No products yet.
          </p>
        ) : (
          <table className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-4 py-2 font-medium">Generic</th>
                <th className="px-4 py-2 text-right font-medium">Price</th>
                <th className="px-4 py-2 text-right font-medium">On hand</th>
                <th className="px-4 py-2 font-medium">Soonest expiry</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stock.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-2">
                    {p.name}
                    {p.requiresPrescription && (
                      <span className="ml-2 rounded bg-violet-100 px-1.5 py-0.5 text-xs text-violet-800">
                        Rx
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-500">{p.genericName ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {peso(p.priceCentavos)}
                  </td>
                  <td
                    className={`px-4 py-2 text-right tabular-nums ${
                      p.onHand <= p.reorderPoint ? "font-semibold text-red-700" : ""
                    }`}
                  >
                    {p.onHand} {p.unit}
                  </td>
                  <td className="px-4 py-2 text-slate-500">
                    {p.soonestExpiry ? manilaDate(p.soonestExpiry) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {lowStock.length > 0 && (
          <p className="mt-2 text-xs text-slate-500">
            {lowStock.length} item{lowStock.length === 1 ? "" : "s"} at or below the
            reorder point. On-hand excludes expired stock — it is not sellable, so
            it is not counted.
          </p>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Recent sales
        </h2>
        {sales.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
            No sales yet.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200 bg-white text-sm">
            {sales.map((s) => (
              <li key={s.id} className="flex items-center justify-between px-4 py-2">
                <span className="font-mono text-xs text-slate-500">
                  {s.receiptNumber}
                </span>
                <span className="flex items-center gap-3">
                  {s.discountType !== "none" && (
                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-xs uppercase text-emerald-800">
                      {s.discountType}
                    </span>
                  )}
                  {s.vatExemptCentavos > 0 && (
                    <span className="text-xs text-slate-500">VAT-exempt</span>
                  )}
                  <span className="tabular-nums">{peso(s.totalCentavos)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
