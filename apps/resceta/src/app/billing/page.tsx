import { redirect } from "next/navigation";
import { canSubmitActivation, coverageEnd, getCustomerTerms, monthKeyOfDate, nextBillingMonth } from "@servd/core/agent-kit";
import { ReceiptUploadForm } from "@servd/core/agent-kit/react";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { pharmacyDb } from "@/server/tenancy/scoped-db";
import { paymentInstructions, portalConfig } from "@/server/agent-portal/config";
import { submitReceiptAction } from "@/server/agent-portal/receipt-actions";
import { AppShell } from "@/components/AppShell";
import { SignAgreementButton } from "@/components/SignAgreementButton";
import { can } from "@/lib/pharmacy/roles";
import { manilaDate, peso } from "@/lib/money";

export const dynamic = "force-dynamic";

/** Owner-only: subscription, pay-by-QR instructions, receipt upload, history. */
export default async function BillingPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login?next=%2Fbilling");
  if (!can(staff.role, "manageSettings")) redirect("/");

  const config = portalConfig();
  const instructions = paymentInstructions();
  const [data, terms] = await Promise.all([
    pharmacyDb(staff.pharmacyId, async (tx) => ({
      pharmacy: await tx.pharmacy.findFirst({ select: { activationPaidAt: true, contractSignedAt: true } }),
      payments: await tx.rescetaManualPayment.findMany({ orderBy: { submittedAt: "desc" }, take: 24 }),
    })),
    config ? getCustomerTerms(config, staff.pharmacyId) : Promise.resolve(null),
  ]);
  const paidUntil = coverageEnd(
    data.payments
      .filter((p) => p.status === "confirmed" && p.type === "monthly" && p.billingMonthStart)
      .map((p) => ({ billingMonthStart: p.billingMonthStart!, monthsCovered: p.monthsCovered })),
  );
  const signed = !!data.pharmacy?.contractSignedAt || !!terms?.contract_signed;

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-3xl space-y-6 px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <dl className="grid gap-3 rounded-lg border border-slate-200 bg-white p-4 text-sm sm:grid-cols-3">
          <div><dt className="text-slate-500">Activation</dt><dd className="font-medium">{data.pharmacy?.activationPaidAt ? `Paid ${manilaDate(data.pharmacy.activationPaidAt)}` : terms?.activation_fee != null ? `${peso(terms.activation_fee)} one time` : "Not yet paid"}</dd></div>
          <div><dt className="text-slate-500">Monthly</dt><dd className="font-medium">{terms?.monthly_fee != null ? `${peso(terms.monthly_fee)} / month` : "—"}</dd></div>
          <div><dt className="text-slate-500">Paid until</dt><dd className="font-medium">{paidUntil ? manilaDate(new Date(paidUntil.getTime() - 1)) : "Nothing paid yet"}</dd></div>
        </dl>

        {config && !signed && (
          <section className="rounded-lg border border-slate-300 bg-slate-50 p-4">
            <h2 className="font-semibold">First, sign your subscription agreement</h2>
            <p className="mb-3 mt-1 text-sm text-slate-600">Activation opens once it is signed.</p>
            <SignAgreementButton />
          </section>
        )}

        {!config || !instructions ? (
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">Online receipt submission isn&apos;t open yet. Please contact support to pay.</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <section className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
              <h2 className="mb-2 font-semibold">1. Pay by QR or bank transfer</h2>
              {/* eslint-disable-next-line @next/next/no-img-element -- an operator-configured static image */}
              {instructions.qrImageUrl && <img src={instructions.qrImageUrl} alt="Payment QR code" className="mx-auto my-3 w-52 rounded border" />}
              <p>Bank: <strong>{instructions.bankName}</strong></p>
              <p>Account name: <strong>{instructions.accountName}</strong></p>
              <p>Account number: <strong className="font-mono">{instructions.accountNumber}</strong></p>
              <p className="mt-2 text-xs text-slate-500">Pay CANVEXIA directly. Agents never collect payments.</p>
            </section>
            <section className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="mb-2 font-semibold">2. Upload your receipt</h2>
              <ReceiptUploadForm
                action={submitReceiptAction}
                allowActivation={signed && canSubmitActivation(data.payments)}
                allowMonthly
                activationFee={terms?.activation_fee ?? null}
                monthlyFee={terms?.monthly_fee ?? null}
                nextBillingMonth={nextBillingMonth(paidUntil, new Date())}
                inputClassName="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
                buttonClassName="w-full rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              />
            </section>
          </div>
        )}

        <section>
          <h2 className="mb-2 font-semibold">Payments you&apos;ve sent</h2>
          <ul className="space-y-2 text-sm">
            {data.payments.map((p) => (
              <li key={p.id} className="flex justify-between rounded-lg border border-slate-200 bg-white p-3">
                <span>
                  {p.type === "activation" ? "Activation" : `${p.monthsCovered} month(s) from ${p.billingMonthStart ? monthKeyOfDate(p.billingMonthStart) : "—"}`}
                  <span className="block text-xs text-slate-500">{manilaDate(p.submittedAt)} · ref {p.bankReference} · {p.status}{p.reason ? ` — ${p.reason}` : ""}</span>
                </span>
                <span>{peso(p.amount)}</span>
              </li>
            ))}
            {data.payments.length === 0 && <li className="text-slate-500">None yet.</li>}
          </ul>
        </section>
      </main>
    </AppShell>
  );
}
