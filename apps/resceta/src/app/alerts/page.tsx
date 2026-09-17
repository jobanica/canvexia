import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { catalogue, expiryReport } from "@/server/pharmacy/queries";
import { can } from "@/lib/pharmacy/roles";
import { peso, manilaDate, manilaExpiry } from "@/lib/money";
import { branchContext } from "@/server/pharmacy/branches";

export const dynamic = "force-dynamic";

/**
 * Everything that needs doing about stock, on one screen.
 *
 * WHY THIS IS NOT PART OF THE CATALOGUE. The catalogue is what the pharmacy
 * sells; this is what is wrong with it today. They are read at different
 * times by different people for different reasons — a pharmacist checks this
 * at opening, and edits the catalogue when a new line arrives.
 *
 * EXPIRED IS FIRST, ALWAYS. A batch past its date is not a warning, it is
 * stock that must come off the shelf: dispensing it is an offence and the FDA
 * asks about it at inspection. Sorting it in with "expiring soon" puts the
 * urgent thing in the middle of a long list.
 *
 * NO PERMISSION GATE ON THE PAGE. A cashier who can see that the Amoxicillin
 * on the shelf expired last week is a cashier who does not sell it. Costs are
 * gated — that is margin — but the dates and the counts are not.
 */
export default async function AlertsPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login");

  const showCost = can(staff.role, "viewReports");
  const branch = await branchContext(staff.pharmacyId);
  const [stock, expiring] = await Promise.all([
    catalogue(staff.pharmacyId, new Date(), branch),
    expiryReport(staff.pharmacyId, 90, new Date(), branch),
  ]);

  const expired = expiring.filter((b) => b.expired);
  const soon = expiring.filter((b) => !b.expired);
  const out = stock.filter((p) => p.onHand === 0);
  // Low but not out: an empty shelf is a different job from a thin one, and
  // listing them together means the urgent ones scroll past.
  const low = stock.filter((p) => p.onHand > 0 && p.onHand <= p.reorderPoint);
  const noReorderPoint = stock.filter((p) => p.reorderPoint === 0).length;

  const nothing =
    expired.length === 0 && soon.length === 0 && out.length === 0 && low.length === 0;

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Alerts</h1>
        <p className="mt-1 text-sm text-slate-500">
          What needs doing about stock today
          {branch.multi && ` at ${branch.all ? "every branch" : branch.current?.name}`}. On-hand
          excludes expired batches — they are not sellable, so they are not counted.
        </p>

        {nothing && (
          <p className="mt-8 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
            Nothing to chase. No expired stock, nothing expiring within 90 days,
            and nothing at or below its reorder point.
          </p>
        )}

        {expired.length > 0 && (
          <Section
            title="Expired — take these off the shelf"
            tone="red"
            note={
              showCost
                ? `${peso(expired.reduce((s, b) => s + b.valueCentavos, 0))} to write off`
                : undefined
            }
          >
            <BatchTable rows={expired} showCost={showCost} />
          </Section>
        )}

        {soon.length > 0 && (
          <Section title="Expiring within 90 days" tone="amber" note="Sell or return these first">
            <BatchTable rows={soon} showCost={showCost} />
          </Section>
        )}

        {out.length > 0 && (
          <Section title="Out of stock" tone="red" note="Nothing on the shelf to sell">
            <ProductTable rows={out} />
          </Section>
        )}

        {low.length > 0 && (
          <Section title="At or below the reorder point" tone="amber" note="Time to order more">
            <ProductTable rows={low} />
          </Section>
        )}

        {/*
          A reorder point of zero is not a setting, it is an unanswered
          question: the product can never be low, so it never appears above
          until the shelf is already empty. Saying so is the difference
          between a quiet screen and a working one.
        */}
        {noReorderPoint > 0 && can(staff.role, "manageCatalogue") && (
          <p className="mt-8 rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 text-sm text-slate-300">
            {noReorderPoint} product{noReorderPoint === 1 ? " has" : "s have"} no reorder
            point set, so {noReorderPoint === 1 ? "it" : "they"} can never show as low —
            only as out. Set one in the{" "}
            <Link href="/catalogue" className="font-medium underline">
              catalogue
            </Link>
            .
          </p>
        )}
      </main>
    </AppShell>
  );
}

function Section({
  title,
  note,
  tone,
  children,
}: {
  title: string;
  note?: string;
  tone: "red" | "amber";
  children: React.ReactNode;
}) {
  const dot = tone === "red" ? "bg-red-500/100" : "bg-amber-500/100";
  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
          <span className={`h-2 w-2 rounded-full ${dot}`} />
          {title}
        </h2>
        {note && <span className="text-xs text-slate-500">{note}</span>}
      </div>
      {children}
    </section>
  );
}

function BatchTable({
  rows,
  showCost,
}: {
  rows: {
    batchId: string;
    productName: string;
    lotNumber: string | null;
    expiryDate: Date;
    quantity: number;
    valueCentavos: number;
    expired: boolean;
  }[];
  showCost: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl text-sm">
        <thead className="bg-white/[0.06] text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2 font-medium">Item</th>
            {/* The lot number, not the product, is what a recall names. */}
            <th className="px-4 py-2 font-medium">Lot</th>
            <th className="px-4 py-2 font-medium">Expires</th>
            <th className="px-4 py-2 text-right font-medium">Qty</th>
            {showCost && <th className="px-4 py-2 text-right font-medium">At cost</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {rows.map((b) => (
            <tr key={b.batchId} className={b.expired ? "bg-red-500/10" : undefined}>
              <td className="px-4 py-2">{b.productName}</td>
              <td className="px-4 py-2 font-mono text-xs text-slate-500">
                {b.lotNumber ?? "—"}
              </td>
              <td className="px-4 py-2">
                {manilaExpiry(b.expiryDate)}
                <span className="ml-2 text-xs text-slate-500">{manilaDate(b.expiryDate)}</span>
              </td>
              <td className="px-4 py-2 text-right tabular-nums">{b.quantity}</td>
              {showCost && (
                <td className="px-4 py-2 text-right tabular-nums">{peso(b.valueCentavos)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProductTable({
  rows,
}: {
  rows: {
    id: string;
    name: string;
    genericName: string | null;
    unit: string;
    onHand: number;
    reorderPoint: number;
    requiresPrescription: boolean;
  }[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl text-sm">
        <thead className="bg-white/[0.06] text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2 font-medium">Item</th>
            <th className="px-4 py-2 font-medium">Generic</th>
            <th className="px-4 py-2 text-right font-medium">On hand</th>
            <th className="px-4 py-2 text-right font-medium">Reorder at</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/10">
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="px-4 py-2">
                {p.name}
                {p.requiresPrescription && (
                  <span className="ml-2 rounded bg-violet-500/15 px-1.5 py-0.5 text-xs text-violet-300">
                    Rx
                  </span>
                )}
              </td>
              <td className="px-4 py-2 text-slate-500">{p.genericName ?? "—"}</td>
              <td
                className={`px-4 py-2 text-right tabular-nums ${
                  p.onHand === 0 ? "font-semibold text-red-300" : "font-semibold text-amber-300"
                }`}
              >
                {p.onHand} {p.unit}
              </td>
              <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                {p.reorderPoint}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
