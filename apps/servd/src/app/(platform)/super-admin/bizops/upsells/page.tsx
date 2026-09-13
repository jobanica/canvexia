import Link from "next/link";
import { requireSuperAdminPage } from "@/server/tenancy/require-admin";
import { getPortfolio } from "@/server/bizops/portfolio";
import { fmtPeso } from "@/lib/bizops/metrics";
import { LogUpsellButton } from "@/components/super-admin/LogUpsellButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Upsells · Servd" };

/**
 * Who to offer what, and why.
 *
 * The reason column is the point. A list of names with no reason becomes a
 * script somebody reads out; the reason is what makes the call land, and it is
 * derived from that shop's own numbers rather than from a segment label.
 *
 * Restaurants with nothing worth offering are absent, deliberately — a call
 * list padded with everybody is a call list nobody works.
 */
export default async function UpsellsPage() {
  await requireSuperAdminPage();
  const rows = (await getPortfolio()) ?? [];
  const withOffers = rows.filter((r) => r.upsells.length > 0 && r.status === "active");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/super-admin/bizops" className="text-sm text-plum-ink/50">
          ← Business
        </Link>
        <h1 className="font-heading text-2xl font-bold">Upsell opportunities</h1>
        <p className="max-w-2xl text-sm text-plum-ink/50">
          Rule-driven, from each shop&apos;s own usage. Logging an offer records it on their
          timeline — it does not message anyone.
        </p>
      </div>

      {withOffers.length === 0 ? (
        <div className="rounded-tile border border-plum-ink/10 bg-white p-8 text-center">
          <p className="text-2xl">🤷</p>
          <p className="mt-2 text-sm text-plum-ink/55">
            Nothing worth offering right now. Everybody is comfortably inside their plan.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {withOffers.map((r) => (
            <div key={r.id} className="rounded-tile border border-plum-ink/10 bg-white p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  href={`/super-admin/bizops/customers/${r.id}`}
                  className="font-heading font-bold hover:text-brand-primary hover:underline"
                >
                  {r.name}
                </Link>
                <span className="text-xs text-plum-ink/45">
                  {r.ordersThisMonth} orders this month · paid {fmtPeso(r.lifetimeValue)} so far
                </span>
              </div>
              <ul className="mt-2 space-y-2">
                {r.upsells.map((u) => (
                  <li
                    key={u.product}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-cream/50 px-3 py-2"
                  >
                    <span className="min-w-0 text-sm">
                      <span className="font-semibold capitalize">{u.product.replace("_", " ")}</span>
                      <span className="block text-xs text-plum-ink/60">{u.reason}</span>
                    </span>
                    <LogUpsellButton restaurantId={r.id} product={u.product} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
