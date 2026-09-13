"use client";

import { useActionState } from "react";
import { issueGiftCard, type FormState } from "@/server/gift-cards/gift-cards";
import { SubmitButton } from "./SubmitButton";

export function IssueGiftCardForm() {
  const [state, action] = useActionState<FormState, FormData>(issueGiftCard, null);

  return (
    <form action={action} className="space-y-4 rounded-tile border border-plum-ink/10 bg-white p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium">Amount (₱)</span>
          <input
            name="amountPesos"
            type="number"
            step="0.01"
            min="0"
            required
            placeholder="500.00"
            className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Code (optional)</span>
          <input
            name="code"
            placeholder="Auto-generated if blank"
            className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2 uppercase"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Customer name (optional)</span>
          <input name="customerName" className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Customer phone (optional)</span>
          <input name="customerPhone" className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2" />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Expires (optional)</span>
          <input type="date" name="expiresAt" className="mt-1 w-full rounded-lg border border-plum-ink/15 px-3 py-2" />
        </label>
      </div>

      {state?.error && <p className="text-sm text-guava">{state.error}</p>}
      {state?.ok && (
        <p className="text-sm text-mango">
          Gift card issued — code <span className="font-mono font-bold">{state.code}</span>
        </p>
      )}
      <SubmitButton>Issue gift card</SubmitButton>
    </form>
  );
}
