"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createBundle, type FormState } from "@/server/menu/actions";
import { SubmitButton } from "./SubmitButton";

type Section = { label: string; choose: number; dishes: string[] };

const emptySections = (): Section[] => [{ label: "Main dishes", choose: 3, dishes: ["", "", ""] }];

/**
 * Builds a fixed-price bundle with one or more selection SECTIONS — e.g.
 * "Main dishes: pick 4" + "Side dishes / Desserts: pick 2". Each section becomes
 * a required "choose N" group the customer must complete on the storefront.
 */
export function AddBundleForm({ categories }: { categories: { id: string; name: string }[] }) {
  const [state, action] = useActionState<FormState, FormData>(createBundle, null);
  const [open, setOpen] = useState(false);
  const [sections, setSections] = useState<Section[]>(emptySections());
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setSections(emptySections());
      setOpen(false);
    }
  }, [state]);

  if (categories.length === 0) return null;

  function patch(i: number, p: Partial<Section>) {
    setSections((s) => s.map((sec, idx) => (idx === i ? { ...sec, ...p } : sec)));
  }
  function setDish(i: number, di: number, val: string) {
    setSections((s) => s.map((sec, idx) => (idx === i ? { ...sec, dishes: sec.dishes.map((d, j) => (j === di ? val : d)) } : sec)));
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold">
        🍱 Add a bundle (pick N for a fixed price)
      </button>
    );
  }

  const serialized = JSON.stringify(
    sections.map((s) => ({ label: s.label.trim(), choose: s.choose, dishes: s.dishes.map((d) => d.trim()).filter(Boolean) })),
  );

  return (
    <form ref={formRef} action={action} className="space-y-3 rounded-tile border border-plum-ink/10 bg-white p-4">
      <div>
        <h3 className="font-heading text-base font-bold">New bundle</h3>
        <p className="text-xs text-plum-ink/50">
          e.g. a set meal — “4 main dishes + 2 sides/desserts for ₱X”. Add a section for each group the customer picks from.
        </p>
      </div>

      <input type="hidden" name="sections" value={serialized} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block font-semibold text-plum-ink/60">Category</span>
          <select name="categoryId" required className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm">
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-semibold text-plum-ink/60">Bundle name</span>
          <input name="name" placeholder="e.g. Set A — 4 mains + 2 sides" required className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
        </label>
      </div>

      <label className="block text-sm sm:max-w-[12rem]">
        <span className="mb-1 block font-semibold text-plum-ink/60">Bundle price (₱)</span>
        <input name="pricePesos" type="number" step="0.01" min="0" placeholder="1299" required className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
      </label>

      <textarea name="description" placeholder="Description (optional) — e.g. Good for family & groups" rows={2} className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />

      {/* Sections */}
      <div className="space-y-3">
        {sections.map((sec, i) => (
          <div key={i} className="rounded-lg border border-plum-ink/10 bg-cream/40 p-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex-1 text-sm">
                <span className="mb-1 block text-xs font-semibold text-plum-ink/60">Section name</span>
                <input
                  value={sec.label}
                  onChange={(e) => patch(i, { label: e.target.value })}
                  placeholder="e.g. Main dishes / Sides / Desserts"
                  className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
                />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold text-plum-ink/60">Pick how many?</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={sec.choose}
                  onChange={(e) => patch(i, { choose: Math.max(1, Number(e.target.value) || 1) })}
                  className="w-24 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
                />
              </label>
              {sections.length > 1 && (
                <button type="button" onClick={() => setSections((s) => s.filter((_, idx) => idx !== i))} className="pb-2 text-xs text-muted hover:text-guava">
                  remove section
                </button>
              )}
            </div>

            <div className="mt-2 space-y-2">
              {sec.dishes.map((d, di) => (
                <div key={di} className="flex items-center gap-2">
                  <input
                    value={d}
                    onChange={(e) => setDish(i, di, e.target.value)}
                    placeholder={`Choice ${di + 1} — e.g. ${i === 0 ? "Caldereta" : "Buko pandan"}`}
                    className="flex-1 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
                  />
                  {sec.dishes.length > 1 && (
                    <button type="button" onClick={() => patch(i, { dishes: sec.dishes.filter((_, j) => j !== di) })} className="text-sm text-muted hover:text-guava">
                      remove
                    </button>
                  )}
                </div>
              ))}
              <button type="button" onClick={() => patch(i, { dishes: [...sec.dishes, ""] })} className="rounded-full border border-plum-ink/15 px-3 py-1 text-xs font-semibold">
                + Add choice
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setSections((s) => [...s, { label: "Sides / Desserts", choose: 2, dishes: ["", ""] }])}
          className="rounded-full border border-brand-primary/40 px-4 py-1.5 text-sm font-semibold text-brand-primary"
        >
          + Add section
        </button>
      </div>

      <label className="block text-sm">
        <span className="mr-2 text-plum-ink/60">Photo (optional)</span>
        <input type="file" name="image" accept="image/jpeg,image/png,image/webp" className="text-xs" />
      </label>

      {state?.error && <p className="text-sm text-guava">{state.error}</p>}
      <div className="flex gap-2">
        <SubmitButton pendingLabel="Creating…">Create bundle</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-plum-ink/15 px-4 py-2 text-sm font-semibold">
          Cancel
        </button>
      </div>
    </form>
  );
}
