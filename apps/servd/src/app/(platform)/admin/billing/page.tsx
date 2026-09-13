import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { getCurrentSubscription } from "@/server/billing/subscription";
import { PayNowButton } from "@/components/admin/PayNowButton";
import { FeatureStore, type StoreRow } from "@/components/billing/FeatureStore";
import { getPlanAccess } from "@/server/billing/feature-gate";
import { listOwnedFeatures, addonKeyFor } from "@/server/billing/owned-features";
import { getFeaturePrices } from "@/server/billing/feature-pricing";
import { FEATURE_META, type Feature } from "@/lib/billing/features";
import { formatPeso } from "@/lib/money";
import { manilaDate } from "@/lib/time/manila";

const FEATURE_LABEL: Record<string, string> = Object.fromEntries(
  FEATURE_META.map((f) => [f.key, f.label]),
);

function daysLeft(date: Date | null): number | null {
  if (!date) return null;
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86400000));
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams: Promise<{ upgrade?: string; unlocked?: string }>;
}) {
  const { upgrade, unlocked } = await searchParams;
  // allowSuspended so an owner can pay their way out of suspension here.
  const { restaurantId } = await requireAdminPage({ allowSuspended: true });

  const [sub, invoices, access, owned, prices, pendingRows] = await Promise.all([
    getCurrentSubscription(restaurantId),
    tenantDb(restaurantId, (tx) =>
      tx.restaurantInvoice.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
    ),
    getPlanAccess(restaurantId),
    listOwnedFeatures(restaurantId),
    getFeaturePrices(),
    tenantDb(restaurantId, (tx) =>
      tx.addonPurchase.findMany({ where: { status: "pending" }, select: { addon: true } }),
    ).catch(() => [] as { addon: string }[]),
  ]);

  const pendingAddons = new Set(pendingRows.map((r) => r.addon));
  const onTrial = sub?.status === "trialing" && !!sub.trialEndsAt && new Date(sub.trialEndsAt).getTime() > Date.now();
  const trialDays = onTrial ? daysLeft(sub!.trialEndsAt) : null;

  const needsPayment = sub?.status === "past_due";

  const rows: StoreRow[] = FEATURE_META
    // A retired feature is listed only for the shops that already bought it —
    // there's no sense showing everyone else something they can't buy and
    // wouldn't want.
    .filter((f) => !f.retired || owned.has(f.key as Feature))
    .map((f) => {
    const key = f.key as Feature;
    const priced = prices[key];
    return {
      key,
      label: f.label,
      group: f.group,
      pricePesos: Math.round(priced.price / 100),
      owned: owned.has(key),
      // A live trial temporarily unlocks everything — don't call that "included",
      // or nothing would look buyable during the trial.
      includedInPlan: !onTrial && access.features.has(key) && !owned.has(key),
      sellable: priced.enabled && priced.price > 0,
      pending: pendingAddons.has(addonKeyFor(key)),
    };
  });

  const ownedCount = rows.filter((r) => r.owned).length;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">← Dashboard</Link>
        <h1 className="font-heading text-2xl font-bold">Billing &amp; features</h1>
        <p className="text-sm text-plum-ink/50">
          Buy a feature once and keep it forever — no monthly subscription.
        </p>
      </div>

      {unlocked && FEATURE_LABEL[unlocked] && (
        <div className="rounded-tile border border-mango/40 bg-mango/10 p-4 text-sm font-semibold text-plum-ink">
          ✓ Payment received — <span className="font-bold">{FEATURE_LABEL[unlocked]}</span> is unlocked.
          If it still shows as locked, use “Already paid? Check” below.
        </div>
      )}

      {upgrade && FEATURE_LABEL[upgrade] && (
        <div className="rounded-tile border border-mango/40 bg-mango/10 p-4 text-sm text-plum-ink">
          🔒 <span className="font-semibold">{FEATURE_LABEL[upgrade]}</span> is locked. Unlock it once
          below and it&apos;s yours for good.
        </div>
      )}

      {trialDays !== null && (
        <div className="rounded-tile border border-brand-primary/30 bg-brand-primary/5 p-5">
          <p className="font-heading text-lg font-bold text-brand-primary">
            ✨ {trialDays} day{trialDays === 1 ? "" : "s"} left in your free trial
          </p>
          <p className="mt-1 text-sm text-plum-ink/70">
            <strong>Every feature is unlocked</strong> until your trial ends. After that you keep QR
            ordering, the POS, kitchen display and your ordering page for free — anything else needs
            a one-time unlock. Buy what you want to keep now and it stays yours; there&apos;s no
            monthly subscription either way.
          </p>
        </div>
      )}

      {needsPayment && (
        <div className="rounded-tile border border-guava/40 bg-guava/10 p-5">
          <p className="font-heading font-bold text-plum-ink">Payment needed</p>
          <p className="mt-1 text-sm text-plum-ink/70">
            There&apos;s an unpaid invoice on your account. Settle it to restore full access.
          </p>
          <div className="mt-3"><PayNowButton /></div>
        </div>
      )}

      {/* Your features */}
      <div>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-heading text-lg font-bold">Your features</h2>
          <p className="text-sm text-plum-ink/50">
            {ownedCount > 0 ? `${ownedCount} owned outright` : "Nothing bought yet"}
          </p>
        </div>
        <FeatureStore rows={rows} />
      </div>

      {/* Invoices */}
      <div>
        <h2 className="mb-2 font-heading text-lg font-bold">Payment history</h2>
        {invoices.length === 0 ? (
          <p className="text-sm text-plum-ink/50">No payments yet.</p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead className="text-plum-ink/50">
              <tr><th className="py-2">Date</th><th>Amount</th><th>Status</th></tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-plum-ink/10">
                  <td className="py-2">{manilaDate(inv.createdAt)}</td>
                  <td>{formatPeso(inv.amount)}</td>
                  <td>{inv.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}
