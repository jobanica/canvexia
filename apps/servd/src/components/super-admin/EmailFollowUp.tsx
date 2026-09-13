"use client";

import { useActionState, useEffect, useState } from "react";
import {
  saveTemplate,
  resetTemplate,
  toggleStep,
  setFollowUpEnabled,
  runFollowUpsNow,
  type FollowUpActionState,
} from "@/server/email/followup-actions";
import { BUTTON_TAG } from "@/lib/email/render";
import { SubmitButton } from "@/components/admin/SubmitButton";

/**
 * The acquisition sequence, as the founder sees it.
 *
 * Two tracks, one job each: A gets someone back to finish building, B gets a
 * finished preview paid for. Everyone who types an email on /build joins A
 * automatically; seeing their own preview moves them to B; paying stops
 * everything. Nobody who has activated is ever emailed by this.
 */

export interface FollowUpStepView {
  key: string;
  track: "A" | "B";
  timing: string;
  goal: string;
  subject: string;
  body: string;
  enabled: boolean;
  sent: number;
  scheduled: number;
  skipped: number;
  failed: number;
  influenced: number;
  credited: number;
}

export interface FollowUpTotals {
  leads: number;
  reachedPreview: number;
  activated: number;
  attributed: number;
  dueNow: number;
}

export function EmailFollowUp({
  enabled,
  steps,
  totals,
  unavailable,
}: {
  enabled: boolean;
  steps: FollowUpStepView[];
  totals: FollowUpTotals;
  unavailable: boolean;
}) {
  const [runState, runAction] = useActionState<FollowUpActionState, FormData>(
    runFollowUpsNow,
    null,
  );
  const [editing, setEditing] = useState<string | null>(null);

  const trackA = steps.filter((s) => s.track === "A");
  const trackB = steps.filter((s) => s.track === "B");

  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-bold">Follow-up automation</h2>
          <p className="max-w-xl text-sm text-plum-ink/50">
            Everyone who types an email on the builder joins automatically. Stops the moment
            they activate — nobody who has paid is ever emailed by this.
          </p>
        </div>
        <form action={setFollowUpEnabled}>
          <input type="hidden" name="enabled" value={enabled ? "off" : "on"} />
          <button
            className={`rounded-full px-4 py-2 text-sm font-bold ${
              enabled ? "bg-green-600 text-white" : "border border-plum-ink/15 text-plum-ink/60"
            }`}
          >
            {enabled ? "● Running" : "Paused"}
          </button>
        </form>
      </div>

      {unavailable && (
        <p className="mt-3 rounded-lg bg-mango/10 px-3 py-2 text-sm text-plum-ink/70">
          The follow-up tables aren&apos;t there yet. Run{" "}
          <span className="font-mono text-xs">prisma/manual/add-acquisition-followup.sql</span> in
          Supabase — until then nothing is scheduled and nothing sends.
        </p>
      )}

      {/* The funnel this whole sequence is trying to move. */}
      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Leads" value={totals.leads} hint="gave an email" />
        <Stat label="Saw preview" value={totals.reachedPreview} hint="moved to track B" />
        <Stat label="Activated" value={totals.activated} hint="paid ₱499" />
        <Stat label="Due now" value={totals.dueNow} hint="next run sends these" />
      </dl>

      <Track
        title="Track A · haven't finished a preview"
        blurb="The ask is “come back and finish”, never “pay”. They haven't seen their own restaurant yet, so money is the wrong question."
        steps={trackA}
        editing={editing}
        setEditing={setEditing}
      />
      <Track
        title="Track B · preview built, not paid"
        blurb="They've seen it work. Now the ask is activation. Joining B cancels whatever is left of A."
        steps={trackB}
        editing={editing}
        setEditing={setEditing}
      />

      <form action={runAction} className="mt-4 flex flex-wrap items-center gap-3 border-t border-plum-ink/10 pt-4">
        <SubmitButton pendingLabel="Sending…">Send what&apos;s due now</SubmitButton>
        <span className="text-xs text-plum-ink/45">
          Otherwise it runs by itself every 15 minutes.
        </span>
        {runState?.error && <span className="text-sm text-guava">{runState.error}</span>}
        {runState?.run && (
          <span className="text-sm text-green-700">
            {runState.run.sent} sent · {runState.run.skipped} skipped
            {runState.run.failed > 0 && ` · ${runState.run.failed} failed`}
          </span>
        )}
      </form>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-lg bg-cream/60 px-3 py-2">
      <dt className="text-xs font-semibold text-plum-ink/50">{label}</dt>
      <dd className="font-heading text-xl font-bold">{value}</dd>
      <p className="text-[11px] text-plum-ink/40">{hint}</p>
    </div>
  );
}

function Track({
  title,
  blurb,
  steps,
  editing,
  setEditing,
}: {
  title: string;
  blurb: string;
  steps: FollowUpStepView[];
  editing: string | null;
  setEditing: (k: string | null) => void;
}) {
  return (
    <section className="mt-5">
      <h3 className="font-heading text-sm font-bold">{title}</h3>
      <p className="max-w-xl text-xs text-plum-ink/45">{blurb}</p>
      <ol className="mt-2 space-y-2">
        {steps.map((s) => (
          <li key={s.key} className="rounded-lg border border-plum-ink/10">
            {editing === s.key ? (
              <StepEditor step={s} onDone={() => setEditing(null)} />
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
                <span className="rounded-full bg-brand-primary/10 px-2.5 py-1 text-xs font-bold text-brand-primary">
                  {s.timing}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate text-sm font-semibold ${
                    s.enabled ? "" : "text-plum-ink/40 line-through"
                  }`}
                  title={s.goal}
                >
                  {s.subject}
                </span>
                <span className="text-xs text-plum-ink/40">{s.sent} sent</span>
                {s.credited > 0 && (
                  <span
                    className="rounded-full bg-green-600/10 px-2 py-0.5 text-xs font-semibold text-green-700"
                    title="Activations where this was the last email before they paid"
                  >
                    {s.credited} activated
                  </span>
                )}
                {s.failed > 0 && (
                  <span className="text-xs font-semibold text-guava">{s.failed} failed</span>
                )}
                <button
                  type="button"
                  onClick={() => setEditing(s.key)}
                  className="text-xs font-semibold text-plum-ink/60 hover:text-brand-primary"
                >
                  Edit
                </button>
                <form action={toggleStep}>
                  <input type="hidden" name="stepKey" value={s.key} />
                  <input type="hidden" name="enabled" value={s.enabled ? "off" : "on"} />
                  <button className="text-xs font-semibold text-plum-ink/60 hover:text-brand-primary">
                    {s.enabled ? "Pause" : "Resume"}
                  </button>
                </form>
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}

function StepEditor({ step, onDone }: { step: FollowUpStepView; onDone: () => void }) {
  const [state, action] = useActionState<FollowUpActionState, FormData>(saveTemplate, null);
  // Close on a successful save — in an effect, not during render, because
  // onDone sets state on the parent.
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state?.ok, onDone]);

  return (
    <form action={action} className="space-y-2 p-3">
      <input type="hidden" name="stepKey" value={step.key} />
      <div className="flex flex-wrap items-center gap-2 text-xs text-plum-ink/50">
        <span className="rounded-full bg-brand-primary/10 px-2.5 py-1 font-bold text-brand-primary">
          {step.timing}
        </span>
        <span>{step.goal}</span>
        <span className="font-mono text-[11px] text-plum-ink/35">{step.key}</span>
      </div>
      <input
        name="subject"
        defaultValue={step.subject}
        placeholder="Subject"
        className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm font-semibold"
      />
      <textarea
        name="body"
        defaultValue={step.body}
        rows={8}
        className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
      />
      <p className="text-[11px] text-plum-ink/45">
        <span className="font-mono">{"{{name}}"}</span> restaurant ·{" "}
        <span className="font-mono">{"{{build}}"}</span> back to the builder ·{" "}
        <span className="font-mono">{"{{preview}}"}</span> their preview ·{" "}
        <span className="font-mono">{BUTTON_TAG}</span> activate button. Unsubscribe is added
        automatically.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>Save</SubmitButton>
        <button
          type="button"
          onClick={onDone}
          className="text-xs font-semibold text-plum-ink/50 hover:text-plum-ink"
        >
          Cancel
        </button>
        {state?.error && <span className="text-sm text-guava">{state.error}</span>}
        <span className="flex-1" />
        {/* formAction, not a second form — forms can't nest. */}
        <button
          type="submit"
          formAction={resetTemplate}
          className="text-xs font-semibold text-plum-ink/50 hover:text-brand-primary"
        >
          Reset to original
        </button>
      </div>
    </form>
  );
}
