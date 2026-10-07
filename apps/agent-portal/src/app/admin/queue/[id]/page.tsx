import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffPage, ageLabel } from "@/lib/staff-page";
import { staffDb } from "@/server/scoped-db";
import { signedUrl } from "@/server/storage";
import { ActionForm, Field, inputClass } from "@/components/ActionForm";
import { Badge } from "@/components/AdminShell";
import { peso } from "@/lib/money";
import { manilaDateTime } from "@/lib/time";
import { paidMonthLabel } from "@/lib/commission";
import { confirmAction, rejectAction, reverseAction } from "../actions";

export default async function PaymentDetail({ params }: { params: Promise<{ id: string }> }) {
  const staff = await requireStaffPage();
  const { id } = await params;
  const p = await staffDb(staff.role, (tx) =>
    tx.agentPayment.findUnique({
      where: { id },
      include: {
        referral: {
          include: {
            product: { select: { name: true } },
            agent: { select: { name: true, referralCode: true } },
            rule: true,
            _count: { select: { contracts: true } },
          },
        },
      },
    }),
  ).catch(() => null);
  if (!p) notFound();

  const r = p.referral;
  const expected = r.rule ? (p.type === "activation" ? r.rule.activationFee : r.rule.monthlyFee * p.monthsCovered) : null;
  const receipt = p.receiptPath ? await signedUrl(p.receiptPath, 300).catch(() => null) : null;

  const rows: [string, React.ReactNode][] = [
    ["Customer", `${r.businessName} — ${r.ownerName}, ${r.ownerPhone}`],
    ["Product", r.product.name],
    ["Agent", r.agent ? `${r.agent.name} (${r.agent.referralCode})` : "none"],
    ["For", p.type === "activation" ? "Activation" : `${p.monthsCovered} month(s) from ${p.billingMonthStart?.toISOString().slice(0, 7)}`],
    [
      "Amount",
      <span key="a">
        {peso(p.amount)}
        {expected !== null && expected !== p.amount && (
          <span className="ml-2 text-amber-700">expected {peso(expected)}</span>
        )}
      </span>,
    ],
    ["Bank reference", <span key="b" className="font-mono">{p.bankReference}</span>],
    ["Submitted", `${manilaDateTime(p.submittedAt)} (${ageLabel(p.submittedAt)} ago)`],
    ["Customer so far", r.rule ? paidMonthLabel(r.rule, r.paidMonths, peso) : "no commission rule"],
    ["Contract", r._count.contracts > 0 ? "signed" : <span key="c" className="text-amber-700">not signed</span>],
  ];
  if (p.status !== "submitted") {
    rows.push(["Decision", `${p.status} by ${p.reviewedBy ?? "—"}${p.rejectReason ? ` — ${p.rejectReason}` : ""}`]);
    if (p.reverseReason) rows.push(["Reversed", `${p.reversedBy} — ${p.reverseReason}`]);
  }

  return (
    <div className="space-y-5">
      <Link href="/admin/queue" className="text-sm text-slate-500">← Queue</Link>
      <h1 className="text-xl font-semibold">
        Payment <Badge tone={p.status === "confirmed" ? "green" : p.status === "submitted" ? "amber" : "red"}>{p.status}</Badge>
      </h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          {receipt ? (
            // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed URL to a private object
            <img src={receipt} alt="Receipt" className="max-h-[70vh] w-full rounded-lg border object-contain" />
          ) : (
            <p className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">No receipt image.</p>
          )}
        </div>
        <div className="space-y-4">
          <dl className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm">
            {rows.map(([k, val]) => (
              <div key={k} className="grid grid-cols-3 gap-2 px-4 py-2">
                <dt className="text-slate-500">{k}</dt>
                <dd className="col-span-2">{val}</dd>
              </div>
            ))}
          </dl>

          {p.status === "submitted" && (
            <>
              <ActionForm action={confirmAction} submitLabel="Confirm payment" confirm="Confirm this payment? Commission is written and the product is told.">
                <input type="hidden" name="paymentId" value={p.id} />
              </ActionForm>
              <ActionForm action={rejectAction} submitLabel="Reject" danger>
                <input type="hidden" name="paymentId" value={p.id} />
                <Field label="Reason (the customer sees this)">
                  <input name="reason" required minLength={3} className={inputClass} />
                </Field>
              </ActionForm>
            </>
          )}
          {p.status === "confirmed" && staff.role === "admin" && (
            <ActionForm action={reverseAction} submitLabel="Reverse payment" danger confirm="Reverse this confirmed payment? Its commissions are offset.">
              <input type="hidden" name="paymentId" value={p.id} />
              <Field label="Reason">
                <input name="reason" required minLength={3} className={inputClass} />
              </Field>
            </ActionForm>
          )}
        </div>
      </div>
    </div>
  );
}
