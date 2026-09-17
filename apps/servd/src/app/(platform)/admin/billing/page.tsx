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
import { RenewPanel } from "@/components/billing/RenewPanel";
import { openRenewal, lastDecidedRenewal } from "@/server/billing/renewals";
import { signBillingFile } from "@/server/storage/partner-billing";
import { systemDb } from "@/server/tenancy/scoped-db";

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

  /**
   * WHEN THE ACCOUNT RUNS OUT, so it can be renewed before it does.
   *
   * `currentPeriodEnd` is the date the shop is paid up to. It was never shown
   * anywhere, so the first an owner knew about a lapse was the day something
   * stopped working — and on a partner-sold account, where the partner
   * collects in cash, "renew in advance" is the only thing that can happen.
   *
   * Not shown during a trial: the trial banner below already answers "how long
   * have I got", and two countdowns disagreeing about it is worse than one.
   * Not shown on ₱0 Free either — that period rolls forward forever and an
   * expiry date on it would be a deadline nobody has.
   */
  const paidUntil = !onTrial && (sub?.plan.priceMonthly ?? 0) > 0 ? (sub?.currentPeriodEnd ?? null) : null;

  /**
   * RENEWING, which for a partner-sold shop means paying a person.
   *
   * The partner takes the money (`collectionMode: "partner_collects"`), so this
   * shows THEIR payment code and THEIR name — not a card form, and not Servd's.
   * Offered only on a paid plan: the ₱0 plan has nothing to renew.
   */
  const renewable = (sub?.plan.priceMonthly ?? 0) > 0 && !onTrial;
  const [renewal, lastDecided, ownerId] = renewable
    ? await Promise.all([
        openRenewal(restaurantId),
        lastDecidedRenewal(restaurantId),
        systemDb((tx) =>
          tx.restaurant
            .findUnique({ where: { id: restaurantId }, select: { partnerId: true } })
            .then((r) => r?.partnerId ?? null),
        ).catch(() => null),
      ])
    : [null, null, null];
  // Two steps rather than a join: `Restaurant` carries `partnerId` as a plain
  // column and has no relation to follow — see the note on the ledger about
  // merchant ids being product-scoped.
  const partnerPay = ownerId
    ? await systemDb((tx) =>
        tx.partner.findUnique({
          where: { id: ownerId },
          select: { name: true, payQrPath: true, payInstructions: true },
        }),
      ).catch(() => null)
    : null;
  const qrUrl = await signBillingFile(partnerPay?.payQrPath ?? null);
  const untilDays = daysLeft(paidUntil);
  // A fortnight is enough notice to move money in cash, which is how a
  // partner-sold account is actually paid for.
  const renewSoon = untilDays !== null && untilDays <= 14;
  const lapsed = untilDays !== null && untilDays === 0 && !!paidUntil && paidUntil.getTime() <= Date.now();

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
          Everything except the content scheduler is included in Servd, ₱999/mo. Anything you
          bought outright before that stays yours, for good.
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
          🔒 <span className="font-semibold">{FEATURE_LABEL[upgrade]}</span> is locked on your
          account. It is included in Servd — ask whoever set you up to move you onto it.
        </div>
      )}

      {trialDays !== null && (
        <div className="rounded-tile border border-brand-primary/30 bg-brand-primary/5 p-5">
          <p className="font-heading text-lg font-bold text-brand-primary">
            ✨ {trialDays} day{trialDays === 1 ? "" : "s"} left in your free trial
          </p>
          <p className="mt-1 text-sm text-plum-ink/70">
            <strong>Every feature is unlocked</strong> until your trial ends — except the content
            scheduler, which is its own ₱499/mo. After that it is ₱999/mo for all of it, and
            anything you already own outright stays yours whatever you decide.
          </p>
        </div>
      )}

      {paidUntil && (
        <div
          className={`rounded-tile border p-5 ${
            lapsed
              ? "border-guava/40 bg-guava/10"
              : renewSoon
                ? "border-mango/40 bg-mango/10"
                : "border-plum-ink/10 bg-white"
          }`}
        >
          <p className="font-heading text-lg font-bold text-plum-ink">
            {lapsed
              ? "Your plan has run out"
              : `Your plan runs until ${manilaDate(paidUntil)}`}
          </p>
          <p className="mt-1 text-sm text-plum-ink/70">
            {lapsed ? (
              <>
                It ran out on {manilaDate(paidUntil)}. Renew with whoever set up your account to
                keep everything switched on.
              </>
            ) : (
              <>
                {untilDays} day{untilDays === 1 ? "" : "s"} left
                {renewSoon ? " — renew now so nothing stops." : "."} Renew with whoever set up
                your account; you can pay any time before that date.
              </>
            )}
          </p>
        </div>
      )}

      {renewable && (
        <RenewPanel
          status={
            renewal?.status === "receipt_uploaded"
              ? "receipt_uploaded"
              : renewal
                ? "requested"
                : "none"
          }
          qrUrl={qrUrl}
          instructions={partnerPay?.payInstructions ?? null}
          partnerName={partnerPay?.name ?? "your partner"}
          rejectedNote={lastDecided?.status === "rejected" ? lastDecided.note : null}
        />
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
              <tr><th className="py-2">Date</th><th>Amount</th><th>Status</th><th className="text-right">Invoice</th></tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-t border-plum-ink/10">
                  <td className="py-2">{manilaDate(inv.createdAt)}</td>
                  <td>{formatPeso(inv.amount)}</td>
                  <td>{inv.status}</td>
                  <td className="text-right">
                    {/* Only a partner-issued row has an invoice to show; the
                        rest are Servd's own gateway records with nothing to
                        print. Linking them all would be a dead link most of
                        the time. */}
                    {inv.issuedByPartnerId && (
                      <Link
                        href={`/admin/invoices/${inv.id}`}
                        className="font-semibold text-brand-primary underline"
                      >
                        {inv.invoiceNo ?? "View"}
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}
