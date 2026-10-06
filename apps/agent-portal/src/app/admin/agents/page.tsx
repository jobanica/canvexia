import Link from "next/link";
import { requireAdminPage } from "@/lib/admin-page";
import { staffDb } from "@/server/scoped-db";
import { AGENT_TONE as TONE, Badge, tdClass, thClass } from "@/components/AdminShell";
import { manilaDate } from "@/lib/time";
import type { AgentStatus } from "@/lib/agent-status";

const STATUSES: AgentStatus[] = ["pending", "active", "suspended", "removed"];

export default async function AgentsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdminPage();
  const { status } = await searchParams;
  const filter = STATUSES.includes(status as AgentStatus) ? (status as AgentStatus) : undefined;

  const agents = await staffDb("admin", (tx) =>
    tx.agent.findMany({
      where: filter ? { status: filter } : {},
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true, name: true, mobile: true, referralCode: true, status: true, createdAt: true,
        _count: { select: { referrals: true } },
      },
    }),
  );

  return (
    <div>
      <h1 className="text-xl font-semibold">Agents</h1>
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <Link href="/admin/agents" className={!filter ? "font-semibold" : "text-slate-600"}>All</Link>
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin/agents?status=${s}`} className={filter === s ? "font-semibold" : "text-slate-600"}>
            {s}
          </Link>
        ))}
      </div>
      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200">
            <tr>
              <th className={thClass}>Name</th>
              <th className={thClass}>Code</th>
              <th className={thClass}>Mobile</th>
              <th className={thClass}>Customers</th>
              <th className={thClass}>Status</th>
              <th className={thClass}>Applied</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.id} className="border-b border-slate-100 last:border-0">
                <td className={tdClass}>
                  <Link href={`/admin/agents/${a.id}`} className="font-medium underline">{a.name}</Link>
                </td>
                <td className={`${tdClass} font-mono`}>{a.referralCode}</td>
                <td className={tdClass}>{a.mobile}</td>
                <td className={tdClass}>{a._count.referrals}</td>
                <td className={tdClass}><Badge tone={TONE[a.status]}>{a.status}</Badge></td>
                <td className={tdClass}>{manilaDate(a.createdAt)}</td>
              </tr>
            ))}
            {agents.length === 0 && (
              <tr><td className={tdClass} colSpan={6}>No agents.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
