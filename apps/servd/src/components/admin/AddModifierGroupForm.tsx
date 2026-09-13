"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createModifierGroup, type FormState } from "@/server/menu/actions";
import { SubmitButton } from "./SubmitButton";

/**
 * Creates a reusable option set.
 *
 * Min and Max sit in a two-column grid with the labels ABOVE the fields rather
 * than beside them: inline labels wrapped mid-control on a phone, so "Required"
 * and "Min" ended up on one line and "Max" alone on the next, reading like
 * three unrelated settings instead of one rule.
 *
 * Min is hidden until Required is ticked, matching the editor — an optional
 * group can always be skipped, so a minimum there means nothing.
 */
export function AddModifierGroupForm() {
  const [state, action] = useActionState<FormState, FormData>(
    createModifierGroup,
    null,
  );
  const [required, setRequired] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setRequired(false);
    }
  }, [state]);

  const field =
    "w-full rounded-lg border border-plum-ink/15 px-3 py-2.5 text-base sm:py-2 sm:text-sm";

  return (
    <form
      ref={formRef}
      action={action}
      className="space-y-3 rounded-tile border border-plum-ink/10 bg-white p-4"
    >
      <h3 className="font-heading font-bold">New modifier group</h3>

      <input
        name="name"
        placeholder="e.g. Size, Add-ons, Spice level"
        required
        className={field}
      />

      {/* A full-width row so the checkbox has a comfortable tap target. */}
      <label className="flex items-center gap-3 rounded-lg bg-cream/50 px-3 py-2.5 text-sm font-medium">
        <input
          type="checkbox"
          name="required"
          checked={required}
          onChange={(e) => setRequired(e.target.checked)}
          className="h-5 w-5"
        />
        Required — the diner must choose
      </label>

      <div className="grid grid-cols-2 gap-3">
        {required ? (
          <div>
            <label className="block text-xs font-semibold text-plum-ink/60">
              Min
            </label>
            <input
              name="minSelect"
              type="number"
              inputMode="numeric"
              min="1"
              defaultValue={1}
              className={`mt-1 ${field}`}
            />
          </div>
        ) : (
          // Keep the value posted so the action still gets a well-formed
          // minimum, without showing a control that can't mean anything.
          <input type="hidden" name="minSelect" value={0} />
        )}
        <div className={required ? "" : "col-span-2"}>
          <label className="block text-xs font-semibold text-plum-ink/60">
            Max choices
          </label>
          <input
            name="maxSelect"
            type="number"
            inputMode="numeric"
            min="1"
            defaultValue={1}
            className={`mt-1 ${field}`}
          />
        </div>
      </div>

      <p className="text-xs text-plum-ink/45">
        Max 1 = pick one · Max more than 1 = pick several
      </p>

      {state?.error && <p className="text-sm text-guava">{state.error}</p>}

      <SubmitButton pendingLabel="Adding…" className="w-full py-3 sm:w-auto sm:py-2">
        Add group
      </SubmitButton>
    </form>
  );
}
