import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/admin-page";
import { staffDb } from "@/server/scoped-db";
import { loadSettings } from "@/server/settings";
import { ActionForm, Field, inputClass } from "@/components/ActionForm";
import { Badge, tdClass, thClass } from "@/components/AdminShell";
import { peso } from "@/lib/money";
import { manilaDate, manilaDateTime } from "@/lib/time";
import { paidMonthLabel } from "@/lib/commission";
import { attachRuleAction, lateCodeAction, reassignAction } from "../actions";

export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const data = await staffDb("admin", async (tx) => {
    const r = await tx.agentReferral.findUnique({
      where: { id },
      include: {
        product: { select: { name: true } },
        agent: { select: { id: true, name: true, referralCode: true } },
        rule: true,
        payments: { orderBy: { submittedAt: "desc" } },
        commissions: { orderBy: { createdAt: "desc" }, include: { agent: { select: { name: true } } } },
        contracts: { orderBy: { signedAt: "desc" } },
      },
    });
    if (!r) return null;
    const agents = await tx.agent.findMany({ where: { status: "active" }, select: { id: true, name: true, referralCode: true }, orderBy: { name: "asc" } });
    return { r, agents, settings: await loadSettings(tx) };
  }).catch(() => null);
  if (!data) notFound();
  const { r, agents, settings } = data;
  const lateUntil = new Date(r.signedUpAt.getTime() + settings.late_referral_code_days * 86_400_000);

  return (
    <div className="space-y-6">
      <Link href="/admin/customers" className="text-sm text-slate-500">← Customers</Link>
      <h1 className="text-xl font-semibold">{r.businessName} <Badge>{r.status}</Badge></h1>
      <dl className="grid gap-x-6 gap-y-1 rounded-lg border border-slate-200 bg-white p-4 text-sm sm:grid-cols-2">
        <div><dt className="inline text-slate-500">Owner: </dt><dd className="inline">{r.ownerName}, {r.ownerPhone}</dd></div>
        <div><dt className="inline text-slate-500">Product: </dt><dd className="inline">{r.product.name} <span className="font-mono text-xs text-slate-500">{r.externalCustomerId}</span></dd></div>
        <div><dt className="inline text-slate-500">Agent: </dt><dd className="inline">{r.agent ? `${r.agent.name} (${r.agent.referralCode})` : "none"}</dd></div>
        <div><dt className="inline text-slate-500">Code reported: </dt><dd className="inline font-mono">{r.reportedAgentCode ?? "—"}</dd></div>
        <div><dt className="inline text-slate-500">Signed up: </dt><dd className="inline">{manilaDateTime(r.signedUpAt)}</dd></div>
        <div><dt className="inline text-slate-500">Paid: </dt><dd className="inline">{paidMonthLabel(r.rule, r.paidMonths, peso)}</dd></div>
        <div><dt className="inline text-slate-500">Rule: </dt><dd className="inline">{r.rule ? `${peso(r.rule.activationFee)} + ${peso(r.rule.monthlyFee)}/mo` : "none"}</dd></div>
        <div><dt className="inline text-slate-500">Contract: </dt><dd className="inline">{r.contracts[0] ? (
          <>signed {manilaDate(r.contracts[0].signedAt)} by {r.contracts[0].signerName} · <a className="underline" href={`/admin/contracts/${r.contracts[0].id}`}>PDF</a></>
        ) : "not signed"}</dd></div>
      </dl>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-lg border border-slate-200 bg-white p-4">
          <h2 className="mb-2 font-semibold">Reassign agent</h2>
          <ActionForm action={reassignAction} submitLabel="Reassign" confirm="Move this customer? Commission already earned stays with the current agent.">
            <input type="hidden" name="referralId" value={r.id} />
            <select name="agentId" required className={inputClass} defaultValue="">
              <option value="" disabled>Choose an agent</option>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.referralCode})</option>)}
            </select>
          </ActionForm>
        </section>
        {!r.agent && (
          <section className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="mb-2 font-semibold">Add a missing code</h2>
            <p className="mb-2 text-xs text-slate-500">Allowed until {manilaDate(lateUntil)}.</p>
            <ActionForm action={lateCodeAction} submitLabel="Attach code">
              <input type="hidden" name="referralId" value={r.id} />
              <Field label="Referral code"><input name="code" required className={inputClass} /></Field>
            </ActionForm>
          </section>
        )}
        {!r.rule && (
          <section className="rounded-lg border border-amber-300 bg-amber-50 p-4">
            <h2 className="mb-2 font-semibold">No commission rule</h2>
            <p className="mb-2 text-xs">Payments cannot be confirmed until one is attached.</p>
            <ActionForm action={attachRuleAction} submitLabel="Attach the rule in force">
              <input type="hidden" name="referralId" value={r.id} />
            </ActionForm>
          </section>
        )}
      </div>

      <section>
        <h2 className="mb-2 font-semibold">Payments</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200"><tr>{["Submitted", "For", "Amount", "Reference", "Status"].map((h) => <th key={h} className={thClass}>{h}</th>)}</tr></thead>
            <tbody>
              {r.payments.map((p) => (
                <tr key={p.id} className="border-b border-slate-100 last:border-0">
                  <td className={tdClass}><Link className="underline" href={`/admin/queue/${p.id}`}>{manilaDate(p.submittedAt)}</Link></td>
                  <td className={tdClass}>{p.type === "activation" ? "Activation" : `${p.monthsCovered} mo from ${p.billingMonthStart?.toISOString().slice(0, 7)}`}</td>
                  <td className={tdClass}>{peso(p.amount)}</td>
                  <td className={`${tdClass} font-mono`}>{p.bankReference}</td>
                  <td className={tdClass}>{p.status}{p.rejectReason ? ` — ${p.rejectReason}` : ""}</td>
                </tr>
              ))}
              {r.payments.length === 0 && <tr><td className={tdClass} colSpan={5}>None.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Commission</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200"><tr>{["Written", "Agent", "Type", "Paid month", "Amount", "Status", "Payable from"].map((h) => <th key={h} className={thClass}>{h}</th>)}</tr></thead>
            <tbody>
              {r.commissions.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0">
                  <td className={tdClass}>{manilaDate(c.createdAt)}</td>
                  <td className={tdClass}>{c.agent.name}</td>
                  <td className={tdClass}>{c.kind}</td>
                  <td className={tdClass}>{c.paidMonthNumber ?? "—"}</td>
                  <td className={tdClass}>{peso(c.amount)}</td>
                  <td className={tdClass}>{c.status}</td>
                  <td className={tdClass}>{manilaDate(c.payableFrom)}</td>
                </tr>
              ))}
              {r.commissions.length === 0 && <tr><td className={tdClass} colSpan={7}>None.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
