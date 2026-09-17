"use client";

import { usePathname } from "next/navigation";
import type { BranchRow } from "@/server/pharmacy/branches";

/**
 * Which branch you are looking at.
 *
 * A PLAIN FORM THAT POSTS. No client state, no router push — the selection
 * lives in a cookie so it survives a reload, a new tab and the PWA being
 * reopened tomorrow, which is what a person standing at one till expects.
 *
 * It renders nothing at all for a pharmacy with one branch. Most never open a
 * second, and a dropdown with a single option is a control that teaches people
 * to ignore controls.
 */
export function BranchSwitcher({
  branches,
  currentId,
  all,
  canSeeAll,
}: {
  branches: BranchRow[];
  currentId: string | null;
  all: boolean;
  canSeeAll: boolean;
}) {
  const pathname = usePathname();
  if (branches.length < 2) return null;

  return (
    <form action="/api/branch" method="post" className="flex items-center gap-2">
      <input type="hidden" name="back" value={pathname} />
      <select
        name="branch"
        defaultValue={all ? "all" : (currentId ?? "")}
        // Submitting on change: a Go button beside a dropdown is a button
        // people forget to press, and then wonder why the figures are wrong.
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-xl border border-white/10 px-2 py-1 text-sm"
        aria-label="Branch"
      >
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
        {/*
          Reading only. Stock has to land somewhere, so a sale, a delivery or a
          count made while "All branches" is selected files at the main branch —
          which is why the writing screens say which branch they are writing to.
        */}
        {canSeeAll && <option value="all">All branches</option>}
      </select>
      <noscript>
        <button className="rounded-xl border border-white/10 px-2 py-1 text-xs">Go</button>
      </noscript>
    </form>
  );
}
