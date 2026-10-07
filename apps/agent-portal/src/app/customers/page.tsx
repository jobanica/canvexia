import Link from "next/link";
import { requireAgentPage } from "@/lib/agent-page";
import { agentDb } from "@/server/scoped-db";
import { AgentShell } from "@/components/AgentShell";
import { paidMonthLabel } from "@/lib/commission";
import { peso } from "@/lib/money";

const STATUS: Record<string, string> = { lead: "Signed up", active: "Paying", churned: "Cancelled" };
const PAYMENT: Record<string, string> = { submitted: "awaiting verification", confirmed: "confirmed", rejected: "rejected", reversed: "reversed" };

export default async function CustomersPage() {
  const agent = await requireAgentPage("/customers");
  // agentDb: Postgres returns this agent's customers and nobody else's.
  const customers = await agentDb(agent.agentId, (tx) =>
    tx.agentReferral.findMany({
      orderBy: { signedUpAt: "desc" },
      include: {
        product: { select: { name: true } },
        rule: true,
        _count: { select: { contracts: true } },
        payments: { orderBy: { submittedAt: "desc" }, take: 1, select: { status: true } },
      },
    }),
  );

  return (
    <AgentShell agent={agent}>
      <h1 className="text-xl font-semibold">Customers</h1>
      {customers.length === 0 && <p className="mt-3 text-sm text-slate-600">No customers yet. Share your link to get started.</p>}
      <ul className="mt-4 space-y-3">
        {customers.map((c) => (
          <li key={c.id}>
            <Link href={`/customers/${c.id}`} className="block rounded-lg border border-slate-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">{c.businessName}</p>
                <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs">{STATUS[c.status]}</span>
              </div>
              <p className="text-xs text-slate-500">{c.product.name}</p>
              <p className="mt-2 text-sm">{paidMonthLabel(c.rule, c.paidMonths, peso)}</p>
              <p className="mt-1 text-xs text-slate-500">
                Contract {c._count.contracts > 0 ? "signed" : "not signed"} · Last payment{" "}
                {c.payments[0] ? PAYMENT[c.payments[0].status] : "none yet"}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </AgentShell>
  );
}
