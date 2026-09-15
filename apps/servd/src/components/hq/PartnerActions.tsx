"use client";

import { useActionState, useState } from "react";
import {
  extendExclusivityAction,
  revokeExclusivityAction,
  setPartnerStatusAction,
  viewAsPartnerAction,
  type HqPartnerState,
} from "@/server/hq/partners-actions";

const idle: HqPartnerState = { status: "idle" };

function Feedback({ state }: { state: HqPartnerState }) {
  if (state.status === "idle") return null;
  return (
    <p
      role="status"
      className={`mt-2 text-xs ${state.status === "error" ? "text-guava" : "text-brand-primary"}`}
    >
      {state.message}
    </p>
  );
}

/**
 * A destructive action behind a typed confirmation.
 *
 * The typing is NOT the control — `partners-actions.ts` re-checks the name
 * server-side, because a client-side dialog is a suggestion. What this is for
 * is making somebody read the name of the partner they are about to cut off.
 *
 * The button stays disabled until the name matches, which is the one thing a
 * client can usefully do here: refuse to submit a mistake before it becomes a
 * round trip.
 */
function DangerForm({
  partnerId,
  partnerName,
  action,
  hidden,
  label,
  verb,
  blurb,
  reasonLabel,
}: {
  partnerId: string;
  partnerName: string;
  action: typeof setPartnerStatusAction;
  hidden?: Record<string, string>;
  label: string;
  verb: string;
  blurb: string;
  reasonLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, idle);
  const [typed, setTyped] = useState("");
  const [reason, setReason] = useState("");
  const matches = typed.trim().toLowerCase() === partnerName.trim().toLowerCase();

  return (
    <form action={formAction} className="rounded-xl border border-guava/25 bg-guava/[0.03] p-4">
      <input type="hidden" name="partnerId" value={partnerId} />
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}

      <p className="text-sm font-semibold text-guava">{label}</p>
      <p className="mt-1 text-xs text-brand-ink/60">{blurb}</p>

      <label className="mt-3 block text-xs font-semibold text-brand-ink/70">
        {reasonLabel}
        <input
          name="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          placeholder="Recorded in the audit log"
        />
      </label>

      <label className="mt-2 block text-xs font-semibold text-brand-ink/70">
        Type <span className="font-mono text-brand-ink">{partnerName}</span> to confirm
        <input
          name="confirm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
        />
      </label>

      <button
        disabled={pending || !matches || reason.trim().length < 4}
        className="mt-3 rounded-full bg-guava px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        {pending ? "Working…" : verb}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function SuspendPartner({ id, name }: { id: string; name: string }) {
  return (
    <DangerForm
      partnerId={id}
      partnerName={name}
      action={setPartnerStatusAction}
      hidden={{ status: "suspended" }}
      label="Suspend this partner"
      verb="Suspend"
      blurb="They lose access to the portal immediately. Their merchants keep running — suspending a partner does not switch off a restaurant's tills."
      reasonLabel="Why"
    />
  );
}

export function RevokeExclusivity({ id, name }: { id: string; name: string }) {
  return (
    <DangerForm
      partnerId={id}
      partnerName={name}
      action={revokeExclusivityAction}
      label="Revoke exclusivity"
      verb="Revoke and release the territory"
      blurb="Their territory goes back on the market and the assignment is closed. The partner keeps their account and their merchants."
      reasonLabel="Why (the partner is told this)"
    />
  );
}

export function ApprovePartner({ id, name }: { id: string; name: string }) {
  const [state, formAction, pending] = useActionState(setPartnerStatusAction, idle);
  return (
    <form action={formAction} className="rounded-xl border border-brand-ink/12 bg-white p-4">
      <input type="hidden" name="partnerId" value={id} />
      <input type="hidden" name="status" value="approved" />
      <p className="text-sm font-semibold">Activate {name}</p>
      <p className="mt-1 text-xs text-brand-ink/60">
        They can sign in and open merchant accounts straight away.
      </p>
      <button
        disabled={pending}
        className="mt-3 rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        {pending ? "Working…" : "Activate"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function ExtendExclusivity({ id, current }: { id: string; current: string | null }) {
  const [state, formAction, pending] = useActionState(extendExclusivityAction, idle);
  return (
    <form action={formAction} className="rounded-xl border border-brand-ink/12 bg-white p-4">
      <input type="hidden" name="partnerId" value={id} />
      <p className="text-sm font-semibold">Extend exclusivity</p>
      <p className="mt-1 text-xs text-brand-ink/60">
        {current ? `Currently runs to ${current}.` : "No expiry is set."}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="date"
          name="until"
          className="min-h-[40px] rounded-lg border border-brand-ink/15 px-3 text-sm"
        />
        <button
          disabled={pending}
          className="rounded-full border border-brand-ink/15 px-4 py-2 text-sm font-semibold hover:bg-brand-surface disabled:opacity-40"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

/**
 * "View as partner".
 *
 * The reason box is not a formality: it is the field that answers "why was HQ
 * inside Cebu's console on the 14th" when somebody asks. The action refuses
 * without it.
 */
export function ViewAsPartner({ id, name }: { id: string; name: string }) {
  const [state, formAction, pending] = useActionState(viewAsPartnerAction, idle);
  const [reason, setReason] = useState("");

  return (
    <form action={formAction} className="rounded-xl border border-brand-ink/12 bg-white p-4">
      <input type="hidden" name="partnerId" value={id} />
      <p className="text-sm font-semibold">View {name}&rsquo;s portal</p>
      <p className="mt-1 text-xs text-brand-ink/60">
        A <strong>read-only</strong> session for 30 minutes. {name} sees a banner saying you are
        there, and the start, the end and the duration are all in the audit log.
      </p>
      <label className="mt-3 block text-xs font-semibold text-brand-ink/70">
        Why
        <input
          name="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. reproducing the pricing bug they reported"
          className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
        />
      </label>
      <button
        disabled={pending || reason.trim().length < 4}
        className="mt-3 rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        {pending ? "Opening…" : "Open read-only session"}
      </button>
      <Feedback state={state} />
    </form>
  );
}
