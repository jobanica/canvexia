import { getCustomerTerms } from "@servd/core/agent-kit";
import { ReceiptUploadForm } from "@servd/core/agent-kit/react";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { paymentInstructions, portalConfig } from "@/server/agent-portal/config";
import { submitReceiptAction } from "@/server/agent-portal/receipt-actions";
import { canSubmitActivation, coverageEnd, monthKeyOfDate, nextBillingMonth } from "@/lib/billing/manual";
import { formatPeso } from "@/lib/money";
import { manilaDate } from "@/lib/time/manila";
import { SignAgreementButton } from "@/components/billing/SignAgreementButton";

const STATUS_LABEL: Record<string, string> = {
  submitted: "Waiting for review",
  confirmed: "Confirmed",
  rejected: "Not accepted",
  reversed: "Reversed",
};
const STATUS_CLASS: Record<string, string> = {
  submitted: "bg-mango/15 text-plum-ink",
  confirmed: "bg-emerald-100 text-emerald-900",
  rejected: "bg-guava/15 text-guava",
  reversed: "bg-plum-ink/10 text-plum-ink/70",
};

/**
 * Billing for a restaurant on manual payment (D37): pay by QR or bank
 * transfer to the company account, then upload the receipt here.
 *
 * Prices come from the agent portal — the commission rule this restaurant
 * signed up under — not from anything in Servd, so they are set in one place.
 * If the portal cannot be reached the form still works; it just cannot
 * suggest the amount.
 */
export async function ManualBilling({ restaurantId }: { restaurantId: string }) {
  const config = portalConfig();
  const instructions = paymentInstructions();
  const [data, terms] = await Promise.all([
    tenantDb(restaurantId, async (tx) => ({
      restaurant: await tx.restaurant.findFirst({ select: { activationPaidAt: true, contractSignedAt: true } }),
      payments: await tx.servdManualPayment.findMany({ orderBy: { submittedAt: "desc" }, take: 24 }),
    })),
    config ? getCustomerTerms(config, restaurantId) : Promise.resolve(null),
  ]);

  const confirmedMonthly = data.payments.filter(
    (p) => p.status === "confirmed" && p.type === "monthly" && p.billingMonthStart,
  );
  const paidUntil = coverageEnd(
    confirmedMonthly.map((p) => ({ billingMonthStart: p.billingMonthStart!, monthsCovered: p.monthsCovered })),
  );
  const now = new Date();
  const contractSigned = !!data.restaurant?.contractSignedAt || !!terms?.contract_signed;
  // No activation receipt before the agreement is signed (D37). The portal
  // refuses to confirm one either; this just stops the owner paying early.
  const allowActivation = contractSigned && canSubmitActivation(data.payments);

  return (
    <div className="space-y-6">
      <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
        <h2 className="font-heading text-lg font-bold">Your subscription</h2>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-plum-ink/50">Activation</dt>
            <dd className="font-semibold">
              {data.restaurant?.activationPaidAt ? `Paid ${manilaDate(data.restaurant.activationPaidAt)}` : "Not yet paid"}
              {terms?.activation_fee != null && !data.restaurant?.activationPaidAt && (
                <span className="font-normal text-plum-ink/60"> · {formatPeso(terms.activation_fee)} one time</span>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-plum-ink/50">Monthly</dt>
            <dd className="font-semibold">{terms?.monthly_fee != null ? `${formatPeso(terms.monthly_fee)} / month` : "—"}</dd>
          </div>
          <div>
            <dt className="text-plum-ink/50">Paid until</dt>
            <dd className="font-semibold">
              {paidUntil ? manilaDate(new Date(paidUntil.getTime() - 1)) : "Nothing paid yet"}
            </dd>
          </div>
        </dl>
      </div>

      {config && !contractSigned && (
        <div className="rounded-tile border border-brand-primary/30 bg-brand-primary/5 p-5">
          <h2 className="font-heading text-lg font-bold">First, sign your subscription agreement</h2>
          <p className="mb-3 mt-1 text-sm text-plum-ink/70">
            It sets out your fees and the minimum term. You can sign on your phone; it takes a minute.
            Activation opens once it is signed.
          </p>
          <SignAgreementButton />
        </div>
      )}

      {!config || !instructions ? (
        <div className="rounded-tile border border-mango/40 bg-mango/10 p-5 text-sm">
          Online receipt submission isn&apos;t open yet. Please contact support to pay.
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
            <h2 className="font-heading text-lg font-bold">1. Pay by QR or bank transfer</h2>
            {instructions.qrImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- an operator-configured static image
              <img src={instructions.qrImageUrl} alt="Payment QR code" className="mx-auto my-4 w-56 rounded-lg border" />
            )}
            <dl className="space-y-1 text-sm">
              <div><dt className="inline text-plum-ink/50">Bank: </dt><dd className="inline font-semibold">{instructions.bankName}</dd></div>
              <div><dt className="inline text-plum-ink/50">Account name: </dt><dd className="inline font-semibold">{instructions.accountName}</dd></div>
              <div><dt className="inline text-plum-ink/50">Account number: </dt><dd className="inline font-mono font-semibold">{instructions.accountNumber}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-plum-ink/60">
              Pay CANVEXIA directly. Agents never collect payments — don&apos;t hand cash to anyone.
            </p>
          </div>
          <div className="rounded-tile border border-plum-ink/10 bg-white p-5">
            <h2 className="mb-3 font-heading text-lg font-bold">2. Upload your receipt</h2>
            <ReceiptUploadForm
              action={submitReceiptAction}
              allowActivation={allowActivation}
              allowMonthly
              activationFee={terms?.activation_fee ?? null}
              monthlyFee={terms?.monthly_fee ?? null}
              nextBillingMonth={nextBillingMonth(paidUntil, now)}
              inputClassName="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
              buttonClassName="w-full rounded-lg py-2.5 font-semibold btn-brand disabled:opacity-60"
            />
          </div>
        </div>
      )}

      <div>
        <h2 className="mb-2 font-heading text-lg font-bold">Payments you&apos;ve sent</h2>
        {data.payments.length === 0 ? (
          <p className="text-sm text-plum-ink/50">None yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-plum-ink/50">
                <tr><th className="py-2">Sent</th><th>For</th><th>Amount</th><th>Reference</th><th>Status</th></tr>
              </thead>
              <tbody>
                {data.payments.map((p) => (
                  <tr key={p.id} className="border-t border-plum-ink/10 align-top">
                    <td className="py-2">{manilaDate(p.submittedAt)}</td>
                    <td>
                      {p.type === "activation"
                        ? "Activation"
                        : `${p.monthsCovered} month${p.monthsCovered === 1 ? "" : "s"} from ${p.billingMonthStart ? monthKeyOfDate(p.billingMonthStart) : "—"}`}
                    </td>
                    <td>{formatPeso(p.amount)}</td>
                    <td className="font-mono">{p.bankReference}</td>
                    <td>
                      <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_CLASS[p.status] ?? ""}`}>
                        {STATUS_LABEL[p.status] ?? p.status}
                      </span>
                      {p.reason && <span className="mt-1 block text-xs text-plum-ink/60">{p.reason}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
