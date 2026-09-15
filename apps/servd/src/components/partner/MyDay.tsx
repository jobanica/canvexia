import Link from "next/link";
import type { MyDay } from "@/server/partners/my-day";
import { StatCard, TONE, Bars, Donut, peso } from "@/components/canvexia/Cards";

const STAGE_LABELS: Record<string, string> = {
  lead: "Leads",
  contacted: "Contacted",
  demo: "Demo",
  negotiating: "Negotiating",
  paid: "Signed",
  lost: "Lost",
};

/**
 * The overview a `sales` or `support` seat gets.
 *
 * NOT a cut-down partner overview — a different screen. The partner-wide one
 * answers "how is the business doing"; this answers "what am I doing today",
 * and the second question is the only one a salesperson can act on.
 *
 * There is no ₱ figure here except the seat's own commission, and that is the
 * point: A7 exists so a partner can hire without handing every new person the
 * operator's revenue share.
 */
export function MyDay({
  day,
  canSeeCommission,
  canCheckIn,
  canSeePipeline,
}: {
  day: MyDay;
  canSeeCommission: boolean;
  canCheckIn: boolean;
  canSeePipeline: boolean;
}) {
  const time = (d: Date | null) =>
    d
      ? new Date(d).toLocaleTimeString("en-PH", {
          hour: "numeric",
          minute: "2-digit",
          timeZone: "Asia/Manila",
        })
      : null;

  const t = day.target;
  const visitPct = t && t.targetVisits > 0 ? Math.min(1, t.visits / t.targetVisits) : 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {canCheckIn && (
          <StatCard
            label="Today"
            tone="ink"
            value={
              day.checkedOutAt
                ? "Done"
                : day.checkedInAt
                  ? `In ${time(day.checkedInAt)}`
                  : "Not in"
            }
            note={
              day.checkedOutAt
                ? `${time(day.checkedInAt)} – ${time(day.checkedOutAt)}`
                : day.checkedInAt
                  ? "Checked in"
                  : "Check in from Attendance"
            }
            visual={<Bars fill={day.checkedInAt ? 5 : 0} className={TONE.ink.bar} />}
          />
        )}
        <StatCard
          label="Follow up today"
          tone="ember"
          value={String(day.followUps.length)}
          note={day.followUps.length === 0 ? "Nothing due" : "Due or overdue"}
          visual={<Bars fill={Math.min(5, day.followUps.length)} className={TONE.ember.bar} />}
        />
        <StatCard
          label="My merchants"
          tone="coral"
          value={String(day.merchants.length)}
          note={day.merchants.length === 0 ? "None assigned yet" : "Assigned to you"}
          visual={<Bars fill={Math.min(5, day.merchants.length)} className={TONE.coral.bar} />}
        />
        {canSeeCommission && (
          <StatCard
            label="Commission"
            tone="gradient"
            value={day.commissionCentavos === null ? "—" : peso(day.commissionCentavos)}
            note={
              // ₱0 would read as "you earned nothing". Until the monthly job
              // runs there is no statement, and saying so is the honest answer.
              day.commissionCentavos === null
                ? `${day.commissionMonth} closes on the 1st`
                : `Statement for ${day.commissionMonth}`
            }
            visual={<Donut pct={visitPct} className="stroke-brand-accent" />}
          />
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        <div className="rounded-tile border border-brand-ink/10 bg-white p-5">
          <p className="text-sm font-semibold">Follow up today</p>
          {day.followUps.length === 0 ? (
            <p className="mt-2 text-sm text-brand-ink/50">
              Nothing is due. Anything you set a follow-up date on shows here.
            </p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {day.followUps.map((f) => {
                const overdue = f.nextFollowUpAt ? new Date(f.nextFollowUpAt) < new Date() : false;
                return (
                  <li key={f.id} className="flex items-center justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{f.businessName}</span>
                    <span
                      className={`shrink-0 text-xs ${overdue ? "text-guava" : "text-brand-ink/45"}`}
                    >
                      {f.nextFollowUpAt
                        ? new Date(f.nextFollowUpAt).toLocaleDateString("en-PH", {
                            month: "short",
                            day: "numeric",
                            timeZone: "Asia/Manila",
                          })
                        : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {canSeePipeline && (
            <Link
              href="/partner/pipeline"
              className="mt-4 inline-block text-xs font-semibold text-brand-primary"
            >
              Open the pipeline →
            </Link>
          )}
        </div>

        <div className="rounded-tile border border-brand-ink/10 bg-white p-5">
          <p className="text-sm font-semibold">
            {t ? `Target for ${t.month}` : "My pipeline"}
          </p>
          {t ? (
            <ul className="mt-3 space-y-2.5">
              {[
                ["Visits", t.visits, t.targetVisits],
                ["Demos", t.demos, t.targetDemos],
                ["New merchants", t.conversions, t.targetMerchants],
              ].map(([label, actual, target]) => (
                <li key={String(label)}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span>{label}</span>
                    <span className="tabular-nums text-brand-ink/60">
                      {actual} / {target}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-brand-ink/8">
                    <div
                      className="h-full rounded-full bg-brand-primary"
                      style={{
                        width: `${
                          Number(target) > 0
                            ? Math.min(100, (Number(actual) / Number(target)) * 100)
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : day.byStage.length === 0 ? (
            <p className="mt-2 text-sm text-brand-ink/50">
              Nothing assigned to you yet.
            </p>
          ) : (
            <ul className="mt-3 space-y-1.5">
              {day.byStage.map((s) => (
                <li key={s.stage} className="flex items-center justify-between text-sm">
                  <span>{STAGE_LABELS[s.stage] ?? s.stage}</span>
                  <span className="tabular-nums text-brand-ink/60">{s.count}</span>
                </li>
              ))}
            </ul>
          )}
          {!t && (
            <p className="mt-4 text-xs text-brand-ink/40">
              No target set for this month. Your manager sets those.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-tile border border-brand-ink/10 bg-white p-5">
        <p className="text-sm font-semibold">My merchants</p>
        {day.merchants.length === 0 ? (
          <p className="mt-2 text-sm text-brand-ink/50">
            Nothing is assigned to you yet. Merchants you sign are assigned to you
            automatically; anything older has to be assigned by your manager.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-brand-ink/5">
            {day.merchants.map((m) => (
              <li key={m.key} className="flex items-center justify-between gap-3 py-2 text-sm">
                <Link href={`/partner/merchants/${m.key}`} className="min-w-0 truncate">
                  {m.name}
                </Link>
                <span className="shrink-0 text-xs text-brand-ink/45">{m.productName}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
