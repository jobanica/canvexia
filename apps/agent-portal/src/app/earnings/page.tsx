import type { Prisma } from "@prisma/client";
import { requireAgentPage } from "@/lib/agent-page";
import { agentDb } from "@/server/scoped-db";
import { AgentShell } from "@/components/AgentShell";
import { peso } from "@/lib/money";
import { manilaDate } from "@/lib/time";
import { periodOf, periodStart } from "@/lib/payouts";

const KIND: Record<string, string> = { activation: "Activation", monthly: "Monthly", reversal: "Reversal" };

export default async function EarningsPage({ searchParams }: { searchParams: Promise<{ month?: string; product?: string }> }) {
  const agent = await requireAgentPage("/earnings");
  const { month, product } = await searchParams;
  const m = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : null;
  const where: Prisma.AgentCommissionWhereInput = {
    ...(m ? { createdAt: { gte: periodStart(m), lt: periodStart(nextMonth(m)) } } : {}),
    ...(product ? { referral: { productId: product } } : {}),
  };
  const { rows, products } = await agentDb(agent.agentId, async (tx) => ({
    rows: await tx.agentCommission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { referral: { select: { businessName: true, product: { select: { name: true } } } } },
    }),
    products: await tx.agentProduct.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  }));
  const total = rows.reduce((s, r) => s + (r.status === "reversed" ? 0 : r.amount), 0);

  return (
    <AgentShell agent={agent}>
      <h1 className="text-xl font-semibold">Earnings</h1>
      <form className="mt-3 flex gap-2 text-sm">
        <input type="month" name="month" defaultValue={m ?? periodOf(new Date())} className="rounded-md border border-slate-300 px-2 py-1.5" />
        <select name="product" defaultValue={product ?? ""} className="rounded-md border border-slate-300 px-2 py-1.5">
          <option value="">All products</option>
          {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="rounded-md bg-slate-900 px-3 py-1.5 text-white">Show</button>
      </form>
      <p className="mt-3 text-sm">Total shown: <strong>{peso(total)}</strong></p>
      <ul className="mt-3 space-y-2 text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex justify-between rounded-lg border border-slate-200 bg-white p-3">
            <span>
              {r.referral.businessName}
              <span className="block text-xs text-slate-500">
                {r.referral.product.name} · {KIND[r.kind]}{r.paidMonthNumber ? ` month ${r.paidMonthNumber}` : ""} · {r.status.replace("_", " ")} · {manilaDate(r.createdAt)}
              </span>
            </span>
            <span className={r.amount < 0 ? "text-red-700" : ""}>{peso(r.amount)}</span>
          </li>
        ))}
        {rows.length === 0 && <li className="text-slate-500">Nothing for this filter.</li>}
      </ul>
    </AgentShell>
  );
}

function nextMonth(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  return mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
}
