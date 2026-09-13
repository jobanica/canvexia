"use client";

import { switchBranch } from "@/server/tenancy/branch-actions";
import type { BranchRow } from "@/server/tenancy/branches";

/**
 * Swap which shop the dashboard is showing.
 *
 * Only rendered for an owner who actually has more than one — a picker with a
 * single option is just clutter, and most accounts are one shop.
 *
 * A plain form submit rather than a fetch: switching branch changes every
 * number on the page, so a full navigation is the honest thing to do. The
 * server re-checks membership and then redirects to the dashboard, so nothing
 * from the previous branch is left on screen.
 */
export function BranchSwitcher({ branches }: { branches: BranchRow[] }) {
  const active = branches.find((b) => b.active);
  // Only live branches can be entered. The one they're currently in is kept
  // regardless, so the select always has something to show as chosen — an
  // owner sitting in their first, not-yet-activated shop included.
  const options = branches.filter((b) => b.status === "active" || b.active);
  if (options.length < 2) return null;

  return (
    <form action={switchBranch} className="px-3 pb-2">
      <label className="block px-1 pb-1 text-[10px] font-bold uppercase tracking-widest text-plum-ink/35">
        Branch
      </label>
      <select
        name="restaurantId"
        defaultValue={active?.restaurantId}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="w-full rounded-lg border border-plum-ink/15 bg-white px-2.5 py-2 text-sm font-semibold"
      >
        {options.map((b) => (
          <option key={b.restaurantId} value={b.restaurantId}>
            {b.name}
            {b.status !== "active" ? " (not activated)" : ""}
          </option>
        ))}
      </select>
      {/* Works without JavaScript too, and gives a keyboard user something to
          press after choosing with the arrow keys. */}
      <noscript>
        <button className="mt-2 w-full rounded-lg border border-plum-ink/15 px-2 py-1.5 text-xs font-semibold">
          Switch
        </button>
      </noscript>
    </form>
  );
}
