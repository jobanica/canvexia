import Link from "next/link";
import { requireSuperAdminPage } from "@/server/tenancy/require-admin";
import { periodStart, type Period } from "@/server/bizops/queries";
import { getCac, getCohorts, getFullFunnel, getWorkerActivity } from "@/server/bizops/analytics";
import { getPortfolio } from "@/server/bizops/portfolio";
import { AdSpendForm } from "@/components/super-admin/AdSpendForm";
import { fmtCount, fmtPeso, fmtRate } from "@/lib/bizops/metrics";
import { manilaDateTime } from "@/lib/time/manila";

export const dynamic = "force-dynamic";
export const metadata = { title: "Analytics · Servd" };

const PERIODS: { key: Period; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
];

/**
 * Phase 3: the funnel end to end, what acquisition cost, what a cohort is
 * worth, and who did the chasing.
 *
 * Cohort value is computed from the same portfolio the profile pages read, so
 * the lifetime figure here and the one on a customer's own page are the same
 * money rather than two calculations that drift.
 */
export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await requireSuperAdminPage();
  const { period: raw } = await searchParams;
  const period: Period = raw === "today" || raw === "month" ? raw : "month";
  const since = periodStart(period);

  const [cac, funnel, portfolio, workers] = await Promise.all([
    getCac(since),
    getFullFunnel(since),
    getPortfolio(),
    getWorkerActivity(since),
  ]);
  const cohorts = getCohorts(portfolio ?? []);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/super-admin/bizops" className="text-sm text-plum-ink/50">
            ← Business
          </Link>
          <h1 className="font-heading text-2xl font-bold">Analytics</h1>
          <p className="text-sm text-plum-ink/50">
            Where the funnel leaks, what a customer cost, and what they end up worth.
          </p>
        </div>
        <div className="flex gap-1 rounded-full bg-plum-ink/5 p-1">
          {PERIODS.map((p) => (
            <Link
              key={p.key}
              href={`/super-admin/bizops/analytics?period=${p.key}`}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                p.key === period ? "bg-white text-brand-primary shadow-sm" : "text-plum-ink/60"
              }`}
            >
              {p.label}
            </Link>
          ))}
        </div>
      </div>

      <section>
        <h2 className="mb-2 font-heading text-lg font-bold">Funnel</h2>
        <div className="overflow-hidden rounded-tile border border-plum-ink/10 bg-white">
          {funnel.map((s, i) => (
            <div
              key={s.label}
              className="flex items-center justify-between border-b border-plum-ink/5 px-4 py-3 last:border-0"
            >
              <span className="text-sm">{s.label}</span>
              <span className="flex items-baseline gap-3">
                <span className="font-heading text-lg font-bold tabular-nums">
                  {fmtCount(s.count)}
                </span>
                {i > 0 && (
                  <span
                    className={`w-14 text-right text-xs tabular-nums ${
                      s.fromPrevious != null && s.fromPrevious < 25
                        ? "font-semibold text-guava"
                        : "text-plum-ink/45"
                    }`}
                  >
                    {fmtRate(s.fromPrevious)}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-1 text-xs text-plum-ink/45">
          The first two lines are two different intake tracks, not one sequence, so no conversion
          is shown between them.
        </p>
      </section>

      <section>
        <h2 className="mb-2 font-heading text-lg font-bold">Acquisition cost</h2>
        <div className="mb-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Ad spend" value={fmtPeso(cac.spend)} />
          <Stat label="Accounts started" value={fmtCount(cac.leads)} />
          <Stat label="Cost per lead" value={fmtPeso(cac.costPerLead)} />
          <Stat label="Cost per activation" value={fmtPeso(cac.costPerActivation)} />
        </div>
        <AdSpendForm />
      </section>

      <section>
        <h2 className="mb-2 font-heading text-lg font-bold">Cohorts</h2>
        {cohorts.length === 0 ? (
          <p className="text-sm text-plum-ink/50">No paying customers yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="border-b border-plum-ink/15 text-left text-xs uppercase tracking-wide text-plum-ink/45">
                  <th className="py-2 pr-3">Joined</th>
                  <th className="py-2 pr-3">Customers</th>
                  <th className="py-2 pr-3 text-right">Revenue</th>
                  <th className="py-2 pr-3 text-right">Per customer</th>
                </tr>
              </thead>
              <tbody>
                {cohorts.map((c) => (
                  <tr key={c.month} className="border-b border-plum-ink/5">
                    <td className="py-2 pr-3 font-mono text-xs">{c.month}</td>
                    <td className="py-2 pr-3 tabular-nums">{c.customers}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{fmtPeso(c.revenue)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums font-semibold">
                      {fmtPeso(c.perCustomer)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-heading text-lg font-bold">Who did the chasing</h2>
        {workers.length === 0 ? (
          <p className="text-sm text-plum-ink/50">
            No follow-ups recorded in this window. Counted from the Follow-Up Centre — marking one
            there is what puts a name here.
          </p>
        ) : (
          <div className="overflow-hidden rounded-tile border border-plum-ink/10 bg-white">
            {workers.map((w) => (
              <div
                key={w.actor}
                className="flex items-center justify-between border-b border-plum-ink/5 px-4 py-2 text-sm last:border-0"
              >
                <span>{w.actor}</span>
                <span className="text-plum-ink/50">
                  <span className="font-semibold text-plum-ink">{w.followUps}</span> follow-ups ·
                  last {manilaDateTime(w.lastAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
      <p className="text-xs font-medium text-plum-ink/50">{label}</p>
      <p className="mt-1 font-heading text-2xl font-extrabold">{value}</p>
    </div>
  );
}
