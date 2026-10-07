import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-page";
import { staffDb } from "@/server/scoped-db";
import { ActionForm, Field, inputClass } from "@/components/ActionForm";
import { Badge, tdClass, thClass } from "@/components/AdminShell";
import { peso } from "@/lib/money";
import { manilaDate, manilaDateTime } from "@/lib/time";
import { approveAction, paidAction } from "../actions";

export default async function PayoutDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const p = await staffDb("admin", (tx) =>
    tx.agentPayout.findUnique({
      where: { id },
      include: {
        agent: { select: { name: true } },
        commissions: { orderBy: { createdAt: "asc" }, include: { referral: { select: { businessName: true, product: { select: { name: true } } } } } },
      },
    }),
  ).catch(() => null);
  if (!p) notFound();

  return (
    <div className="space-y-5">
      <Link href="/admin/payouts" className="text-sm text-slate-500">← Payouts</Link>
      <h1 className="text-xl font-semibold">
        {p.agent.name} · {p.period.toISOString().slice(0, 7)} · {peso(p.total)} <Badge>{p.status}</Badge>
      </h1>
      <p className="text-sm text-slate-600">Send to: {p.method}</p>
      {p.paidAt && <p className="text-sm text-slate-600">Paid {manilaDateTime(p.paidAt)} by {p.paidBy}, reference <span className="font-mono">{p.referenceNumber}</span></p>}

      {p.status === "draft" && (
        <ActionForm action={approveAction} submitLabel="Approve">
          <input type="hidden" name="payoutId" value={p.id} />
        </ActionForm>
      )}
      {p.status === "approved" && (
        <ActionForm action={paidAction} submitLabel="Mark paid" className="max-w-sm space-y-3">
          <input type="hidden" name="payoutId" value={p.id} />
          <Field label="Transfer reference number"><input name="referenceNumber" required minLength={3} className={inputClass} /></Field>
        </ActionForm>
      )}

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200"><tr>{["Written", "Customer", "Product", "Type", "Paid month", "Amount"].map((h) => <th key={h} className={thClass}>{h}</th>)}</tr></thead>
          <tbody>
            {p.commissions.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 last:border-0">
                <td className={tdClass}>{manilaDate(c.createdAt)}</td>
                <td className={tdClass}>{c.referral.businessName}</td>
                <td className={tdClass}>{c.referral.product.name}</td>
                <td className={tdClass}>{c.kind}</td>
                <td className={tdClass}>{c.paidMonthNumber ?? "—"}</td>
                <td className={tdClass}>{peso(c.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
