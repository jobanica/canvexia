"use client";

import { useActionState, useState } from "react";
import { createHappyHour, type FormState } from "@/server/pricing/happy-hour";
import { DAY_LABELS } from "@/lib/pricing/happy-hour";
import { SubmitButton } from "./SubmitButton";

type Opt = { id: string; name: string };

export function HappyHourForm({ categories, items }: { categories: Opt[]; items: Opt[] }) {
  const [state, action] = useActionState<FormState, FormData>(createHappyHour, null);
  const [discountType, setDiscountType] = useState<"percent" | "amount">("percent");
  const [scope, setScope] = useState<"all" | "category" | "item">("all");

  const targets = scope === "category" ? categories : scope === "item" ? items : [];

  return (
    <form action={action} className="space-y-4 rounded-tile border border-plum-ink/10 bg-white p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">Name</span>
          <input
            name="name"
            required
            placeholder="e.g. Afternoon Happy Hour"
            className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm">
            <span className="font-medium">Discount</span>
            <select
              name="discountType"
              value={discountType}
              onChange={(e) => setDiscountType(e.target.value as "percent" | "amount")}
              className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
            >
              <option value="percent">% off</option>
              <option value="amount">₱ off</option>
            </select>
          </label>
          <label className="block text-sm">
            <span className="font-medium">{discountType === "percent" ? "Percent" : "Amount (₱)"}</span>
            <input
              name="value"
              type="number"
              step={discountType === "percent" ? "1" : "0.01"}
              min="0"
              required
              className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="font-medium">Start time</span>
          <input name="start" type="time" required className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="font-medium">End time</span>
          <input name="end" type="time" required className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2" />
          <span className="mt-1 block text-xs text-plum-ink/40">End before start = overnight (e.g. 22:00–02:00).</span>
        </label>
      </div>

      <div className="block text-sm">
        <span className="font-medium">Days</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {DAY_LABELS.map((label, i) => (
            <label
              key={label}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-plum-ink/15 px-3 py-1.5 text-xs has-[:checked]:border-brand-primary has-[:checked]:bg-brand-primary/10 has-[:checked]:text-brand-primary"
            >
              <input type="checkbox" name="days" value={i} className="sr-only" />
              {label}
            </label>
          ))}
        </div>
        <span className="mt-1 block text-xs text-plum-ink/40">Leave all unchecked for every day.</span>
      </div>

      <div className="block text-sm">
        <span className="font-medium">Applies to</span>
        <select
          name="scope"
          value={scope}
          onChange={(e) => setScope(e.target.value as "all" | "category" | "item")}
          className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2 sm:max-w-xs"
        >
          <option value="all">The whole menu</option>
          <option value="category">Selected categories</option>
          <option value="item">Selected items</option>
        </select>

        {scope !== "all" && (
          <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-plum-ink/10 p-2">
            {targets.length === 0 ? (
              <p className="px-1 py-2 text-xs text-plum-ink/40">Nothing to choose yet.</p>
            ) : (
              targets.map((o) => (
                <label key={o.id} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-cream">
                  <input type="checkbox" name="targetIds" value={o.id} />
                  {o.name}
                </label>
              ))
            )}
          </div>
        )}
      </div>

      {state?.error && <p className="text-sm text-guava">{state.error}</p>}
      {state?.ok && <p className="text-sm text-mango">Happy hour saved.</p>}
      <SubmitButton>Add happy hour</SubmitButton>
    </form>
  );
}
