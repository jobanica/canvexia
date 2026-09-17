import { requirePartnerPageWith } from "@/server/partners/auth";
import { pendingRenewals } from "@/server/billing/renewals";
import { signBillingFile } from "@/server/storage/partner-billing";
import { PortalShell } from "@/components/partner/PortalShell";
import { RenewalReview } from "@/components/partner/RenewalReview";
import { PayQrForm } from "@/components/partner/PayQrForm";
import { systemDb } from "@/server/tenancy/scoped-db";
import { peso } from "@/components/partner/Overview";

/**
 * Renewals waiting on a person.
 *
 * `merchants.change_plan` — confirming a renewal extends the merchant's plan.
 * Sales sells and support answers; neither decides whether money arrived.
 *
 * Oldest first, because a restaurant that has paid and is waiting is a
 * restaurant one bad day away from being suspended for it.
 */
export default async function PartnerRenewalsPage() {
  const partner = await requirePartnerPageWith("merchants.change_plan");
  const rows = await pendingRenewals(partner.id);
  const pay = await systemDb((tx) =>
    tx.partner.findUnique({
      where: { id: partner.id },
      select: { payQrPath: true, payInstructions: true },
    }),
  ).catch(() => null);
  const payQrUrl = await signBillingFile(pay?.payQrPath ?? null);

  // Signed server-side, ten minutes: a receipt is a screenshot of somebody's
  // e-wallet, with their name and often their balance on it.
  const signed = new Map(
    await Promise.all(rows.map(async (r) => [r.id, await signBillingFile(r.receiptPath)] as const)),
  );

  return (
    <PortalShell
      partner={partner}
      title="Renewals"
      subtitle="Merchants who say they have paid. Confirming one extends their plan and records your share."
    >
      <div className="mt-6">
        <PayQrForm qrUrl={payQrUrl} instructions={pay?.payInstructions ?? ""} />
      </div>

      {rows.length === 0 ? (
        <div className="mt-6 rounded-tile border border-dashed border-brand-ink/15 bg-white p-10 text-center">
          <p className="font-heading text-lg font-bold">Nothing waiting</p>
          <p className="mt-1 text-sm text-brand-ink/55">
            When a merchant taps Renew and uploads a receipt, it lands here.
          </p>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((r) => (
            <RenewalReview
              key={r.id}
              renewalId={r.id}
              merchantName={r.merchantName}
              amountPesos={Math.round(r.amountCentavos / 100)}
              receiptUrl={signed.get(r.id) ?? null}
              hasReceipt={!!r.receiptPath}
              requestedAt={r.requestedAt.toLocaleDateString("en-PH")}
            />
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-brand-ink/40">
        Confirming records the payment on your statement and adds CANVEXIA&rsquo;s share to what
        you owe. {rows.length > 0 && `${peso(rows.reduce((n, r) => n + r.amountCentavos, 0))} waiting.`}
      </p>
    </PortalShell>
  );
}
