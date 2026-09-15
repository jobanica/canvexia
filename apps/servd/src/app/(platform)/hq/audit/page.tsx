import Link from "next/link";
import { requireHqPage } from "@/server/hq/auth";
import { listImpersonations, searchAudit } from "@/server/hq/team";
import { systemDb } from "@/server/tenancy/scoped-db";
import { HqShell } from "@/components/hq/HqShell";

const ACTOR_TONE: Record<string, string> = {
  hq: "bg-brand-ink text-white",
  partner: "bg-brand-primary/10 text-brand-primary",
  merchant: "bg-brand-accent/15 text-brand-accent",
  system: "bg-brand-ink/5 text-brand-ink/50",
};

function when(d: Date) {
  return d.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
}

function duration(seconds: number | null) {
  if (seconds === null) return "never opened";
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export default async function HqAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const user = await requireHqPage("audit.read");
  const sp = await searchParams;
  const view = sp.view === "impersonation" ? "impersonation" : "all";

  const [audit, impersonations, partners] = await Promise.all([
    view === "all"
      ? searchAudit({
          actor: sp.actor,
          partnerId: sp.partner,
          action: sp.action,
          from: sp.from,
          to: sp.to,
        })
      : Promise.resolve({ rows: [], actions: [], actors: [] }),
    view === "impersonation" ? listImpersonations() : Promise.resolve([]),
    systemDb((tx) => tx.partner.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })),
  ]);

  return (
    <HqShell user={user} title="Audit" subtitle="Every actor, every partner, every app.">
      <nav className="flex flex-wrap gap-1.5 border-b border-brand-ink/10 pb-3">
        {[
          ["all", "Everything"],
          ["impersonation", "View-as sessions"],
        ].map(([v, label]) => (
          <Link
            key={v}
            href={`/hq/audit?view=${v}`}
            className={`rounded-full px-3.5 py-1.5 text-sm ${
              v === view ? "bg-brand-ink font-semibold text-white" : "text-brand-ink/60 hover:bg-brand-ink/[0.04]"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>

      {view === "all" ? (
        <>
          <form className="mt-4 flex flex-wrap items-end gap-2 rounded-tile border border-brand-ink/10 bg-white p-4">
            <label className="text-xs font-semibold text-brand-ink/70">
              Actor
              <input name="actor" defaultValue={sp.actor ?? ""} placeholder="email" className="mt-1 block min-h-[38px] rounded-lg border border-brand-ink/15 px-3 text-sm" />
            </label>
            <label className="text-xs font-semibold text-brand-ink/70">
              Partner
              <select name="partner" defaultValue={sp.partner ?? ""} className="mt-1 block min-h-[38px] rounded-lg border border-brand-ink/15 px-3 text-sm">
                <option value="">Any</option>
                {partners.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
              </select>
            </label>
            <label className="text-xs font-semibold text-brand-ink/70">
              Action
              <select name="action" defaultValue={sp.action ?? ""} className="mt-1 block min-h-[38px] rounded-lg border border-brand-ink/15 px-3 text-sm">
                <option value="">Any</option>
                {audit.actions.map((a) => (<option key={a} value={a}>{a}…</option>))}
              </select>
            </label>
            <label className="text-xs font-semibold text-brand-ink/70">
              From
              <input type="date" name="from" defaultValue={sp.from ?? ""} className="mt-1 block min-h-[38px] rounded-lg border border-brand-ink/15 px-3 text-sm" />
            </label>
            <label className="text-xs font-semibold text-brand-ink/70">
              To
              <input type="date" name="to" defaultValue={sp.to ?? ""} className="mt-1 block min-h-[38px] rounded-lg border border-brand-ink/15 px-3 text-sm" />
            </label>
            <button className="min-h-[38px] rounded-full bg-brand-ink px-4 text-sm font-semibold text-white">Filter</button>
          </form>

          <div className="mt-4 overflow-hidden rounded-tile border border-brand-ink/10 bg-white">
            {audit.rows.length === 0 ? (
              <p className="px-5 py-8 text-center text-sm text-brand-ink/50">Nothing matches that.</p>
            ) : (
              <ul className="divide-y divide-brand-ink/[0.06]">
                {audit.rows.map((r) => (
                  <li key={r.id} className="px-5 py-3">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className={`rounded-full px-2 py-0.5 text-[0.6rem] font-semibold uppercase ${ACTOR_TONE[r.actorType ?? "merchant"]}`}>
                        {r.actorType ?? "merchant"}
                      </span>
                      <span className="font-mono text-xs font-semibold">{r.action}</span>
                      <span className="text-xs text-brand-ink/55">{r.actorEmail ?? "system"}</span>
                      {r.partnerName && (
                        <Link href={`/hq/partners/${r.partnerId}`} className="text-xs text-brand-primary">
                          {r.partnerName}
                        </Link>
                      )}
                      <span className="ml-auto text-xs tabular-nums text-brand-ink/35">{when(r.createdAt)}</span>
                    </div>
                    {r.reason && <p className="mt-1 text-xs text-brand-ink/55">&ldquo;{r.reason}&rdquo;</p>}
                    {(r.before != null || r.after != null) && (
                      <p className="mt-1 break-all font-mono text-[0.65rem] text-brand-ink/40">
                        {r.before != null ? `${JSON.stringify(r.before)} → ` : ""}
                        {r.after != null ? JSON.stringify(r.after) : ""}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : (
        <div className="mt-4 overflow-hidden rounded-tile border border-brand-ink/10 bg-white">
          <h2 className="border-b border-brand-ink/10 px-5 py-4 font-heading text-lg font-bold">
            Every time HQ has been inside a partner&rsquo;s portal
          </h2>
          {impersonations.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-brand-ink/50">
              Nobody has opened a view-as session.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead className="border-b border-brand-ink/10 text-xs uppercase tracking-wide text-brand-ink/45">
                <tr>
                  <th className="px-5 py-3 font-semibold">Who</th>
                  <th className="px-3 py-3 font-semibold">Partner</th>
                  <th className="px-3 py-3 font-semibold">Why</th>
                  <th className="px-3 py-3 font-semibold">Opened</th>
                  <th className="px-3 py-3 font-semibold">Lasted</th>
                  <th className="px-5 py-3 font-semibold">State</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-ink/[0.06]">
                {impersonations.map((r) => (
                  <tr key={r.id}>
                    <td className="px-5 py-3">{r.hqAdminEmail}</td>
                    <td className="px-3 py-3">
                      <Link href={`/hq/partners/${r.partnerId}`} className="text-brand-primary">{r.partnerName}</Link>
                    </td>
                    <td className="px-3 py-3 text-xs text-brand-ink/60">{r.reason ?? "—"}</td>
                    <td className="px-3 py-3 text-xs tabular-nums">{r.usedAt ? when(r.usedAt) : "—"}</td>
                    <td className="px-3 py-3 text-xs tabular-nums">{duration(r.durationSeconds)}</td>
                    <td className="px-5 py-3 text-xs">{r.state}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="border-t border-brand-ink/10 px-5 py-3 text-xs text-brand-ink/45">
            A session that was opened and never explicitly ended is counted to its 30-minute
            expiry — the cookie is useless past it, so that is how long it lasted.
          </p>
        </div>
      )}
    </HqShell>
  );
}
