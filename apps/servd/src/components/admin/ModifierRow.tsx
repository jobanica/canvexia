"use client";

import { useActionState, useEffect, useState } from "react";
import {
  updateModifier,
  deleteModifier,
  setModifierAvailability,
  type FormState,
} from "@/server/menu/actions";
import { formatDelta, centavosToPesos } from "@/lib/money";
import { SubmitButton } from "./SubmitButton";

/**
 * One modifier option row with an inline edit toggle. View mode shows the name +
 * price delta with Mark out / Edit / Remove; edit mode swaps in a small form to
 * rename it and change its price, saved via the updateModifier action.
 *
 * "Mark out" is the 86 button: the add-on stays in the group but shows as sold
 * out to diners, so a temporary shortage doesn't mean deleting and re-adding it.
 *
 * On a phone the three actions sit on their own line under the name. Beside it
 * they left the name a few characters wide, and each was a `text-xs` word with
 * no padding — a target too small to hit reliably with a thumb, next to
 * "Remove", which is the one action you least want mis-tapped.
 */
export function ModifierRow({
  id,
  name,
  priceDelta,
  isAvailable = true,
}: {
  id: string;
  name: string;
  priceDelta: number; // centavos
  isAvailable?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [state, action] = useActionState<FormState, FormData>(updateModifier, null);

  // Close the editor once the save succeeds.
  useEffect(() => {
    if (state?.ok) setEditing(false);
  }, [state]);

  if (editing) {
    return (
      <li className="rounded-lg bg-cream/60 p-2">
        <form action={action} className="space-y-2">
          <input type="hidden" name="id" value={id} />
          <input
            name="name"
            defaultValue={name}
            placeholder="Option name"
            required
            className="w-full min-w-0 rounded-lg border border-plum-ink/15 px-3 py-2.5 text-base sm:py-1.5 sm:text-sm"
          />
          <div className="flex items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:w-24 sm:flex-none">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-plum-ink/40">
                ₱
              </span>
              <input
                name="priceDeltaPesos"
                type="number"
                inputMode="decimal"
                step="0.01"
                defaultValue={centavosToPesos(priceDelta)}
                aria-label="Price change for this option"
                className="w-full rounded-lg border border-plum-ink/15 py-2.5 pl-7 pr-3 text-base sm:py-1.5 sm:text-sm"
              />
            </div>
            <SubmitButton pendingLabel="…" className="shrink-0 px-5 py-2.5 sm:px-3 sm:py-1.5">
              Save
            </SubmitButton>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="shrink-0 rounded-lg px-3 py-2.5 text-sm text-muted hover:text-plum-ink"
            >
              Cancel
            </button>
          </div>
          {state?.error && <p className="text-xs text-guava">{state.error}</p>}
        </form>
      </li>
    );
  }

  return (
    <li className="rounded-lg bg-cream/60 px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className={`min-w-0 break-words ${isAvailable ? "" : "text-plum-ink/40"}`}>
          <span className={isAvailable ? "" : "line-through"}>{name}</span>{" "}
          <span className={isAvailable ? "font-semibold text-brand-primary" : ""}>
            {formatDelta(priceDelta)}
          </span>
          {!isAvailable && (
            <span className="ml-2 rounded-full bg-guava/10 px-2 py-0.5 text-xs font-semibold text-guava">
              Marked out
            </span>
          )}
        </span>

        {/* -mr-2 pulls the padded targets back level with the card edge, so the
            row still LOOKS aligned while each button stays thumb-sized. */}
        <div className="-mr-2 flex shrink-0 items-center">
          <form action={setModifierAvailability}>
            <input type="hidden" name="id" value={id} />
            {/* Checked = put it back on the menu; unchecked = mark it out. */}
            {!isAvailable && <input type="hidden" name="isAvailable" value="on" />}
            <button
              className={`rounded-lg px-2.5 py-2 text-xs font-semibold ${
                isAvailable ? "text-plum-ink/60 hover:text-guava" : "text-green-700"
              }`}
            >
              {isAvailable ? "Mark out" : "Available"}
            </button>
          </form>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-lg px-2.5 py-2 text-xs font-semibold text-plum-ink/60 hover:text-brand-primary"
          >
            Edit
          </button>
          <form action={deleteModifier}>
            <input type="hidden" name="id" value={id} />
            <button className="rounded-lg px-2.5 py-2 text-xs text-muted hover:text-guava">
              Remove
            </button>
          </form>
        </div>
      </div>
    </li>
  );
}
