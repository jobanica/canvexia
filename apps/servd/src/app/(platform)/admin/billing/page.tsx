import Link from "next/link";
import { requireAdminPage } from "@/server/tenancy/require-admin";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { getCurrentSubscription } from "@/server/billing/subscription";
import { PayNowButton } from "@/components/admin/PayNowButton";
import { formatPeso } from "@/lib/money";
import { manilaDate } from "@/lib/time/manila";
import { RenewPanel } from "@/components/billing/RenewPanel";
import { openRenewal, lastDecidedRenewal } from "@/server/billing/renewals";
import { signBillingFile } from "@/server/storage/partner-billing";
import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * BILLING IS THREE QUESTIONS NOW: when does it run out, how do I renew, and
 * what have I paid?
 *
 * The feature store that used to sit in the middle of this page is gone. It
 * made sense when Servd sold features one at a time; with a single ₱999 plan
 * that includes all of them, it had become twenty rows all reading "Included"
 * above a header saying "Nothing bought yet" — a shelf with nothing on it,
 * between an owner and the two things they came here to do.
 *
 * `getPlanAccess`, `listOwnedFeatures` and `getFeaturePrices` are untouched and
 * still gate every feature. Nothing about what a shop can DO changes here; this
 * page simply stops narrating it.
 */

function daysLeft(date: Date | null): number | null {
  if (!date) return null;
  return Math.max(0, Math.ceil((date.getTime() - Date.now()) / 86400000));
}

export default async function BillingPage() {
  // allowSuspended so an owner can pay their way out of suspension here.
  const { restaurantId } = await requireAdminPage({ allowSuspended: true });

  const [sub, invoices] = await Promise.all([
    getCurrentSubscription(restaurantId),
    tenantDb(restaurantId, (tx) =>
      tx.restaurantInvoice.findMany({ orderBy: { createdAt: "desc" }, take: 12 }),
    ),
  ]);

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


  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin" className="text-sm text-plum-ink/50">← Dashboard</Link>
        <h1 className="font-heading text-2xl font-bold">Billing</h1>
        <p className="text-sm text-plum-ink/50">
          Everything except the content scheduler is included in Servd, ₱999/mo.
        </p>
      </div>

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
