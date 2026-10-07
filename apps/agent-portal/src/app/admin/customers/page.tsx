import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireAdminPage } from "@/lib/admin-page";
import { staffDb } from "@/server/scoped-db";
import { Badge, tdClass, thClass } from "@/components/AdminShell";
import { peso } from "@/lib/money";
import { manilaDate } from "@/lib/time";
import { paidMonthLabel } from "@/lib/commission";

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; status?: string }> }) {
  await requireAdminPage();
  const { q, status } = await searchParams;
  const where: Prisma.AgentReferralWhereInput = {
    ...(status === "lead" || status === "active" || status === "churned" ? { status } : {}),
    ...(q ? { OR: [{ businessName: { contains: q, mode: "insensitive" } }, { ownerName: { contains: q, mode: "insensitive" } }, { externalCustomerId: q }] } : {}),
  };
  const rows = await staffDb("admin", (tx) =>
    tx.agentReferral.findMany({
      where,
      orderBy: { signedUpAt: "desc" },
      take: 300,
      include: { product: { select: { name: true } }, agent: { select: { name: true } }, rule: true },
    }),
  );
  return (
    <div>
      <h1 className="text-xl font-semibold">Customers</h1>
      <form className="mt-3 flex flex-wrap gap-2 text-sm">
        <input name="q" defaultValue={q ?? ""} placeholder="Business, owner or customer id" className="rounded-md border border-slate-300 px-3 py-1.5" />
        <select name="status" defaultValue={status ?? ""} className="rounded-md border border-slate-300 px-2 py-1.5">
          <option value="">All</option><option value="lead">lead</option><option value="active">active</option><option value="churned">churned</option>
        </select>
        <button className="rounded-md bg-slate-900 px-3 py-1.5 text-white">Filter</button>
      </form>
      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200">
            <tr>{["Business", "Product", "Agent", "Status", "Paid months", "Signed up"].map((h) => <th key={h} className={thClass}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0">
                <td className={tdClass}><Link href={`/admin/customers/${r.id}`} className="font-medium underline">{r.businessName}</Link></td>
                <td className={tdClass}>{r.product.name}</td>
                <td className={tdClass}>{r.agent?.name ?? <span className="text-slate-400">none</span>}</td>
                <td className={tdClass}><Badge tone={r.status === "active" ? "green" : r.status === "churned" ? "red" : "amber"}>{r.status}</Badge></td>
                <td className={tdClass}>{paidMonthLabel(r.rule, r.paidMonths, peso)}</td>
                <td className={tdClass}>{manilaDate(r.signedUpAt)}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className={tdClass} colSpan={6}>No customers.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
