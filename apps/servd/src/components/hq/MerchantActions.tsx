"use client";

import { useActionState, useState } from "react";
import {
  flagNationalAccountAction,
  forcePlanChangeAction,
  reassignMerchantAction,
  type MerchantState,
} from "@/server/hq/merchants-actions";

const idle: MerchantState = { status: "idle" };

function Feedback({ state }: { state: MerchantState }) {
  if (state.status === "idle") return null;
  return (
    <p className={`mt-2 text-xs ${state.status === "error" ? "text-guava" : "text-brand-primary"}`}>
      {state.message}
    </p>
  );
}

export function ReassignMerchant({
  merchantKey,
  merchantName,
  partners,
}: {
  merchantKey: string;
  merchantName: string;
  partners: { id: string; name: string; isHouse: boolean }[];
}) {
  const [state, formAction, pending] = useActionState(reassignMerchantAction, idle);
  const [reason, setReason] = useState("");

  return (
    <form action={formAction} className="rounded-tile border border-brand-ink/10 bg-white p-5">
      <input type="hidden" name="key" value={merchantKey} />
      <h2 className="font-heading text-lg font-bold">Move {merchantName}</h2>
      <p className="mt-1 text-xs text-brand-ink/55">
        The whole move is one transaction. The outgoing partner loses access immediately and stops
        being paid for it from the next settlement.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-brand-ink/70">
          To
          <select
            name="targetPartnerId"
            required
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          >
            <option value="">Pick a partner</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.isHouse ? " (house)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold text-brand-ink/70">
          Why
          <input
            name="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          />
        </label>
      </div>

      <button
        disabled={pending || reason.trim().length < 4}
        className="mt-3 rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        {pending ? "Moving…" : "Move"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function FlagNational({
  merchantKey,
  merchantName,
  houseName,
}: {
  merchantKey: string;
  merchantName: string;
  houseName: string | null;
}) {
  const [state, formAction, pending] = useActionState(flagNationalAccountAction, idle);
  const [reason, setReason] = useState("");

  if (!houseName) {
    return (
      <p className="rounded-tile border border-dashed border-brand-ink/15 p-4 text-xs text-brand-ink/50">
        No house partner is set, so there is nothing to move a national account to.
      </p>
    );
  }

  return (
    <form action={formAction} className="rounded-tile border border-brand-ink/10 bg-white p-5">
      <input type="hidden" name="key" value={merchantKey} />
      <h2 className="font-heading text-lg font-bold">Flag as a national account</h2>
      <p className="mt-1 text-xs text-brand-ink/55">
        Moves {merchantName} to {houseName} and records whoever introduced it, so a referral line
        can go on their statement.
      </p>
      {/* The gap, said on the screen rather than only in the code: the column
          lives on the PARTNER, so it records one referrer for the house
          account rather than one per merchant. */}
      <p className="mt-1 text-xs text-brand-accent">
        The house account records one referrer in total, not one per merchant. A second national
        account keeps the first referrer rather than overwriting their claim.
      </p>
      <label className="mt-3 block text-xs font-semibold text-brand-ink/70">
        Why
        <input
          name="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
        />
      </label>
      <button
        disabled={pending || reason.trim().length < 4}
        className="mt-3 rounded-full border border-brand-ink/15 px-4 py-2 text-sm font-semibold disabled:opacity-40"
      >
        {pending ? "Moving…" : "Flag it"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function ForcePlan({
  merchantKey,
  merchantName,
  currentPlan,
  plans,
}: {
  merchantKey: string;
  merchantName: string;
  currentPlan: string | null;
  plans: { id: string; name: string; priceMonthly: number }[];
}) {
  const [state, formAction, pending] = useActionState(forcePlanChangeAction, idle);
  const [reason, setReason] = useState("");

  return (
    <form action={formAction} className="rounded-tile border border-guava/25 bg-guava/[0.03] p-5">
      <input type="hidden" name="key" value={merchantKey} />
      <h2 className="font-heading text-lg font-bold">Force a plan change</h2>
      <p className="mt-1 text-xs text-brand-ink/55">
        {merchantName} is on {currentPlan ?? "no plan"}. This changes the PLAN, not the price — a
        partner&rsquo;s own price for it is theirs to set above the floor.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-brand-ink/70">
          Plan
          <select
            name="planId"
            required
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          >
            <option value="">Pick a plan</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — ₱{Math.round(p.priceMonthly / 100).toLocaleString("en-PH")}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold text-brand-ink/70">
          Why
          <input
            name="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          />
        </label>
      </div>

      <button
        disabled={pending || reason.trim().length < 4}
        className="mt-3 rounded-full bg-guava px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        {pending ? "Changing…" : "Change the plan"}
      </button>
      <Feedback state={state} />
    </form>
  );
}
