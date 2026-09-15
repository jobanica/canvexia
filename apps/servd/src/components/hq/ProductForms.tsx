"use client";

import { useActionState, useState } from "react";
import {
  saveProductAction,
  setPlanFloorAction,
  toggleFlagAction,
  type ProductState,
} from "@/server/hq/products-actions";

const idle: ProductState = { status: "idle" };

function Feedback({ state }: { state: ProductState }) {
  if (state.status === "idle" || state.status === "confirm") return null;
  return (
    <p className={`mt-2 text-xs ${state.status === "error" ? "text-guava" : "text-brand-primary"}`}>
      {state.message}
    </p>
  );
}

export function ProductForm({
  id,
  name,
  provisionable,
  status,
  trainingUrl,
  demoAccountRef,
  defaultEnabled,
  merchants,
}: {
  id: string;
  name: string;
  provisionable: boolean;
  status: string;
  trainingUrl: string | null;
  demoAccountRef: string | null;
  defaultEnabled: boolean;
  merchants: number;
}) {
  const [state, formAction, pending] = useActionState(saveProductAction, idle);

  return (
    <form action={formAction} className="rounded-tile border border-brand-ink/10 bg-white p-5">
      <input type="hidden" name="productId" value={id} />
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-heading text-lg font-bold">{name}</h2>
        <span className="text-xs tabular-nums text-brand-ink/45">
          {merchants} merchant{merchants === 1 ? "" : "s"}
        </span>
      </div>

      {/* The registry decides this, not the form. Saying so beats a status
          dropdown that appears to control something it cannot. */}
      <p className={`mt-1 text-xs ${provisionable ? "text-brand-ink/50" : "text-brand-accent"}`}>
        {provisionable
          ? "Merchants can be provisioned into this product."
          : "No adapter yet — a merchant cannot be opened in this product whatever the status says."}
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-brand-ink/70">
          Status
          <select
            name="status"
            defaultValue={status}
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          >
            <option value="live">Live</option>
            <option value="beta">Beta</option>
            <option value="coming">Coming soon</option>
          </select>
        </label>
        <label className="flex items-end gap-2 pb-2 text-xs font-semibold text-brand-ink/70">
          <input type="checkbox" name="defaultEnabled" defaultChecked={defaultEnabled} />
          Enabled for new partners by default
        </label>
        <label className="block text-xs font-semibold text-brand-ink/70 sm:col-span-2">
          Training URL
          <input
            name="trainingUrl"
            defaultValue={trainingUrl ?? ""}
            placeholder="https://…"
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          />
        </label>
        <label className="block text-xs font-semibold text-brand-ink/70 sm:col-span-2">
          Demo account reference
          <input
            name="demoAccountRef"
            defaultValue={demoAccountRef ?? ""}
            placeholder="1Password → CANVEXIA → Resceta demo"
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          />
          {/* Said on the screen, not just in the column comment: a partner can
              read this field. */}
          <span className="mt-1 block font-normal text-brand-accent">
            Where the credential lives — never the credential. Partners can read this.
          </span>
        </label>
      </div>

      <button
        disabled={pending}
        className="mt-3 rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        {pending ? "Saving…" : "Save"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

/**
 * Raise or lower a plan's floor.
 *
 * Two steps, because it re-prices other people's businesses. The first submit
 * lists who would be under the proposed floor and writes nothing.
 */
export function PlanFloorForm({
  planId,
  planName,
  priceFloor,
  priceMonthly,
}: {
  planId: string;
  planName: string;
  priceFloor: number;
  priceMonthly: number;
}) {
  const [state, formAction, pending] = useActionState(setPlanFloorAction, idle);
  const [floor, setFloor] = useState(String(Math.round(priceFloor / 100)));

  return (
    <form action={formAction} className="mt-3 border-t border-brand-ink/10 pt-3">
      <input type="hidden" name="planId" value={planId} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-brand-ink/70">
          Floor (pesos)
          <input
            name="floor"
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
            inputMode="numeric"
            className="mt-1 block min-h-[38px] w-28 rounded-lg border border-brand-ink/15 px-3 text-sm"
          />
        </label>
        <button
          disabled={pending}
          className="min-h-[38px] rounded-full border border-brand-ink/15 px-4 text-sm font-semibold disabled:opacity-40"
        >
          {pending ? "…" : "Check"}
        </button>
        {state.status === "confirm" && state.planId === planId && (
          <button
            name="confirm"
            value="yes"
            disabled={pending}
            className="min-h-[38px] rounded-full bg-guava px-4 text-sm font-semibold text-white disabled:opacity-40"
          >
            Set it anyway
          </button>
        )}
      </div>

      <p className="mt-1 text-xs text-brand-ink/45">
        Catalogue price ₱{Math.round(priceMonthly / 100).toLocaleString("en-PH")}. A floor above it
        affects every partner without their own price, not just the ones who set one.
      </p>

      {state.status === "confirm" && state.planId === planId && (
        <div className="mt-2 rounded-lg border border-guava/25 bg-guava/[0.04] p-3 text-xs">
          <p className="font-semibold text-guava">{state.message}</p>
          {state.below.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-brand-ink/60">
              {state.below.slice(0, 12).map((b) => (
                <li key={b.partnerId}>
                  {b.partnerName} — ₱{Math.round(b.priceMonthly / 100).toLocaleString("en-PH")}
                </li>
              ))}
              {state.below.length > 12 && <li>…and {state.below.length - 12} more.</li>}
            </ul>
          )}
          <p className="mt-1 text-brand-ink/50">
            Existing prices are not changed — the floor refuses new ones below it. {planName} keeps
            working for everyone already on it.
          </p>
        </div>
      )}
      <Feedback state={state} />
    </form>
  );
}

export function FlagForm({ productId }: { productId: string }) {
  const [state, formAction, pending] = useActionState(toggleFlagAction, idle);
  return (
    <form action={formAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-brand-ink/10 pt-3">
      <input type="hidden" name="productId" value={productId} />
      <label className="text-xs font-semibold text-brand-ink/70">
        Flag key
        <input
          name="key"
          placeholder="new_checkout"
          className="mt-1 block min-h-[38px] rounded-lg border border-brand-ink/15 px-3 font-mono text-xs"
        />
      </label>
      <label className="flex items-center gap-1.5 pb-2 text-xs font-semibold text-brand-ink/70">
        <input type="checkbox" name="enabled" />
        On
      </label>
      <button
        disabled={pending}
        className="min-h-[38px] rounded-full border border-brand-ink/15 px-4 text-sm font-semibold disabled:opacity-40"
      >
        {pending ? "…" : "Set"}
      </button>
      <Feedback state={state} />
    </form>
  );
}
