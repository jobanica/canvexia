"use client";

import { useActionState, useEffect, useState } from "react";
import { updateModifierGroup, deleteModifierGroup, type FormState } from "@/server/menu/actions";
import { SubmitButton } from "./SubmitButton";

/**
 * A modifier group's header with an inline edit toggle — rename it and change
 * required / min–max selection, or delete it. View mode shows the name + rule
 * summary with Edit / Delete group.
 *
 * The title and its actions stack on a phone: side by side, a long group name
 * squeezed "Delete group" down to a couple of characters per line.
 */
export function ModifierGroupHeader({
  group,
}: {
  group: { id: string; name: string; required: boolean; minSelect: number; maxSelect: number };
}) {
  const [editing, setEditing] = useState(false);
  const [required, setRequired] = useState(group.required);
  const [state, action] = useActionState<FormState, FormData>(updateModifierGroup, null);

  useEffect(() => {
    if (state?.ok) setEditing(false);
  }, [state]);

  const field =
    "w-full rounded-lg border border-plum-ink/15 px-3 py-2.5 text-base sm:py-2 sm:text-sm";

  if (editing) {
    return (
      <form action={action} className="space-y-3 rounded-lg border border-plum-ink/10 bg-cream/40 p-3">
        <input type="hidden" name="id" value={group.id} />
        <input name="name" defaultValue={group.name} required className={field} />

        <label className="flex items-center gap-3 rounded-lg bg-white/70 px-3 py-2.5 text-sm font-medium">
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
          {/* Min only means anything for a required group — an optional one can
              always be skipped, so we hide it rather than let a stale minimum
              keep forcing a choice. */}
          {required ? (
            <div>
              <label className="block text-xs font-semibold text-plum-ink/60">Min</label>
              <input
                name="minSelect"
                type="number"
                inputMode="numeric"
                min="1"
                defaultValue={Math.max(1, group.minSelect)}
                className={`mt-1 ${field}`}
              />
            </div>
          ) : (
            <p className="col-span-2 text-xs text-plum-ink/45">Diners can skip this group.</p>
          )}
          <div className={required ? "" : "col-span-2"}>
            <label className="block text-xs font-semibold text-plum-ink/60">Max choices</label>
            <input
              name="maxSelect"
              type="number"
              inputMode="numeric"
              min="1"
              defaultValue={group.maxSelect}
              className={`mt-1 ${field}`}
            />
          </div>
        </div>

        {state?.error && <p className="text-sm text-guava">{state.error}</p>}

        <div className="flex items-center gap-2">
          <SubmitButton pendingLabel="Saving…" className="flex-1 py-2.5 sm:flex-none sm:py-2">
            Save
          </SubmitButton>
          <button
            type="button"
            onClick={() => {
              setRequired(group.required);
              setEditing(false);
            }}
            className="rounded-lg px-4 py-2.5 text-sm font-semibold text-muted hover:text-plum-ink"
          >
            Cancel
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
      <div className="min-w-0">
        <h2 className="break-words font-heading text-lg font-bold">{group.name}</h2>
        <p className="text-xs text-plum-ink/50">
          {group.required ? "Required" : "Optional"} · select {group.minSelect}–{group.maxSelect}{" "}
          {group.maxSelect === 1 ? "(single)" : "(multi)"}
        </p>
      </div>
      <div className="-mr-2 flex shrink-0 items-center">
        <button
          type="button"
          onClick={() => {
            setRequired(group.required);
            setEditing(true);
          }}
          className="rounded-lg px-3 py-2 text-sm font-semibold text-plum-ink/60 hover:text-brand-primary"
        >
          Edit
        </button>
        <form action={deleteModifierGroup}>
          <input type="hidden" name="id" value={group.id} />
          <button className="rounded-lg px-3 py-2 text-sm text-muted hover:text-guava">
            Delete
          </button>
        </form>
      </div>
    </div>
  );
}
