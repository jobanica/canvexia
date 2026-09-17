import { redirect } from "next/navigation";
import { getCurrentStaff } from "@/server/tenancy/current-user";
import { AppShell } from "@/components/AppShell";
import { pharmacyBilling } from "@/server/pharmacy/billing";
import { can } from "@/lib/pharmacy/roles";
import { peso, manilaDate } from "@/lib/money";
import { RenewPanel } from "./RenewPanel";

export const dynamic = "force-dynamic";

/**
 * BILLING IS THREE QUESTIONS: what does this cost, when does it run out, and
 * what have I paid?
 *
 * Resceta had none of them, because it had no billing. `subscriptions` was
 * written when a merchant was a restaurant, so a pharmacy had no plan row at
 * all — and `recordSettlement` read `tx.restaurant`, which meant a pharmacy
 * could never produce a ledger entry: a partner selling Resceta earned nothing
 * this platform recorded and CANVEXIA's 30% never accrued on a peso of it.
 *
 * NO FEATURE LIST. Everything in Resceta is included in the one plan, so a
 * grid of twenty rows all reading "Included" would be a shelf with nothing on
 * it between an owner and the two things they came here to do. The same
 * decision, for the same reason, as Servd's own billing screen.
 *
 * `manageSettings` — the owner's permission. Paying the bill is an owner's
 * decision, and the same gate already guards the statutory identity on the
 * receipt.
 */
export default async function BillingPage() {
  const staff = await getCurrentStaff();
  if (!staff) redirect("/login?next=%2Fbilling");

  if (!can(staff.role, "manageSettings")) {
    return (
      <AppShell staff={staff}>
        <main className="mx-auto max-w-lg px-6 py-16 text-center">
          <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-600">
            Only the owner can see what this pharmacy pays.
          </p>
        </main>
      </AppShell>
    );
  }

  const billing = await pharmacyBilling(staff.pharmacyId);

  return (
    <AppShell staff={staff}>
      <main className="mx-auto max-w-2xl space-y-5 px-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
          <p className="mt-1 text-sm text-slate-500">
            {billing
              ? `Everything in Resceta is included — ${peso(billing.priceMonthly)}/month.`
              : "This account has no plan on file."}
          </p>
        </div>

        {!billing ? (
          // Honest rather than blank. A pharmacy with no subscription row is a
          // provisioning gap, not a free account, and saying so is how it gets
          // found.
          <p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            No subscription is recorded for this pharmacy. Whoever set up your account can fix
            this from the CANVEXIA partner portal.
          </p>
        ) : (
          <>
            {/*
              WHEN IT RUNS OUT. It was never shown anywhere, so the first an
              owner knew about a lapse was the day the counter stopped selling.
              Amber inside a fortnight — the notice a cash payment actually
              needs — and red once it has gone.
            */}
            {billing.paidUntil && (
              <section
                className={`rounded-lg border p-5 ${
                  billing.daysLeft === 0
                    ? "border-red-300 bg-red-50"
                    : (billing.daysLeft ?? 99) <= 14
                      ? "border-amber-300 bg-amber-50"
                      : "border-slate-200 bg-white"
                }`}
              >
                <p className="font-semibold">
                  {billing.daysLeft === 0
                    ? "Your plan has run out"
                    : `Paid until ${manilaDate(billing.paidUntil)}`}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {billing.daysLeft === 0 ? (
                    <>
                      {/*
                        NOT "the counter will stop". Nothing here is automatic:
                        this account is billed by the partner off this system,
                        so nothing dunned it and nothing suspended it. The
                        person who decides is the partner, and saying otherwise
                        would be a threat this software does not carry out.
                      */}
                      It ran out on {manilaDate(billing.paidUntil)}. Renew with your partner —
                      they decide whether to switch the counter off.
                    </>
                  ) : (
                    <>
                      {billing.daysLeft} day{billing.daysLeft === 1 ? "" : "s"} left
                      {(billing.daysLeft ?? 99) <= 14
                        ? " — renew now so nothing stops."
                        : ". You can renew any time before that date."}
                    </>
                  )}
                </p>
              </section>
            )}

            {billing.partner ? (
              <RenewPanel
                status={
                  billing.renewal?.status === "receipt_uploaded"
                    ? "receipt_uploaded"
                    : billing.renewal
                      ? "requested"
                      : "none"
                }
                partnerName={billing.partner.name}
                qrUrl={billing.partner.payQrUrl}
                instructions={billing.partner.payInstructions}
                rejectedNote={billing.rejectedNote}
              />
            ) : (
              <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
                This account has no partner on file, so there is nobody to renew with yet.
              </p>
            )}

            <section>
              <h2 className="mb-2 font-semibold">Payment history</h2>
              {billing.invoices.length === 0 ? (
                <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
                  No payments recorded yet.
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-2 font-medium">Date</th>
                        <th className="px-4 py-2 font-medium">Reference</th>
                        <th className="px-4 py-2 text-right font-medium">Amount</th>
                        <th className="px-4 py-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {billing.invoices.map((i) => (
                        <tr key={i.id}>
                          <td className="px-4 py-2">{manilaDate(i.createdAt)}</td>
                          <td className="px-4 py-2 text-slate-500">{i.invoiceNo ?? "—"}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{peso(i.amount)}</td>
                          <td className="px-4 py-2">{i.status}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </main>
    </AppShell>
  );
}
