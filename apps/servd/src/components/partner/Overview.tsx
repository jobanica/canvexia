import Link from "next/link";
import type { MilestoneProgress } from "@servd/core";
import type { AttentionItem } from "@/lib/partners/attention";
import type { PartnerOverview } from "@/server/partners/overview";
import type { OnboardingStep } from "@/server/partners/overview";
import {
  setOnboardingStepAction,
  dismissOnboardingAction,
} from "@/server/partners/onboarding-actions";
// Extracted to components/canvexia when the HQ console needed the same four-card
// rhythm. Copying them would have produced two sets that drift, and the first
// symptom of that is two screens in one product that stop looking like one.
import { Avatar, Bars, Donut, StatCard, TONE, peso } from "@/components/canvexia/Cards";

export { peso };

export function StatCards({ o }: { o: PartnerOverview }) {
  const payingRatio = o.merchants.length > 0 ? o.payingCount / o.merchants.length : 0;
  const attention = o.attention.length;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Merchants"
        tone="ink"
        value={String(o.merchants.length)}
        note={`${o.payingCount} paying`}
        visual={<Bars fill={Math.min(5, o.merchants.length)} className={TONE.ink.bar} />}
      />
      <StatCard
        label="MRR"
        tone="coral"
        value={peso(o.mrrCentavos)}
        note="What merchants pay, per month"
        visual={<Donut pct={payingRatio} className="stroke-brand-primary" />}
      />
      <StatCard
        label="Needs you"
        tone="ember"
        value={String(attention)}
        note={attention === 0 ? "Nothing today" : "On the list below"}
        visual={<Bars fill={Math.min(5, attention)} className={TONE.ember.bar} />}
      />
      <StatCard
        label={o.settlementDirection === "payout" ? "Your payout" : "Your share"}
        tone="gradient"
        value={peso(o.partnerShareCentavos)}
        note={
          // partner_collects means the money never passes through HQ, so what is
          // owed flows the other way. Labelling both "payout" would tell half of
          // all partners they are owed money they actually owe.
          o.settlementDirection === "payout"
            ? "HQ collects and pays you"
            : "You collect; HQ invoices its share"
        }
        visual={<Donut pct={payingRatio} className="stroke-brand-accent" />}
      />
    </div>
  );
}

const STATUS_COPY: Record<MilestoneProgress["status"], { label: string; tone: string }> = {
  met: { label: "Met", tone: "bg-brand-ink text-white" },
  on_track: { label: "On track", tone: "bg-brand-primary/10 text-brand-primary" },
  at_risk: { label: "At risk", tone: "bg-guava/10 text-guava" },
  missed: { label: "Missed", tone: "bg-guava text-white" },
};

export function MilestoneTracker({ o }: { o: PartnerOverview }) {
  return (
    <div className="rounded-tile border border-brand-ink/10 bg-white p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-heading text-lg font-bold">Milestones</h2>
        {!o.licenseStartedAt && (
          // No start date means no pace to be behind. Saying so is better than
          // showing a progress bar against a date nobody set.
          <span className="text-xs text-brand-ink/45">Licence start date not set</span>
        )}
      </div>

      <ul className="mt-4 space-y-4">
        {o.milestones.steps.map((s) => {
          const copy = STATUS_COPY[s.status];
          return (
            <li key={s.month}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-semibold">
                  {s.target} merchants by month {s.month}
                </span>
                <span className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide ${copy.tone}`}>
                    {copy.label}
                  </span>
                  {s.daysRemaining !== null && s.status !== "met" && (
                    <span className="text-xs tabular-nums text-brand-ink/50">
                      {s.daysRemaining > 0 ? `${s.daysRemaining}d left` : "past due"}
                    </span>
                  )}
                </span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-brand-ink/[0.08]">
                <div
                  className="h-full rounded-full bg-brand-primary"
                  style={{ width: `${Math.round(s.progress * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs tabular-nums text-brand-ink/45">
                {s.actual} of {s.target}
              </p>
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-xs leading-relaxed text-brand-ink/45">
        &ldquo;At risk&rdquo; means behind a straight line from your licence start to the due
        date. Sales do not land in a straight line — treat it as a nudge, not a forecast.
      </p>
    </div>
  );
}

const KIND_LABEL: Record<AttentionItem["kind"], string> = {
  past_due: "Past due",
  trial_ending: "Trial ending",
  quiet: "Gone quiet",
  follow_up: "Follow up",
};

const KIND_LAMP: Record<AttentionItem["kind"], string> = {
  past_due: "bg-guava",
  trial_ending: "bg-brand-accent",
  quiet: "bg-brand-ink/25",
  follow_up: "bg-brand-primary",
};

/**
 * The attention list, as the reference's table card.
 *
 * A TABLE on desktop and CARDS on a phone. The layout being followed is a
 * desktop admin console; this screen is also used standing in a restaurant, and
 * a six-column table at 390px is a table nobody reads.
 *
 * The "situation" lamp carries a text label as well as a colour. A dot alone
 * encodes the only urgent thing on the screen in hue, which is invisible to
 * anyone who cannot separate red from grey.
 */
export function AttentionList({ items }: { items: AttentionItem[] }) {
  return (
    <div className="overflow-hidden rounded-tile border border-brand-ink/10 bg-white">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-brand-ink/10 px-5 py-4">
        <h2 className="font-heading text-lg font-bold">Needs you today</h2>
        <span className="text-xs tabular-nums text-brand-ink/45">
          {items.length === 0 ? "All clear" : `${items.length} item${items.length === 1 ? "" : "s"}`}
        </span>
      </div>

      {items.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-brand-ink/50">
          Nothing needs attention. Go sign someone up.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-brand-ink/[0.07] sm:hidden">
            {items.map((i, idx) => (
              <li key={`${i.kind}-${i.href}-${idx}`}>
                <Link href={i.href} className="flex items-center gap-3 px-4 py-3.5">
                  <Avatar name={i.title} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{i.title}</span>
                    <span className="block text-xs text-brand-ink/55">{i.detail}</span>
                  </span>
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${KIND_LAMP[i.kind]}`} />
                </Link>
              </li>
            ))}
          </ul>

          <table className="hidden w-full text-sm sm:table">
            <thead>
              <tr className="border-b border-brand-ink/[0.07] text-left text-xs uppercase tracking-wide text-brand-ink/45">
                <th className="px-5 py-3 font-semibold">Name</th>
                <th className="px-5 py-3 font-semibold">What</th>
                <th className="px-5 py-3 font-semibold">Situation</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-ink/[0.07]">
              {items.map((i, idx) => (
                <tr key={`${i.kind}-${i.href}-${idx}`} className="hover:bg-brand-surface">
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-3">
                      <Avatar name={i.title} />
                      <span className="truncate font-semibold">{i.title}</span>
                    </span>
                  </td>
                  <td className="px-5 py-3 text-brand-ink/60">{i.detail}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center gap-2 text-xs text-brand-ink/60">
                      <span className={`h-2.5 w-2.5 rounded-full ${KIND_LAMP[i.kind]}`} />
                      {KIND_LABEL[i.kind]}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Link
                      href={i.href}
                      className="inline-flex min-h-[36px] items-center rounded-full bg-brand-ink px-4 text-xs font-semibold text-white hover:bg-black"
                    >
                      View details
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

/**
 * The "Get set up" card.
 *
 * Four of the six steps are DERIVED from real state and tick themselves. The
 * other two — the training and the kickoff call — are things nothing in this
 * system can observe, so they carry a tick control and the partner asserts
 * them. Before this they were read-only flags that nothing wrote, which meant
 * the card could never reach 6 of 6 no matter what a partner did.
 *
 * `canEdit` is `settings.write`. A seat without it still sees the checklist —
 * knowing what is outstanding is not privileged — and gets no controls, which
 * is the same hide-don't-disable rule the rest of the portal follows.
 */
export function OnboardingChecklist({
  steps,
  canEdit = false,
  dismissed = false,
}: {
  steps: OnboardingStep[];
  canEdit?: boolean;
  dismissed?: boolean;
}) {
  const done = steps.filter((s) => s.done).length;

  // Dismissed but not finished: one line with the way back, rather than nothing
  // at all. A card that vanishes with no trace is a card a partner cannot
  // recover when they change their mind.
  if (dismissed && done < steps.length) {
    return canEdit ? (
      <form action={dismissOnboardingAction} className="text-xs text-brand-ink/45">
        <input type="hidden" name="restore" value="true" />
        <button className="underline underline-offset-2 hover:text-brand-ink/70">
          Show setup checklist ({done} of {steps.length} done)
        </button>
      </form>
    ) : null;
  }
  if (done === steps.length) return null;

  return (
    <div className="rounded-tile border border-brand-primary/25 bg-brand-primary/[0.04] p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-heading text-lg font-bold">Get set up</h2>
        <span className="flex items-baseline gap-3">
          <span className="text-xs tabular-nums text-brand-ink/50">
            {done} of {steps.length}
          </span>
          {canEdit && (
            <form action={dismissOnboardingAction}>
              <button className="text-xs text-brand-ink/40 underline underline-offset-2 hover:text-brand-ink/70">
                Hide
              </button>
            </form>
          )}
        </span>
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {steps.map((s) => {
          const body = (
            <span className={`flex items-center gap-2.5 text-sm ${s.done ? "text-brand-ink/40" : ""}`}>
              <span
                aria-hidden="true"
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[0.7rem] ${
                  s.done ? "border-brand-ink/20 bg-brand-ink/10" : "border-brand-primary/40"
                }`}
              >
                {s.done ? "✓" : ""}
              </span>
              <span className={s.done ? "line-through" : "font-medium"}>{s.label}</span>
            </span>
          );

          const link =
            s.href && !s.done ? (
              s.external ? (
                <a
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg px-1 py-1.5 hover:bg-white"
                >
                  {body}
                </a>
              ) : (
                <Link href={s.href} className="block rounded-lg px-1 py-1.5 hover:bg-white">
                  {body}
                </Link>
              )
            ) : (
              <span className="block px-1 py-1.5">{body}</span>
            );

          return (
            <li key={s.key} className="flex items-center justify-between gap-2">
              {link}
              {/* The tick, and the way back out of it. Untickable on purpose:
                  a checklist you cannot correct starts lying the first time
                  somebody mis-clicks. */}
              {canEdit && s.selfAsserted && (
                <form action={setOnboardingStepAction} className="shrink-0">
                  <input type="hidden" name="key" value={s.key} />
                  <input type="hidden" name="done" value={s.done ? "false" : "true"} />
                  <button className="rounded-full border border-brand-ink/15 bg-white px-2.5 py-1 text-[0.7rem] font-semibold text-brand-ink/60 hover:bg-brand-surface">
                    {s.done ? "Undo" : "Mark done"}
                  </button>
                </form>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
