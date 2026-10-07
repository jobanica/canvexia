import Link from "next/link";
import { requireStaffPage, ageLabel } from "@/lib/staff-page";
import { staffDb } from "@/server/scoped-db";
import { tdClass, thClass } from "@/components/AdminShell";
import { peso } from "@/lib/money";
import { manilaDateTime } from "@/lib/time";

const DAY = 86_400_000;

/**
 * Every submitted receipt, from every product, oldest first. Anything waiting
 * more than a day is highlighted: a customer who paid and hears nothing is the
 * complaint this queue exists to prevent.
 */
export default async function QueuePage() {
  const staff = await requireStaffPage();
  const now = new Date();
  const payments = await staffDb(staff.role, (tx) =>
    tx.agentPayment.findMany({
      where: { status: "submitted" },
      orderBy: { submittedAt: "asc" },
      take: 300,
      include: { referral: { select: { businessName: true, product: { select: { name: true } }, agent: { select: { name: true } } } } },
    }),
  );

  return (
    <div>
      <h1 className="text-xl font-semibold">Verification queue</h1>
      <p className="mt-1 text-sm text-slate-600">
        {payments.length} waiting. Oldest first; red means waiting more than 24 hours.
      </p>
      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200">
            <tr>{["Waiting", "Customer", "Product", "For", "Amount", "Reference", "Agent"].map((h) => <th key={h} className={thClass}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {payments.map((p) => {
              const late = now.getTime() - p.submittedAt.getTime() > DAY;
              return (
                <tr key={p.id} className={`border-b border-slate-100 last:border-0 ${late ? "bg-red-50" : ""}`}>
                  <td className={`${tdClass} ${late ? "font-semibold text-red-700" : ""}`} title={manilaDateTime(p.submittedAt)}>
                    {ageLabel(p.submittedAt, now)}
                  </td>
                  <td className={tdClass}>
                    <Link href={`/admin/queue/${p.id}`} className="font-medium underline">{p.referral.businessName}</Link>
                  </td>
                  <td className={tdClass}>{p.referral.product.name}</td>
                  <td className={tdClass}>
                    {p.type === "activation" ? "Activation" : `${p.monthsCovered} mo from ${p.billingMonthStart?.toISOString().slice(0, 7)}`}
                  </td>
                  <td className={tdClass}>{peso(p.amount)}</td>
                  <td className={`${tdClass} font-mono`}>{p.bankReference}</td>
                  <td className={tdClass}>{p.referral.agent?.name ?? <span className="text-slate-400">none</span>}</td>
                </tr>
              );
            })}
            {payments.length === 0 && <tr><td className={tdClass} colSpan={7}>Nothing waiting.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
