import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { listReadings } from "@/server/pharmacy/shifts";
import { peso, manilaDateTime } from "@/lib/money";

export const dynamic = "force-dynamic";

/**
 * Z-readings.
 *
 * The daily summary a registered POS is required to produce, with a sequential
 * counter that is never reset. The VAT breakdown is what the monthly return is
 * built from, and the receipt range is what makes the series auditable — a gap
 * between one reading's last receipt and the next one's first is a question
 * somebody has to answer.
 */
export default async function ReadingsPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");

  const rows = await listReadings(staff.pharmacyId);

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Z-readings</h1>
        <p className="mt-1 mb-8 text-sm text-slate-500">
          Cut automatically when a shift is closed. The counter is sequential and
          never reset.
        </p>

        {rows.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 text-sm text-slate-300">
            No Z-readings yet. One is cut each time a till is closed.
          </p>
        ) : (
          <div className="space-y-4">
            {rows.map((z) => (
              <article key={z.id} className="rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-mono text-lg font-semibold">Z-{z.zCounter}</h2>
                  <p className="text-xs text-slate-500">
                    {manilaDateTime(z.openedAt)} → {manilaDateTime(z.closedAt)}
                  </p>
                </div>

                {z.firstReceiptNumber && (
                  <p className="mt-1 font-mono text-xs text-slate-500">
                    Receipts {z.firstReceiptNumber} – {z.lastReceiptNumber}
                  </p>
                )}

                <div className="mt-3 grid gap-x-8 gap-y-1 text-sm sm:grid-cols-2">
                  <Row label="Sales" value={String(z.salesCount)} />
                  <Row label="Voided" value={String(z.voidedCount)} />
                  <Row label="Gross" value={peso(z.grossCentavos)} />
                  <Row label="Less discounts" value={peso(z.discountCentavos)} />
                  <Row label="Net sales" value={peso(z.netCentavos)} strong />
                  <Row label="VAT-able" value={peso(z.vatableCentavos)} />
                  <Row label="VAT" value={peso(z.vatCentavos)} />
                  <Row label="VAT-exempt (SC/PWD)" value={peso(z.vatExemptCentavos)} />
                  <Row label="Cash" value={peso(z.cashCentavos)} />
                  <Row label="GCash" value={peso(z.gcashCentavos)} />
                  <Row label="Card" value={peso(z.cardCentavos)} />
                  <Row label="Maya" value={peso(z.mayaCentavos)} />
                  {z.otherCentavos > 0 && <Row label="Other" value={peso(z.otherCentavos)} />}
                </div>
              </article>
            ))}
          </div>
        )}
      </main>
    </AppShell>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between border-b border-white/10 py-1">
      <span className="text-slate-500">{label}</span>
      <span className={`tabular-nums ${strong ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}
