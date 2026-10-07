import { requireAgentPage } from "@/lib/agent-page";
import { agentDb } from "@/server/scoped-db";
import { AgentShell } from "@/components/AgentShell";
import { peso } from "@/lib/money";
import { manilaDate } from "@/lib/time";

export default async function AgentPayoutsPage() {
  const agent = await requireAgentPage("/payouts");
  const payouts = await agentDb(agent.agentId, (tx) =>
    tx.agentPayout.findMany({ orderBy: { period: "desc" } }),
  );
  return (
    <AgentShell agent={agent}>
      <h1 className="text-xl font-semibold">Payouts</h1>
      <ul className="mt-4 space-y-2 text-sm">
        {payouts.map((p) => (
          <li key={p.id} className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex justify-between">
              <span className="font-semibold">{p.period.toISOString().slice(0, 7)}</span>
              <span>{peso(p.total)}</span>
            </div>
            <p className="text-xs text-slate-500">
              {p.status === "paid" ? `Paid ${p.paidAt ? manilaDate(p.paidAt) : ""} · ref ${p.referenceNumber}` : p.status === "approved" ? "Approved, being sent" : "Being prepared"}
            </p>
            <a href={`/payouts/${p.id}/statement`} className="mt-1 inline-block text-xs font-medium underline">Download statement</a>
          </li>
        ))}
        {payouts.length === 0 && <li className="text-slate-500">No payouts yet.</li>}
      </ul>
    </AgentShell>
  );
}
