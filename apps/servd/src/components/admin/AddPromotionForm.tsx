"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createPromotion, type PromoFormState } from "@/server/promotions/actions";
import { SubmitButton } from "./SubmitButton";

type MenuItemOpt = { id: string; name: string };

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "percent", label: "% off the order" },
  { value: "amount", label: "₱ amount off" },
  { value: "free_delivery", label: "Free delivery" },
  { value: "free_item", label: "Free item" },
  { value: "bogo", label: "Buy 1 get 1 free" },
  { value: "info", label: "Info only (no code)" },
];

export function AddPromotionForm({ menuItems }: { menuItems: MenuItemOpt[] }) {
  const [state, action] = useActionState<PromoFormState, FormData>(createPromotion, null);
  const formRef = useRef<HTMLFormElement>(null);
  const [type, setType] = useState("percent");

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setType("percent");
    }
  }, [state]);

  const input = "mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm";
  const label = "block text-xs font-semibold uppercase tracking-wide text-plum-ink/50";
  const needsCode = type !== "info";
  const needsItem = type === "free_item" || type === "bogo";
  const needsValue = type === "percent" || type === "amount";

  return (
    <form
      ref={formRef}
      action={action}
      className="space-y-3 rounded-tile border border-plum-ink/10 bg-white p-4"
    >
      <div>
        <label className={label}>Title</label>
        <input name="title" required maxLength={80} placeholder="e.g. 20% off this week" className={input} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Offer type</label>
          <select name="type" value={type} onChange={(e) => setType(e.target.value)} className={input}>
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {needsValue && (
          <div>
            <label className={label}>{type === "percent" ? "Percent off (1–100)" : "Amount off (₱)"}</label>
            <input
              name="value"
              type="number"
              min={type === "percent" ? 1 : 0}
              max={type === "percent" ? 100 : undefined}
              step={type === "percent" ? 1 : "0.01"}
              placeholder={type === "percent" ? "20" : "50"}
              className={input}
            />
          </div>
        )}
      </div>

      {needsItem && (
        <div>
          <label className={label}>Which item</label>
          <select name="freeItemId" className={input} defaultValue="">
            <option value="" disabled>
              Pick a menu item…
            </option>
            {menuItems.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {needsCode && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>Coupon code</label>
            <input
              name="code"
              maxLength={24}
              placeholder="e.g. SAVE20"
              className={`${input} uppercase`}
              style={{ textTransform: "uppercase" }}
            />
          </div>
          <div>
            <label className={label}>Min. spend ₱ (optional)</label>
            <input name="minSpend" type="number" min={0} step="0.01" placeholder="0" className={input} />
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={label}>Expires (optional)</label>
          <input name="expiresAt" type="date" className={input} />
        </div>
      </div>

      <div>
        <label className={label}>Details (optional)</label>
        <textarea
          name="description"
          rows={2}
          maxLength={300}
          placeholder="Dine-in only. Cannot be combined with other offers."
          className={input}
        />
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton pendingLabel="Saving…">Add promotion</SubmitButton>
        {state?.error && <p className="text-sm text-guava">{state.error}</p>}
        {state?.ok && <p className="text-sm text-mango">Promotion added.</p>}
      </div>
    </form>
  );
}
