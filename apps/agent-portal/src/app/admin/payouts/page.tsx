import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-page";
import { staffDb } from "@/server/scoped-db";
import { loadSettings } from "@/server/settings";
import { ActionForm, Field, inputClass } from "@/components/ActionForm";
import { Badge, tdClass, thClass } from "@/components/AdminShell";
import { peso } from "@/lib/money";
import { nextPayoutDate, periodOf } from "@/lib/payouts";
import { manilaDate } from "@/lib/time";
import { generateAction } from "./actions";

export default async function PayoutsPage() {
  await requireAdminPage();
  const now = new Date();
  const { payouts, settings } = await staffDb("admin", async (tx) => ({
    payouts: await tx.agentPayout.findMany({ orderBy: [{ period: "desc" }, { createdAt: "desc" }], take: 300, include: { agent: { select: { name: true } } } }),
    settings: await loadSettings(tx),
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Payouts</h1>
        <p className="mt-1 text-sm text-slate-600">
          Next payout day: {manilaDate(nextPayoutDate(settings.payout_day_of_month, now))}. Minimum {peso(settings.payout_minimum_amount)};
          smaller and negative balances carry forward.
        </p>
      </div>
      <section className="max-w-md rounded-lg border border-slate-200 bg-white p-4">
        <h2 className="mb-2 font-semibold">Generate the list</h2>
        <p className="mb-3 text-xs text-slate-500">
          Drafts a payout per agent from approved commission payable before that month began — that is,
          from payments confirmed in earlier months. Running it twice adds nothing.
        </p>
        <ActionForm action={generateAction} submitLabel="Generate">
          <Field label="Payout month"><input type="month" name="period" required defaultValue={periodOf(now)} className={inputClass} /></Field>
        </ActionForm>
      </section>
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200"><tr>{["Month", "Agent", "Total", "Status", "Reference"].map((h) => <th key={h} className={thClass}>{h}</th>)}</tr></thead>
          <tbody>
            {payouts.map((p) => (
              <tr key={p.id} className="border-b border-slate-100 last:border-0">
                <td className={tdClass}><Link className="underline" href={`/admin/payouts/${p.id}`}>{p.period.toISOString().slice(0, 7)}</Link></td>
                <td className={tdClass}>{p.agent.name}</td>
                <td className={tdClass}>{peso(p.total)}</td>
                <td className={tdClass}><Badge tone={p.status === "paid" ? "green" : p.status === "approved" ? "amber" : "slate"}>{p.status}</Badge></td>
                <td className={`${tdClass} font-mono`}>{p.referenceNumber ?? "—"}</td>
              </tr>
            ))}
            {payouts.length === 0 && <tr><td className={tdClass} colSpan={5}>No payouts yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
