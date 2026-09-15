"use client";

import { useActionState, useState } from "react";
import {
  createAdjustmentAction,
  markStatementPaidAction,
  runStatementsAction,
  savePassthroughAction,
  type BillingState,
} from "@/server/hq/billing-actions";

const idle: BillingState = { status: "idle" };

function Feedback({ state }: { state: BillingState }) {
  if (state.status === "idle") return null;
  return (
    <p className={`mt-2 text-xs ${state.status === "error" ? "text-guava" : "text-brand-primary"}`}>
      {state.message}
    </p>
  );
}

export function RunStatements({
  month,
  eligible,
  alreadyFrozen,
}: {
  month: string;
  eligible: number;
  alreadyFrozen: number;
}) {
  const [state, formAction, pending] = useActionState(runStatementsAction, idle);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="month" value={month} />
      <button
        disabled={pending}
        className="rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        {pending ? "Closing…" : `Close ${month} now`}
      </button>
      <span className="text-xs text-brand-ink/50">
        {eligible} operator{eligible === 1 ? "" : "s"}
        {alreadyFrozen > 0 && ` · ${alreadyFrozen} already closed`}
      </span>
      <Feedback state={state} />
    </form>
  );
}

export function MarkPaid({
  id,
  direction,
  paid,
}: {
  id: string;
  direction: "payout" | "invoice";
  paid: boolean;
}) {
  const [state, formAction, pending] = useActionState(markStatementPaidAction, idle);
  const [open, setOpen] = useState(false);

  if (paid) {
    return (
      <form action={formAction} className="inline">
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="unpay" value="yes" />
        <button
          disabled={pending}
          className="text-xs font-semibold text-brand-ink/40 underline disabled:opacity-40"
        >
          {pending ? "…" : "undo"}
        </button>
        <Feedback state={state} />
      </form>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-full border border-brand-ink/15 px-3 py-1 text-xs font-semibold hover:bg-brand-surface"
      >
        {direction === "payout" ? "Mark sent" : "Mark paid"}
      </button>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-1.5">
      <input type="hidden" name="id" value={id} />
      <label className="text-[0.65rem] font-semibold text-brand-ink/60">
        Reference
        <input
          name="reference"
          required
          placeholder="Bank ref / GCash no."
          className="mt-0.5 block min-h-[32px] w-36 rounded-lg border border-brand-ink/15 px-2 text-xs"
        />
      </label>
      <label className="text-[0.65rem] font-semibold text-brand-ink/60">
        Date
        <input
          type="date"
          name="paidOn"
          className="mt-0.5 block min-h-[32px] rounded-lg border border-brand-ink/15 px-2 text-xs"
        />
      </label>
      <button
        disabled={pending}
        className="min-h-[32px] rounded-full bg-brand-primary px-3 text-xs font-semibold text-white disabled:opacity-40"
      >
        {pending ? "…" : "Save"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

/**
 * A credit, debit, refund or waiver.
 *
 * TYPED CONFIRMATION OF THE AMOUNT, re-checked server-side. This is money
 * leaving CANVEXIA's pocket on somebody's say-so, and the brief asks for a
 * typed confirmation on exactly this kind of act. The disabled button is a
 * convenience; `createAdjustmentAction` is the control.
 */
export function NewAdjustment({ partners }: { partners: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(createAdjustmentAction, idle);
  const [amount, setAmount] = useState("");
  const [confirm, setConfirm] = useState("");
  const [kind, setKind] = useState("credit");
  const [reason, setReason] = useState("");

  const norm = (s: string) => s.replace(/[,₱\s]/g, "");
  const matches = norm(amount) !== "" && norm(amount) === norm(confirm);

  const EXPLAIN: Record<string, string> = {
    credit: "Money to the partner. Theirs in full — CANVEXIA's side is zero.",
    debit: "Money back from the partner. Every figure on the row is negative.",
    refund: "A settlement reversed, split at the partner's rate the way the original was.",
    waiver: "A charge written off. Recorded as money to the partner so the statement balances.",
  };

  return (
    <form action={formAction} className="rounded-tile border border-guava/25 bg-guava/[0.03] p-5">
      <h2 className="font-heading text-lg font-bold">Adjust a ledger</h2>
      <p className="mt-1 text-sm text-brand-ink/60">
        Written as a new ledger row, never an edit — the ledger is append-only, which is what
        lets a past month recompute to the same numbers. It lands in the month it occurred in.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-brand-ink/70">
          Partner
          <select
            name="partnerId"
            required
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          >
            <option value="">Pick a partner</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-xs font-semibold text-brand-ink/70">
          Kind
          <select
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          >
            <option value="credit">Credit</option>
            <option value="debit">Debit</option>
            <option value="refund">Refund</option>
            <option value="waiver">Waiver</option>
          </select>
          <span className="mt-1 block font-normal text-brand-ink/45">{EXPLAIN[kind]}</span>
        </label>

        <label className="block text-xs font-semibold text-brand-ink/70">
          Amount (pesos)
          <input
            name="amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          />
        </label>

        <label className="block text-xs font-semibold text-brand-ink/70">
          Type it again to confirm
          <input
            name="confirm"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            inputMode="decimal"
            autoComplete="off"
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          />
        </label>

        <label className="block text-xs font-semibold text-brand-ink/70">
          Merchant (optional)
          <input
            name="merchantId"
            placeholder="Merchant id, if this is about one"
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          />
        </label>

        <label className="block text-xs font-semibold text-brand-ink/70">
          Occurred on
          <input
            type="date"
            name="occurredOn"
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          />
          <span className="mt-1 block font-normal text-brand-ink/45">
            Blank means today. This decides which month it lands in.
          </span>
        </label>

        <label className="block text-xs font-semibold text-brand-ink/70 sm:col-span-2">
          Why
          <input
            name="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Shown on the ledger and in the audit log"
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          />
        </label>
      </div>

      <button
        disabled={pending || !matches || reason.trim().length < 4}
        className="mt-4 rounded-full bg-guava px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
      >
        {pending ? "Recording…" : "Record it"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function PassthroughForm({
  channel,
  unitCostCentavos,
  marginPct,
  note,
}: {
  channel: string;
  unitCostCentavos: number;
  marginPct: number;
  note: string | null;
}) {
  const [state, formAction, pending] = useActionState(savePassthroughAction, idle);
  const [cost, setCost] = useState(String(unitCostCentavos));
  const [margin, setMargin] = useState(String(marginPct));

  const perUnit = Number(cost) / 1000;
  const charged = perUnit * (1 + Number(margin) / 100);

  return (
    <form action={formAction} className="rounded-tile border border-brand-ink/10 bg-white p-5">
      <input type="hidden" name="channel" value={channel} />
      <h3 className="font-heading text-lg font-bold uppercase">{channel}</h3>
      {note && <p className="mt-1 text-xs text-brand-accent">{note}</p>}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-brand-ink/70">
          Cost, centavos per 1,000
          <input
            name="unitCostCentavos"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            inputMode="numeric"
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          />
          {/* Per 1,000 because a single SMS costs well under a peso and an
              integer per-unit cost would round every message to 0 or 1. */}
          <span className="mt-1 block font-normal text-brand-ink/45">
            ₱{(perUnit / 100).toFixed(4)} each
          </span>
        </label>
        <label className="block text-xs font-semibold text-brand-ink/70">
          Margin %
          <input
            name="marginPct"
            value={margin}
            onChange={(e) => setMargin(e.target.value)}
            inputMode="numeric"
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          />
          <span className="mt-1 block font-normal text-brand-ink/45">
            Charged ₱{(charged / 100).toFixed(4)} each
          </span>
        </label>
      </div>

      <button
        disabled={pending}
        className="mt-3 rounded-full border border-brand-ink/15 px-4 py-2 text-sm font-semibold disabled:opacity-40"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      <Feedback state={state} />
    </form>
  );
}
