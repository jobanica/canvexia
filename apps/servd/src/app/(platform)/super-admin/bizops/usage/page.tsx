import Link from "next/link";
import { requireSuperAdminPage } from "@/server/tenancy/require-admin";
import { getPortfolio } from "@/server/bizops/portfolio";
import { fmtPeso, fmtRate, capPercent } from "@/lib/bizops/metrics";
import { SEGMENT_LABEL, SEGMENT_PRIORITY, type Segment } from "@/lib/bizops/segments";

export const dynamic = "force-dynamic";
export const metadata = { title: "Usage & segments · Servd" };

const BAND_STYLE: Record<string, string> = {
  unlimited: "bg-plum-ink/5 text-plum-ink/45",
  ok: "bg-emerald-100 text-emerald-800",
  opportunity: "bg-amber-100 text-amber-900",
  notify: "bg-amber-200 text-amber-900",
  prompt: "bg-orange-200 text-orange-900",
  capped: "bg-red-600 text-white",
};

/**
 * Every restaurant against its cap, and which segment it falls in.
 *
 * The cap number comes from the shared `capFor` the owner's own banner uses —
 * imported, never re-derived, so this screen can't tell you somebody is capped
 * while their dashboard says otherwise.
 */
export default async function UsagePage() {
  await requireSuperAdminPage();
  const rows = await getPortfolio();

  if (rows == null) {
    return (
      <Shell>
        <div className="rounded-tile border border-mango/40 bg-mango/5 p-4">
          <p className="text-sm font-semibold">Couldn&apos;t read the portfolio.</p>
          <p className="mt-1 text-xs text-plum-ink/60">
            Showing nothing rather than an empty list that would read as &ldquo;no
            customers&rdquo;.
          </p>
        </div>
      </Shell>
    );
  }

  const bySegment = new Map<Segment, typeof rows>();
  for (const r of rows) {
    const list = bySegment.get(r.segment) ?? [];
    list.push(r);
    bySegment.set(r.segment, list);
  }
  const ordered: Segment[] = [
    ...SEGMENT_PRIORITY,
    ...([...bySegment.keys()].filter((s) => !SEGMENT_PRIORITY.includes(s)) as Segment[]),
  ];

  return (
    <Shell>
      <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {ordered
          .filter((s) => (bySegment.get(s)?.length ?? 0) > 0)
          .map((s) => (
            <a
              key={s}
              href={`#seg-${s}`}
              className="rounded-tile border border-plum-ink/10 bg-white p-3 hover:border-brand-primary"
            >
              <p className="font-heading text-2xl font-extrabold">{bySegment.get(s)!.length}</p>
              <p className="text-xs text-plum-ink/55">{SEGMENT_LABEL[s]}</p>
            </a>
          ))}
      </div>

      {ordered
        .filter((s) => (bySegment.get(s)?.length ?? 0) > 0)
        .map((s) => (
          <section key={s} id={`seg-${s}`} className="scroll-mt-4">
            <h2 className="mb-2 font-heading text-lg font-bold">
              {SEGMENT_LABEL[s]}{" "}
              <span className="font-normal text-plum-ink/40">({bySegment.get(s)!.length})</span>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-plum-ink/15 text-left text-xs uppercase tracking-wide text-plum-ink/45">
                    <th className="py-2 pr-3">Restaurant</th>
                    <th className="py-2 pr-3">Orders</th>
                    <th className="py-2 pr-3">Cap</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3 text-right">Paid so far</th>
                  </tr>
                </thead>
                <tbody>
                  {bySegment.get(s)!.map((r) => (
                    <tr key={r.id} className="border-b border-plum-ink/5">
                      <td className="py-2 pr-3">
                        <Link
                          href={`/super-admin/bizops/customers/${r.id}`}
                          className="font-medium hover:text-brand-primary hover:underline"
                        >
                          {r.name}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{r.ordersThisMonth}</td>
                      <td className="py-2 pr-3 tabular-nums text-plum-ink/50">
                        {r.cap ?? "∞"}
                        {r.cap != null && (
                          <span className="ml-1 text-xs">
                            ({fmtRate(capPercent(r.ordersThisMonth, r.cap))})
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${BAND_STYLE[r.band]}`}
                        >
                          {r.band}
                        </span>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {fmtPeso(r.lifetimeValue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-6">
      <div>
        <Link href="/super-admin/bizops" className="text-sm text-plum-ink/50">
          ← Business
        </Link>
        <h1 className="font-heading text-2xl font-bold">Usage &amp; segments</h1>
        <p className="max-w-2xl text-sm text-plum-ink/50">
          Every restaurant against its monthly order cap, grouped by what it needs. The cap comes
          from the same rule the owner&apos;s own dashboard uses.
        </p>
      </div>
      {children}
    </div>
  );
}
