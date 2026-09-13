"use client";

import { useActionState } from "react";
import {
  reassignMerchantAction,
  type OperatorState,
} from "@/server/partners/operator-actions";
import type { PartnerChoice } from "@/server/partners/directory";

/**
 * Move one merchant to another partner.
 *
 * Inline per row rather than a bulk tool on purpose: this changes who is paid
 * for a merchant every month and who can read its data at all, so it should be
 * about as easy as it is to undo, which is not very.
 */
export function ReassignMerchantForm({
  restaurantId,
  currentPartnerId,
  partners,
}: {
  restaurantId: string;
  currentPartnerId: string | null;
  partners: PartnerChoice[];
}) {
  const [state, action] = useActionState<OperatorState, FormData>(reassignMerchantAction, null);

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="restaurantId" value={restaurantId} />
      <select
        name="targetPartnerId"
        defaultValue={currentPartnerId ?? ""}
        className="rounded-lg border border-plum-ink/15 px-2 py-1.5 text-xs"
      >
        <option value="">Move to…</option>
        {partners.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.tier === "operator" ? ` · ${p.revenueSharePct}%` : " · legacy"}
          </option>
        ))}
      </select>
      <input
        name="reason"
        placeholder="Reason (recorded)"
        className="w-40 rounded-lg border border-plum-ink/15 px-2 py-1.5 text-xs"
      />
      <button className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold">
        Move
      </button>
      {state?.error && <span className="text-xs text-guava">{state.error}</span>}
      {state?.ok && <span className="text-xs text-mango">{state.message}</span>}
    </form>
  );
}
