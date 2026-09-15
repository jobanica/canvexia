import Link from "next/link";
import type { HealthRow, HqAttentionItem } from "@/lib/hq/health";
import { Avatar, peso } from "@/components/canvexia/Cards";

const MILESTONE_COPY: Record<string, { label: string; tone: string }> = {
  met: { label: "Met", tone: "bg-brand-ink text-white" },
  on_track: { label: "On track", tone: "bg-brand-primary/10 text-brand-primary" },
  at_risk: { label: "At risk", tone: "bg-guava/10 text-guava" },
  missed: { label: "Missed", tone: "bg-guava text-white" },
};

const STATUS_TONE: Record<string, string> = {
  approved: "bg-brand-primary/10 text-brand-primary",
  pending: "bg-brand-ink/5 text-brand-ink/60",
  suspended: "bg-guava text-white",
  rejected: "bg-guava/10 text-guava",
};

function Settlement({ s }: { s: HealthRow["settlement"] }) {
  if (s.kind === "none") return <span className="text-brand-ink/30">—</span>;
  // The word matters: partner_collects means HQ invoices the partner for its
  // share rather than paying them. Calling both "payout" would tell half of all
  // partners they are owed money they actually owe.
  const noun = s.direction === "payout" ? "Payout" : "Invoice";
  if (s.kind === "paid") {
    return <span className="text-brand-ink/50">{noun} paid · {s.month}</span>;
  }
  if (s.kind === "overdue") {
    return (
      <span className="font-semibold text-guava">
        {noun} {s.days}d overdue · {s.month}
      </span>
    );
  }
  return (
    <span className="text-brand-ink/60">
      {noun} due · {s.month}
    </span>
  );
}

/**
 * Every partner, problems first.
 *
 * A TABLE, not cards. HQ reads this across ten columns looking for the one row
 * that is wrong, and a card grid makes that scan impossible. It scrolls
 * horizontally on a phone rather than dropping columns, because a column
 * silently missing on small screens is how somebody misses an overdue invoice.
 */
export function HealthBoard({ rows }: { rows: readonly HealthRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-tile border border-dashed border-brand-ink/15 bg-white p-10 text-center">
        <p className="font-heading text-lg font-bold">No partners yet</p>
        <p className="mt-1 text-sm text-brand-ink/55">
          Applications arrive from canvexia.com and land in Applications.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-tile border border-brand-ink/10 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="border-b border-brand-ink/10 text-xs uppercase tracking-wide text-brand-ink/45">
            <tr>
              <th className="px-5 py-3 font-semibold">Partner</th>
              <th className="px-3 py-3 font-semibold">Territory</th>
              <th className="px-3 py-3 font-semibold">Tier</th>
              <th className="px-3 py-3 text-right font-semibold">Merchants</th>
              <th className="px-3 py-3 text-right font-semibold">MRR</th>
              <th className="px-3 py-3 text-right font-semibold">HQ share</th>
              <th className="px-3 py-3 font-semibold">Milestone</th>
              <th className="px-3 py-3 font-semibold">Exclusivity</th>
              <th className="px-5 py-3 font-semibold">Settlement</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-ink/[0.06]">
            {rows.map((r) => {
              const m = r.milestone ? MILESTONE_COPY[r.milestone.status] : null;
              return (
                <tr key={r.id} className="hover:bg-brand-surface/60">
                  <td className="px-5 py-3">
                    <Link href={`/hq/partners/${r.id}`} className="flex items-center gap-3">
                      <Avatar name={r.name} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{r.name}</span>
                        <span className="mt-0.5 flex items-center gap-1.5">
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide ${
                              STATUS_TONE[r.status] ?? "bg-brand-ink/5 text-brand-ink/60"
                            }`}
                          >
                            {r.status}
                          </span>
                          {r.isHouse && (
                            <span className="rounded-full bg-brand-accent/15 px-1.5 py-0.5 text-[0.6rem] font-semibold uppercase tracking-wide text-brand-accent">
                              House
                            </span>
                          )}
                        </span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-brand-ink/60">{r.territory ?? "—"}</td>
                  <td className="px-3 py-3 text-brand-ink/60">{r.tier}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {r.merchants}
                    <span className="text-brand-ink/40"> / {r.paying}</span>
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">{peso(r.mrrCentavos)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{peso(r.hqShareCentavos)}</td>
                  <td className="px-3 py-3">
                    {m ? (
                      <span
                        className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${m.tone}`}
                      >
                        {m.label}
                      </span>
                    ) : (
                      <span className="text-brand-ink/30">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 tabular-nums">
                    {r.daysToExclusivity === null ? (
                      <span className="text-brand-ink/30">not set</span>
                    ) : r.daysToExclusivity < 0 ? (
                      <span className="font-semibold text-guava">lapsed</span>
                    ) : (
                      <span className={r.daysToExclusivity <= 30 ? "font-semibold text-guava" : "text-brand-ink/60"}>
                        {r.daysToExclusivity}d
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-xs">
                    <Settlement s={r.settlement} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="border-t border-brand-ink/10 px-5 py-3 text-xs text-brand-ink/45">
        Sorted with problems first. Merchants reads <em>total / paying</em>; MRR is today&rsquo;s
        prices × today&rsquo;s active merchants, not a statement.
      </p>
    </div>
  );
}

const KIND_LAMP: Record<HqAttentionItem["kind"], string> = {
  overdue: "bg-guava",
  milestone: "bg-brand-accent",
  demand: "bg-brand-primary",
};

export function HqAttentionList({ items }: { items: readonly HqAttentionItem[] }) {
  return (
    <div className="rounded-tile border border-brand-ink/10 bg-white">
      <div className="flex items-baseline justify-between gap-3 border-b border-brand-ink/10 px-5 py-4">
        <h2 className="font-heading text-lg font-bold">Needs you</h2>
        <span className="text-xs tabular-nums text-brand-ink/45">
          {items.length === 0 ? "nothing today" : `${items.length}`}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-brand-ink/50">
          No overdue settlements, no missed milestones, no unserved cities.
        </p>
      ) : (
        <ul className="divide-y divide-brand-ink/[0.06]">
          {items.map((i, n) => (
            <li key={`${i.kind}-${i.href}-${n}`}>
              <Link href={i.href} className="flex items-start gap-3 px-5 py-3.5 hover:bg-brand-surface/60">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${KIND_LAMP[i.kind]}`} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{i.title}</span>
                  <span className="mt-0.5 block text-xs text-brand-ink/55">{i.detail}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {/*
        Stated on the screen, not just in the code. The brief asks for five
        rules; two of them — domains stuck unverified, escalations open — have
        nothing behind them in this database. An always-empty section looks like
        everything is handled, so they are absent and this says so.
      */}
      <p className="border-t border-brand-ink/10 px-5 py-3 text-xs text-brand-ink/40">
        Watching overdue settlements, missed milestones and unserved cities. Domain and escalation
        alerts arrive when there is a domain registry and a ticket system to read.
      </p>
    </div>
  );
}
