"use client";

import { useActionState, useEffect, useRef } from "react";
import { createModifier, type FormState } from "@/server/menu/actions";
import { SubmitButton } from "./SubmitButton";

/**
 * Adds an option (e.g. "Large +30") to a modifier group.
 *
 * Mobile-first: the name takes the full width on a phone and the price sits
 * beside the button underneath. Laid out as a single row it overflowed the
 * screen — a `flex-1` input won't shrink below its content without `min-w-0`,
 * so the price field and the Add button were pushed off the right edge where
 * nobody could reach them.
 */
export function AddModifierForm({ groupId }: { groupId: string }) {
  const [state, action] = useActionState<FormState, FormData>(
    createModifier,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-2 sm:space-y-0">
      <input type="hidden" name="modifierGroupId" value={groupId} />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          name="name"
          placeholder="Option name"
          required
          className="min-w-0 w-full rounded-lg border border-plum-ink/15 px-3 py-2.5 text-base sm:flex-1 sm:py-1.5 sm:text-sm"
        />
        <div className="flex items-center gap-2">
          {/* The ₱ sits in the field so a lone "0" reads as a price rather
              than as some unlabelled number. */}
          <div className="relative min-w-0 flex-1 sm:w-24 sm:flex-none">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-plum-ink/40">
              ₱
            </span>
            <input
              name="priceDeltaPesos"
              type="number"
              inputMode="decimal"
              step="0.01"
              defaultValue={0}
              aria-label="Price change for this option"
              className="w-full rounded-lg border border-plum-ink/15 py-2.5 pl-7 pr-3 text-base sm:py-1.5 sm:text-sm"
            />
          </div>
          <SubmitButton pendingLabel="…" className="shrink-0 px-5 py-2.5 sm:px-3 sm:py-1.5">
            Add
          </SubmitButton>
        </div>
      </div>

      {state?.error && <p className="text-xs text-guava">{state.error}</p>}
    </form>
  );
}
