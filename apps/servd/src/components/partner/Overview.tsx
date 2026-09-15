import Link from "next/link";
import type { MilestoneProgress } from "@servd/core";
import type { AttentionItem } from "@/lib/partners/attention";
import type { PartnerOverview } from "@/server/partners/overview";
import type { OnboardingStep } from "@/server/partners/overview";

/** "₱20,979" from centavos. Whole pesos — a dashboard is not a receipt. */
export function peso(centavos: number): string {
  return `₱${Math.round(centavos / 100).toLocaleString("en-PH")}`;
}

export function StatCards({ o }: { o: PartnerOverview }) {
  const cards = [
    { label: "Paying merchants", value: String(o.payingCount), note: `${o.merchants.length} total` },
    { label: "MRR", value: peso(o.mrrCentavos), note: "What merchants pay, per month" },
    { label: "Your share", value: peso(o.partnerShareCentavos), note: "This month, so far" },
    {
      label: o.settlementDirection === "payout" ? "Projected payout" : "HQ invoice",
      value: peso(o.settlementDirection === "payout" ? o.partnerShareCentavos : o.hqShareCentavos),
      // partner_collects means the money never passes through HQ, so what is
      // owed flows the other way. Labelling both "payout" would tell half of
      // all partners they are owed money they actually owe.
      note:
        o.settlementDirection === "payout"
          ? "HQ collects and pays you"
          : "You collect; HQ invoices its share",
    },
  ];

  return (
    <div className="grid gap-px overflow-hidden rounded-tile bg-brand-ink/10 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-ink/45">{c.label}</p>
          <p className="mt-2 font-heading text-2xl font-bold tabular-nums">{c.value}</p>
          <p className="mt-1 text-xs text-brand-ink/50">{c.note}</p>
        </div>
      ))}
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

export function AttentionList({ items }: { items: AttentionItem[] }) {
  return (
    <div className="rounded-tile border border-brand-ink/10 bg-white p-5">
      <h2 className="font-heading text-lg font-bold">Needs you today</h2>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-brand-ink/55">
          Nothing needs attention. Go sign someone up.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-brand-ink/10">
          {items.map((i, idx) => (
            <li key={`${i.kind}-${i.href}-${idx}`}>
              <Link href={i.href} className="flex items-start gap-3 py-3 hover:bg-brand-surface">
                <span className="mt-0.5 shrink-0 rounded-full bg-brand-ink/[0.06] px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-brand-ink/60">
                  {KIND_LABEL[i.kind]}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{i.title}</span>
                  <span className="block text-xs text-brand-ink/55">{i.detail}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function OnboardingChecklist({ steps }: { steps: OnboardingStep[] }) {
  const done = steps.filter((s) => s.done).length;
  if (done === steps.length) return null;

  return (
    <div className="rounded-tile border border-brand-primary/25 bg-brand-primary/[0.04] p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-heading text-lg font-bold">Get set up</h2>
        <span className="text-xs tabular-nums text-brand-ink/50">
          {done} of {steps.length}
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
          return (
            <li key={s.key}>
              {s.href && !s.done ? (
                <Link href={s.href} className="block rounded-lg px-1 py-1.5 hover:bg-white">
                  {body}
                </Link>
              ) : (
                <span className="block px-1 py-1.5">{body}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
