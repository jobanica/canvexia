import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { requireAdminPage } from "@/lib/admin-page";
import { staffDb } from "@/server/scoped-db";
import { WAITING } from "@/server/events/ingest";
import { ActionForm } from "@/components/ActionForm";
import { Badge, tdClass, thClass } from "@/components/AdminShell";
import { manilaDateTime } from "@/lib/time";
import { retryEventAction } from "./actions";

const FILTERS: Record<string, Prisma.AgentEventWhereInput> = {
  all: {},
  waiting: { processedAt: null, error: WAITING },
  refused: { processedAt: { not: null }, error: { not: null } },
};

export default async function EventsPage({ searchParams }: { searchParams: Promise<{ filter?: string }> }) {
  await requireAdminPage();
  const { filter = "all" } = await searchParams;
  const where = FILTERS[filter] ?? FILTERS.all;
  const events = await staffDb("admin", (tx) =>
    tx.agentEvent.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      take: 200,
      include: { product: { select: { slug: true } } },
    }),
  );

  return (
    <div>
      <h1 className="text-xl font-semibold">Events</h1>
      <p className="mt-1 text-sm text-slate-600">Everything products have reported, newest first. The last 200.</p>
      <div className="mt-3 flex gap-3 text-sm">
        {Object.keys(FILTERS).map((f) => (
          <Link key={f} href={`/admin/events?filter=${f}`} className={f === filter ? "font-semibold" : "text-slate-600"}>{f}</Link>
        ))}
      </div>
      <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200">
            <tr>
              {["Received", "Product", "Type", "Customer", "State", "Payload", ""].map((h) => <th key={h} className={thClass}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {events.map((e) => {
              const state = !e.processedAt
                ? <Badge tone="amber">{e.error ?? "unprocessed"}</Badge>
                : e.error ? <Badge tone="red">{e.error}</Badge> : <Badge tone="green">processed</Badge>;
              return (
                <tr key={e.id} className="border-b border-slate-100 last:border-0">
                  <td className={tdClass}>{manilaDateTime(e.receivedAt)}</td>
                  <td className={`${tdClass} font-mono`}>{e.product.slug}</td>
                  <td className={tdClass}>{e.type}</td>
                  <td className={`${tdClass} font-mono text-xs`}>{e.externalCustomerId}</td>
                  <td className={tdClass}>{state}</td>
                  <td className={tdClass}>
                    <details>
                      <summary className="cursor-pointer text-slate-500">view</summary>
                      <pre className="mt-1 max-w-md overflow-x-auto text-xs">{JSON.stringify(e.payload, null, 2)}</pre>
                    </details>
                  </td>
                  <td className={tdClass}>
                    {!e.processedAt && (
                      <ActionForm action={retryEventAction} submitLabel="Retry" pendingLabel="…" className="space-y-1">
                        <input type="hidden" name="eventRowId" value={e.id} />
                      </ActionForm>
                    )}
                  </td>
                </tr>
              );
            })}
            {events.length === 0 && <tr><td className={tdClass} colSpan={7}>No events.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
