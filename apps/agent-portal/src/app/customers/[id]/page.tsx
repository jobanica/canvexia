import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAgentPage } from "@/lib/agent-page";
import { agentDb } from "@/server/scoped-db";
import { AgentShell } from "@/components/AgentShell";
import { paidMonthLabel } from "@/lib/commission";
import { peso } from "@/lib/money";
import { manilaDate } from "@/lib/time";

const KIND: Record<string, string> = { activation: "Activation", monthly: "Monthly", reversal: "Reversal" };

export default async function CustomerDetail({ params }: { params: Promise<{ id: string }> }) {
  const agent = await requireAgentPage("/customers");
  const { id } = await params;
  const c = await agentDb(agent.agentId, (tx) =>
    tx.agentReferral.findUnique({
      where: { id },
      include: {
        product: { select: { name: true } },
        rule: true,
        payments: { orderBy: { submittedAt: "desc" } },
        commissions: { where: { agentId: agent.agentId }, orderBy: { createdAt: "desc" } },
        contracts: { orderBy: { signedAt: "desc" }, take: 1 },
      },
    }),
  ).catch(() => null);
  // Another agent's customer reads as not found: RLS returned nothing.
  if (!c) notFound();

  return (
    <AgentShell agent={agent}>
      <Link href="/customers" className="text-sm text-slate-500">← Customers</Link>
      <h1 className="mt-2 text-xl font-semibold">{c.businessName}</h1>
      <p className="text-sm text-slate-600">{c.product.name} · {c.ownerName} · {c.ownerPhone}</p>
      <p className="mt-2 text-sm">{paidMonthLabel(c.rule, c.paidMonths, peso)}</p>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-sm">
        <h2 className="font-semibold">Contract</h2>
        {c.contracts[0] ? (
          <p className="mt-1">
            Signed {manilaDate(c.contracts[0].signedAt)} by {c.contracts[0].signerName}.{" "}
            {c.contracts[0].pdfPath && (
              <a href={`/customers/${c.id}/contract`} className="font-medium underline">Download PDF</a>
            )}
          </p>
        ) : (
          <div className="mt-1">
            <p>Not signed yet. The customer must sign before their activation can be confirmed.</p>
            <a href={`/customers/${c.id}/sign`} className="mt-2 inline-block rounded-md bg-slate-900 px-3 py-2 text-white">
              Open the signing page
            </a>
          </div>
        )}
      </section>

      <section className="mt-4">
        <h2 className="font-semibold">Payments</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {c.payments.map((p) => (
            <li key={p.id} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex justify-between">
                <span>{p.type === "activation" ? "Activation" : `${p.monthsCovered} month(s) from ${p.billingMonthStart?.toISOString().slice(0, 7)}`}</span>
                <span>{peso(p.amount)}</span>
              </div>
              <p className="text-xs text-slate-500">{manilaDate(p.submittedAt)} · {p.status}</p>
            </li>
          ))}
          {c.payments.length === 0 && <li className="text-slate-500">None yet.</li>}
        </ul>
      </section>

      <section className="mt-4">
        <h2 className="font-semibold">Your commission</h2>
        <ul className="mt-2 space-y-2 text-sm">
          {c.commissions.map((x) => (
            <li key={x.id} className="flex justify-between rounded-lg border border-slate-200 bg-white p-3">
              <span>
                {KIND[x.kind]}{x.paidMonthNumber ? ` · month ${x.paidMonthNumber}` : ""}
                <span className="block text-xs text-slate-500">{x.status.replace("_", " ")} · {manilaDate(x.createdAt)}</span>
              </span>
              <span className={x.amount < 0 ? "text-red-700" : ""}>{peso(x.amount)}</span>
            </li>
          ))}
          {c.commissions.length === 0 && <li className="text-slate-500">Commission appears once a payment is confirmed.</li>}
        </ul>
      </section>
    </AgentShell>
  );
}
