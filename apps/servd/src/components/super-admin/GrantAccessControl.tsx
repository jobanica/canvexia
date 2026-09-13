"use client";

import { useActionState } from "react";
import {
  grantFullAccess,
  revokeFullAccess,
  type ActionState,
} from "@/server/billing/super-admin-actions";

/**
 * Grant / revoke complimentary full access for a subscriber. Uses action state
 * so the real result (including any error) shows inline instead of a white-screen
 * server exception.
 */
export function GrantAccessControl({ restaurantId }: { restaurantId: string }) {
  const [grantState, grantAction, granting] = useActionState<ActionState, FormData>(grantFullAccess, null);
  const [revokeState, revokeAction, revoking] = useActionState<ActionState, FormData>(revokeFullAccess, null);

  const field = "rounded border border-plum-ink/15 px-2 py-1 text-xs";
  const error = grantState?.error || revokeState?.error;
  const ok = grantState?.ok ? grantState.message : revokeState?.ok ? revokeState.message : null;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <form action={grantAction} className="flex items-end gap-1">
        <input type="hidden" name="restaurantId" value={restaurantId} />
        <select name="duration" defaultValue="forever" className={field}>
          <option value="1m">1 month</option>
          <option value="3m">3 months</option>
          <option value="12m">1 year</option>
          <option value="forever">Until revoked</option>
        </select>
        <button
          disabled={granting}
          className="rounded bg-brand-gradient px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
        >
          {granting ? "Granting…" : "Grant full access"}
        </button>
      </form>
      <form action={revokeAction}>
        <input type="hidden" name="restaurantId" value={restaurantId} />
        <button
          disabled={revoking}
          className="rounded border border-plum-ink/15 px-2 py-1 text-xs font-semibold hover:bg-cream disabled:opacity-60"
        >
          {revoking ? "Revoking…" : "Revoke → Free"}
        </button>
      </form>
      {error && <p className="w-full break-words text-xs text-guava">⚠ {error}</p>}
      {!error && ok && <p className="w-full text-xs text-mango">{ok}</p>}
    </div>
  );
}
