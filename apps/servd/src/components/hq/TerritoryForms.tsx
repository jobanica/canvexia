"use client";

import { useActionState, useState } from "react";
import {
  assignTerritoryAction,
  importTerritoriesAction,
  mergeTerritoryAction,
  releaseTerritoryAction,
  saveTerritoryAction,
  splitTerritoryAction,
  type TerritoryState,
} from "@/server/hq/territories-actions";

const idle: TerritoryState = { status: "idle" };

const TIER_FEE: Record<string, number> = { small: 29000, mid: 49000, large: 79000, hq: 0 };

function Feedback({ state }: { state: TerritoryState }) {
  if (state.status === "idle" || state.status === "plan") return null;
  return (
    <p className={`mt-2 text-xs ${state.status === "error" ? "text-guava" : "text-brand-primary"}`}>
      {state.message}
    </p>
  );
}

/**
 * Add or edit a territory.
 *
 * THE TIER PROMPT the brief asks for is the checkbox: changing a tier without
 * it keeps whatever fee was there, which is almost never what somebody meant —
 * a city promoted from small to large is worth ₱79,000, not the ₱29,000 still
 * sitting in the field. It is checked by default when the tier changes, and
 * unticking it is the deliberate act.
 */
export function TerritoryForm({
  territory,
}: {
  territory?: {
    id: string;
    name: string;
    province: string;
    region: string;
    tier: string;
    licenseFee: number;
  };
}) {
  const [state, formAction, pending] = useActionState(saveTerritoryAction, idle);
  const [tier, setTier] = useState(territory?.tier ?? "small");
  const changedTier = !!territory && tier !== territory.tier;
  const [useTierFee, setUseTierFee] = useState(!territory);

  return (
    <form action={formAction} className="rounded-tile border border-brand-ink/10 bg-white p-5">
      {territory && <input type="hidden" name="id" value={territory.id} />}
      <h2 className="font-heading text-lg font-bold">
        {territory ? `Edit ${territory.name}` : "Add a territory"}
      </h2>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-brand-ink/70">
          Name
          <input
            name="name"
            required
            defaultValue={territory?.name}
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          />
        </label>
        <label className="block text-xs font-semibold text-brand-ink/70">
          Province
          <input
            name="province"
            defaultValue={territory?.province}
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          />
        </label>
        <label className="block text-xs font-semibold text-brand-ink/70">
          Region
          <input
            name="region"
            defaultValue={territory?.region}
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          />
        </label>
        <label className="block text-xs font-semibold text-brand-ink/70">
          Tier
          <select
            name="tier"
            value={tier}
            onChange={(e) => {
              setTier(e.target.value);
              // Default to the tier's own fee the moment the tier moves. The
              // old number is almost never right for the new tier.
              if (territory && e.target.value !== territory.tier) setUseTierFee(true);
            }}
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
          >
            <option value="small">Small — ₱29,000</option>
            <option value="mid">Mid — ₱49,000</option>
            <option value="large">Large — ₱79,000</option>
            <option value="hq">HQ — not for sale</option>
          </select>
        </label>
        <label className="block text-xs font-semibold text-brand-ink/70">
          Licence fee (pesos)
          <input
            name="licenseFee"
            type="number"
            min={0}
            disabled={useTierFee}
            defaultValue={territory?.licenseFee ?? TIER_FEE.small}
            className="mt-1 min-h-[40px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm disabled:bg-brand-surface disabled:text-brand-ink/40"
          />
        </label>
        <label className="flex items-end gap-2 pb-2 text-xs font-semibold text-brand-ink/70">
          <input
            type="checkbox"
            name="useTierFee"
            checked={useTierFee}
            onChange={(e) => setUseTierFee(e.target.checked)}
          />
          <span>
            Use the tier&rsquo;s fee (₱{(TIER_FEE[tier] ?? 0).toLocaleString("en-PH")})
            {changedTier && (
              <span className="mt-0.5 block font-normal text-brand-primary">
                You changed the tier — this is probably what you want.
              </span>
            )}
          </span>
        </label>
      </div>

      <button
        disabled={pending}
        className="mt-4 rounded-full bg-brand-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
      >
        {pending ? "Saving…" : territory ? "Save" : "Add"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function AssignTerritory({
  territoryId,
  territoryName,
  partners,
}: {
  territoryId: string;
  territoryName: string;
  partners: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(assignTerritoryAction, idle);
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="territoryId" value={territoryId} />
      <label className="text-xs font-semibold text-brand-ink/70">
        Assign {territoryName} to
        <select
          name="partnerId"
          className="mt-1 block min-h-[38px] rounded-lg border border-brand-ink/15 px-3 text-sm"
        >
          <option value="">Pick a partner</option>
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <button
        disabled={pending}
        className="min-h-[38px] rounded-full bg-brand-primary px-4 text-sm font-semibold text-white disabled:opacity-40"
      >
        {pending ? "…" : "Assign"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function ReleaseTerritory({ territoryId, holder }: { territoryId: string; holder: string }) {
  const [state, formAction, pending] = useActionState(releaseTerritoryAction, idle);
  const [reason, setReason] = useState("");
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="territoryId" value={territoryId} />
      <label className="min-w-0 flex-1 text-xs font-semibold text-brand-ink/70">
        Take back from {holder} — why
        <input
          name="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Recorded, and the partner may ask"
          className="mt-1 block min-h-[38px] w-full rounded-lg border border-brand-ink/15 px-3 text-sm"
        />
      </label>
      <button
        disabled={pending || reason.trim().length < 4}
        className="min-h-[38px] rounded-full border border-guava/40 px-4 text-sm font-semibold text-guava disabled:opacity-40"
      >
        {pending ? "…" : "Release"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function SplitTerritory({ parentId, parentName }: { parentId: string; parentName: string }) {
  const [state, formAction, pending] = useActionState(splitTerritoryAction, idle);
  return (
    <form action={formAction} className="rounded-xl border border-brand-ink/12 p-4">
      <input type="hidden" name="parentId" value={parentId} />
      <p className="text-sm font-semibold">Split {parentName} into districts</p>
      <p className="mt-1 text-xs text-brand-ink/55">
        One per line. The districts inherit {parentName}&rsquo;s tier and fee, and {parentName}{" "}
        itself stops being for sale — a city and its districts cannot both be licensed.
      </p>
      <textarea
        name="districts"
        rows={4}
        placeholder={"District 1\nDistrict 2"}
        className="mt-2 w-full rounded-lg border border-brand-ink/15 px-3 py-2 text-sm"
      />
      <button
        disabled={pending}
        className="mt-2 rounded-full border border-brand-ink/15 px-4 py-2 text-sm font-semibold disabled:opacity-40"
      >
        {pending ? "Splitting…" : "Split"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function MergeTerritory({
  parentId,
  parentName,
  childCount,
}: {
  parentId: string;
  parentName: string;
  childCount: number;
}) {
  const [state, formAction, pending] = useActionState(mergeTerritoryAction, idle);
  return (
    <form action={formAction} className="rounded-xl border border-brand-ink/12 p-4">
      <input type="hidden" name="parentId" value={parentId} />
      <p className="text-sm font-semibold">Merge {parentName} back</p>
      <p className="mt-1 text-xs text-brand-ink/55">
        Removes its {childCount} districts and makes {parentName} sellable again. A district
        somebody holds has to be released first — that is a decision, not tidying.
      </p>
      <button
        disabled={pending}
        className="mt-2 rounded-full border border-brand-ink/15 px-4 py-2 text-sm font-semibold disabled:opacity-40"
      >
        {pending ? "Merging…" : "Merge"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

/**
 * CSV import, in two steps.
 *
 * The first submit returns a PLAN and writes nothing. An import that silently
 * rewrote 143 rows because a column was misspelled is not recoverable from a
 * screen, and this is the reference data that decides who owns a city.
 */
export function ImportTerritories() {
  const [state, formAction, pending] = useActionState(importTerritoriesAction, idle);

  return (
    <form action={formAction} className="rounded-tile border border-brand-ink/10 bg-white p-5">
      <h2 className="font-heading text-lg font-bold">Import CSV</h2>
      <p className="mt-1 text-sm text-brand-ink/55">
        Matched on <code className="text-xs">slug</code>. Nothing is ever deleted — a row missing
        from your file means the file is partial, not that the city is gone.
      </p>

      <input
        type="file"
        name="file"
        accept=".csv,text/csv"
        className="mt-3 block w-full text-sm"
      />
      <textarea
        name="csv"
        rows={4}
        placeholder="…or paste CSV here"
        className="mt-2 w-full rounded-lg border border-brand-ink/15 px-3 py-2 font-mono text-xs"
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          disabled={pending}
          className="rounded-full border border-brand-ink/15 px-4 py-2 text-sm font-semibold disabled:opacity-40"
        >
          {pending ? "Reading…" : "Preview"}
        </button>
        {state.status === "plan" && state.plan.errors.length === 0 && (
          <button
            name="apply"
            value="yes"
            disabled={pending}
            className="rounded-full bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Apply
          </button>
        )}
      </div>

      {state.status === "plan" && (
        <div className="mt-3 rounded-lg border border-brand-ink/12 bg-brand-surface p-4 text-sm">
          <p className="font-semibold">{state.message}</p>
          {state.plan.errors.length > 0 ? (
            <ul className="mt-2 space-y-1 text-xs text-guava">
              {state.plan.errors.slice(0, 20).map((e, i) => (
                <li key={i}>
                  Line {e.line}: {e.message}
                </li>
              ))}
              {state.plan.errors.length > 20 && (
                <li>…and {state.plan.errors.length - 20} more.</li>
              )}
            </ul>
          ) : (
            <p className="mt-1 text-xs text-brand-ink/55">
              {state.plan.create.length > 0 &&
                `Adding: ${state.plan.create.map((c) => c.name).slice(0, 8).join(", ")}${
                  state.plan.create.length > 8 ? "…" : ""
                }. `}
              {state.plan.update.length > 0 &&
                `Changing: ${state.plan.update.map((u) => u.slug).slice(0, 8).join(", ")}${
                  state.plan.update.length > 8 ? "…" : ""
                }.`}
              {state.plan.create.length === 0 && state.plan.update.length === 0 && "Nothing to do."}
            </p>
          )}
        </div>
      )}
      <Feedback state={state} />
    </form>
  );
}
