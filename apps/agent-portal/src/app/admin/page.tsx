import Link from "next/link";
import { redirect } from "next/navigation";
import { getSignedIn } from "@/server/auth";
import { staffDb } from "@/server/scoped-db";
import { WAITING } from "@/server/events/ingest";

export default async function AdminOverview() {
  const who = await getSignedIn();
  if (!who || who.kind !== "staff") redirect("/login");

  if (who.role === "verifier") {
    return (
      <div>
        <h1 className="text-xl font-semibold">Verification</h1>
        <p className="mt-2 text-sm text-slate-600">The receipt queue appears here.</p>
      </div>
    );
  }

  const [pendingAgents, activeAgents, products, waiting, refused] = await staffDb("admin", (tx) =>
    Promise.all([
      tx.agent.count({ where: { status: "pending" } }),
      tx.agent.count({ where: { status: "active" } }),
      tx.agentProduct.count({ where: { status: "active" } }),
      tx.agentEvent.count({ where: { processedAt: null, error: WAITING } }),
      tx.agentEvent.count({ where: { processedAt: { not: null }, error: { not: null } } }),
    ]),
  );

  const tiles: [string, number, string][] = [
    ["Applications to review", pendingAgents, "/admin/agents?status=pending"],
    ["Active agents", activeAgents, "/admin/agents?status=active"],
    ["Active products", products, "/admin/products"],
    ["Events waiting for a customer", waiting, "/admin/events?filter=waiting"],
    ["Events refused", refused, "/admin/events?filter=refused"],
  ];

  return (
    <div>
      <h1 className="text-xl font-semibold">Overview</h1>
      <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map(([label, n, href]) => (
          <Link key={label} href={href} className="rounded-lg border border-slate-200 bg-white p-4 hover:border-slate-400">
            <p className="text-2xl font-semibold">{n}</p>
            <p className="text-sm text-slate-600">{label}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
