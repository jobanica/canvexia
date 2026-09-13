"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createItem, type FormState } from "@/server/menu/actions";
import { SubmitButton } from "./SubmitButton";
import { ImageField } from "./ImageField";

/** Inline "add item" form, pre-scoped to a single category. */
export function AddItemForm({ categoryId }: { categoryId: string }) {
  const [state, action] = useActionState<FormState, FormData>(createItem, null);
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm font-semibold text-brand-primary"
      >
        + Add item
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={action}
      className="space-y-3 rounded-lg border border-plum-ink/10 bg-cream/50 p-3"
    >
      <input type="hidden" name="categoryId" value={categoryId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <input
          name="name"
          placeholder="Item name"
          required
          className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
        />
        <input
          name="pricePesos"
          type="number"
          step="0.01"
          min="0"
          placeholder="Price (₱)"
          required
          className="rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
        />
      </div>
      <textarea
        name="description"
        placeholder="Description (optional)"
        rows={2}
        className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
      />
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isAvailable" defaultChecked />
          Available
        </label>
        {/* Counter-only. The hidden marker lets the server tell "off" from
            "this form has no such field" — an unchecked box submits nothing. */}
        <label className="flex items-center gap-2 text-sm">
          <input type="hidden" name="posOnlyField" value="1" />
          <input type="checkbox" name="posOnly" />
          Counter only
        </label>
        <ImageField name="image" className="w-full sm:w-auto sm:min-w-[16rem]" />
      </div>
      {state?.error && <p className="text-sm text-guava">{state.error}</p>}
      <div className="flex gap-2">
        <SubmitButton pendingLabel="Adding…">Save item</SubmitButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-plum-ink/15 px-4 py-2 text-sm font-semibold"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
