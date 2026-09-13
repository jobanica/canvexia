import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperAdminPage } from "@/server/tenancy/require-admin";
import { systemDb } from "@/server/tenancy/scoped-db";
import { getTimeline } from "@/server/bizops/queries";
import { getPlanBannerData } from "@/server/billing/plan-status";
import { manilaDateTime } from "@/lib/time/manila";
import { capBand, capPercent, fmtPeso, fmtRate } from "@/lib/bizops/metrics";

export const dynamic = "force-dynamic";

const BAND_STYLE: Record<string, string> = {
  unlimited: "bg-plum-ink/5 text-plum-ink/50",
  ok: "bg-emerald-100 text-emerald-800",
  opportunity: "bg-amber-100 text-amber-900",
  notify: "bg-amber-200 text-amber-900",
  prompt: "bg-orange-200 text-orange-900",
  capped: "bg-red-600 text-white",
};

const EVENT_LABEL: Record<string, string> = {
  lead_created: "Lead created",
  preview_sent: "Preview sent",
  stage_change: "Stage changed",
  payment: "Payment",
  activation: "Activated",
  cap_reached: "Hit the order cap",
  upsell_offered: "Upsell offered",
  upsell_sold: "Upsell sold",
  note: "Note",
};

/**
 * Everything known about one customer, on one page.
 *
 * The money list is built from payment records, never from a price list — the
 * amounts shown are what was actually charged at the time, which is the only
 * figure that stays right across two pricing changes.
 */
export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireSuperAdminPage();
  const { id } = await params;

  const restaurant = await systemDb((tx) =>
    tx.restaurant.findFirst({
      where: { id },
      select: {
        id: true,
        name: true,
        displayName: true,
        slug: true,
        status: true,
        createdAt: true,
        contactPhone: true,
        contactFb: true,
      },
    }),
  ).catch(() => null);
  if (!restaurant) notFound();

  const [timeline, payments, unlocks, usage] = await Promise.all([
    getTimeline(id, null),
    systemDb((tx) =>
      tx.activationRequest.findMany({
        where: { restaurantId: id, paidAt: { not: null } },
        orderBy: { paidAt: "desc" },
        select: { id: true, amount: true, paidAt: true, note: true },
      }),
    ).catch(() => []),
    systemDb((tx) =>
      tx.addonPurchase.findMany({
        where: { restaurantId: id, status: "paid" },
        orderBy: { paidAt: "desc" },
        select: { id: true, addon: true, amount: true, paidAt: true },
      }),
    ).catch(() => []),
    getPlanBannerData(id).catch(() => null),
  ]);

  const totalPaid =
    payments.reduce((s, p) => s + p.amount, 0) + unlocks.reduce((s, u) => s + u.amount, 0);
  const band = usage ? capBand(usage.ordersThisMonth, usage.cap) : "unlimited";
  const pct = usage ? capPercent(usage.ordersThisMonth, usage.cap) : null;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href="/super-admin/bizops" className="text-sm text-plum-ink/50">
          ← Business
        </Link>
        <h1 className="font-heading text-2xl font-bold">
          {restaurant.displayName || restaurant.name}
        </h1>
        <p className="text-sm text-plum-ink/50">
          {restaurant.status} · joined {manilaDateTime(restaurant.createdAt)}
          {restaurant.contactPhone && ` · ${restaurant.contactPhone}`}
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <a
            href={`/r/${restaurant.slug}`}
            target="_blank"
            rel="noopener"
            className="rounded-full border border-plum-ink/15 px-3 py-1 font-semibold hover:bg-cream"
          >
            Open their site ↗
          </a>
          {restaurant.contactFb && (
            <a
              href={restaurant.contactFb}
              target="_blank"
              rel="noopener"
              className="rounded-full border border-plum-ink/15 px-3 py-1 font-semibold hover:bg-cream"
            >
              Facebook ↗
            </a>
          )}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card label="Total paid" value={fmtPeso(totalPaid)} />
        <Card label="Orders this month" value={usage ? String(usage.ordersThisMonth) : "—"} />
        <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
          <p className="text-xs font-medium text-plum-ink/50">Against cap</p>
          <p className="mt-1 font-heading text-2xl font-extrabold">
            {band === "unlimited" ? "Unlimited" : fmtRate(pct)}
          </p>
          <span
            className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${BAND_STYLE[band]}`}
          >
            {band}
          </span>
        </div>
      </div>

      <div>
        <h2 className="mb-2 font-heading text-lg font-bold">Payments</h2>
        {payments.length === 0 && unlocks.length === 0 ? (
          <p className="text-sm text-plum-ink/50">Nothing paid yet.</p>
        ) : (
          <div className="divide-y divide-plum-ink/10 rounded-tile border border-plum-ink/10 bg-white">
            {payments.map((p) => (
              <Line
                key={p.id}
                label={p.note === "branch-activation" ? "Extra branch" : "Activation"}
                when={p.paidAt}
                amount={p.amount}
              />
            ))}
            {unlocks.map((u) => (
              <Line key={u.id} label={`Unlock — ${u.addon}`} when={u.paidAt} amount={u.amount} />
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="mb-2 font-heading text-lg font-bold">Timeline</h2>
        {timeline.length === 0 ? (
          <p className="text-sm text-plum-ink/50">
            Nothing recorded yet. Events start appearing from the moment{" "}
            <code className="font-mono text-xs">add-business-ops.sql</code> is run — this is not a
            backfill of past history, deliberately.
          </p>
        ) : (
          <ol className="space-y-2">
            {timeline.map((e) => (
              <li key={e.id} className="rounded-tile border border-plum-ink/10 bg-white px-4 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold">
                    {EVENT_LABEL[e.eventType] ?? e.eventType}
                    {e.amount != null && (
                      <span className="ml-2 text-brand-primary">{fmtPeso(e.amount)}</span>
                    )}
                  </span>
                  <span className="text-xs text-plum-ink/40">
                    {manilaDateTime(e.occurredAt)}
                    {e.actor && ` · ${e.actor}`}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
      <p className="text-xs font-medium text-plum-ink/50">{label}</p>
      <p className="mt-1 font-heading text-2xl font-extrabold">{value}</p>
    </div>
  );
}

function Line({
  label,
  when,
  amount,
}: {
  label: string;
  when: Date | null;
  amount: number;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-2 text-sm">
      <span>
        {label}
        {when && <span className="ml-2 text-xs text-plum-ink/40">{manilaDateTime(when)}</span>}
      </span>
      <span className="font-semibold tabular-nums">{fmtPeso(amount)}</span>
    </div>
  );
}
