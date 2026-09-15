import { requireHqPage } from "@/server/hq/auth";
import { getHqOverview } from "@/server/hq/overview";
import { HqShell } from "@/components/hq/HqShell";
import { HealthBoard, HqAttentionList } from "@/components/hq/HealthBoard";
import { HqGrowthChart } from "@/components/hq/HqGrowthChart";
import { Bars, Donut, StatCard, TONE, momNote, peso } from "@/components/canvexia/Cards";

/**
 * CANVEXIA HQ — the whole business on one screen.
 *
 * The four cards carry REAL month-on-month figures where there is a previous
 * month to compare against, and say what the number is where there is not.
 * `momNote` returns null rather than 0% for a previous month of zero, because
 * "up 0%" and "there was nothing here last month" are different statements and
 * on this database the second one is usually the true one.
 */
export default async function HqOverviewPage() {
  const user = await requireHqPage();
  const o = await getHqOverview();

  const payingRatio = o.merchants.total > 0 ? o.merchants.paying / o.merchants.total : 0;
  const hqRatio = o.grossMrrCentavos > 0 ? o.hqMrrCentavos / o.grossMrrCentavos : 0;

  return (
    <HqShell
      user={user}
      title="Overview"
      subtitle="Every partner, every product, every peso — as it stands right now."
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Partners"
          tone="ink"
          value={String(o.partners.active)}
          note={
            o.partners.onboarding + o.partners.suspended === 0
              ? "All active"
              : `${o.partners.onboarding} onboarding · ${o.partners.suspended} suspended`
          }
          visual={<Bars fill={Math.min(5, o.partners.active)} className={TONE.ink.bar} />}
        />
        <StatCard
          label="Merchants"
          tone="coral"
          value={String(o.merchants.total)}
          note={momNote(o.mom.merchants, `${o.merchants.paying} paying`)}
          visual={<Donut pct={payingRatio} className="stroke-brand-primary" />}
        />
        <StatCard
          label="Gross MRR"
          tone="ember"
          value={peso(o.grossMrrCentavos)}
          note={momNote(o.mom.grossMrr, "What merchants pay, per month")}
          visual={<Bars fill={Math.min(5, Math.ceil(o.grossMrrCentavos / 100_000))} className={TONE.ember.bar} />}
        />
        <StatCard
          label="HQ share"
          tone="gradient"
          value={peso(o.hqMrrCentavos)}
          note={momNote(o.mom.hqMrr, "What CANVEXIA keeps, per month")}
          visual={<Donut pct={hqRatio} className="stroke-brand-accent" />}
        />
      </div>

      {/* items-start, or the attention card stretches to the board's height and
          an empty state becomes a very tall empty box. */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_22rem] lg:items-start">
        <div className="min-w-0">
          <HealthBoard rows={o.board} />
        </div>
        <HqAttentionList items={o.attention} />
      </div>

      <div className="mt-4">
        <HqGrowthChart series={o.series} />
      </div>

      <p className="mt-6 text-xs text-brand-ink/40">
        A payout or invoice reads as overdue after {o.overdueDays} days. Change that in
        program settings.
      </p>
    </HqShell>
  );
}
