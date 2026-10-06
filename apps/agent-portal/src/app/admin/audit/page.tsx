import { requireAdminPage } from "@/lib/admin-page";
import { staffDb } from "@/server/scoped-db";
import { tdClass, thClass } from "@/components/AdminShell";
import { manilaDateTime } from "@/lib/time";

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ entity?: string; id?: string }> }) {
  await requireAdminPage();
  const { entity, id } = await searchParams;
  const rows = await staffDb("admin", (tx) =>
    tx.agentAuditLog.findMany({
      where: { ...(entity ? { entity } : {}), ...(id ? { entityId: id } : {}) },
      orderBy: { at: "desc" },
      take: 300,
    }),
  );

  return (
    <div>
      <h1 className="text-xl font-semibold">Audit log</h1>
      <p className="mt-1 text-sm text-slate-600">Append-only. The last 300 entries{entity ? ` for ${entity}` : ""}.</p>
      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200">
            <tr>{["When", "Who", "Action", "Entity", "Change"].map((h) => <th key={h} className={thClass}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0">
                <td className={tdClass}>{manilaDateTime(r.at)}</td>
                <td className={tdClass}>{r.actorEmail ?? r.actorType}<span className="block text-xs text-slate-500">{r.actorType}</span></td>
                <td className={tdClass}>{r.action}</td>
                <td className={tdClass}>{r.entity}<span className="block font-mono text-xs text-slate-500">{r.entityId}</span></td>
                <td className={tdClass}>
                  <details>
                    <summary className="cursor-pointer text-slate-500">view</summary>
                    <pre className="mt-1 max-w-md overflow-x-auto text-xs">{JSON.stringify({ before: r.before, after: r.after }, null, 2)}</pre>
                  </details>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td className={tdClass} colSpan={5}>Nothing recorded.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
