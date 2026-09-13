"use client";

import { setQrGrandfathered, setAddonUnlock } from "@/server/billing/super-admin-actions";
import { UNLIMITED_TABLES_PRICE, UNLIMITED_TABLES_ADDON_KEY } from "@/lib/billing/table-quota";
import { formatPeso } from "@/lib/money";

/**
 * Table-QR access for one account.
 *
 * Two ways in, kept apart because they mean different things. Grandfathered is
 * a promise — this account predates the change, or was told unlimited. Unlocked
 * is a sale. Collapsing them into one switch would make the revenue figures
 * lie about how many people actually paid.
 */
export function QrAccessControl({
  restaurantId,
  grandfathered,
  unlocked,
}: {
  restaurantId: string;
  grandfathered: boolean;
  unlocked: boolean;
}) {
  const btn = "rounded border border-plum-ink/15 px-2 py-1 text-xs font-semibold hover:bg-cream";
  const on = "rounded bg-brand-gradient px-3 py-1 text-xs font-semibold text-white";

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-plum-ink/45">
        Tables &amp; QR codes
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-plum-ink/70">
          {grandfathered
            ? "Grandfathered — unlimited"
            : unlocked
              ? "Unlocked (paid) — unlimited"
              : "Free tier — 1 table QR"}
        </span>

        <form action={setQrGrandfathered}>
          <input type="hidden" name="restaurantId" value={restaurantId} />
          <input type="hidden" name="grant" value={grandfathered ? "0" : "1"} />
          <button className={grandfathered ? btn : on}>
            {grandfathered ? "Remove grandfathering" : "Grandfather (free)"}
          </button>
        </form>

        <form action={setAddonUnlock}>
          <input type="hidden" name="restaurantId" value={restaurantId} />
          <input type="hidden" name="addon" value={UNLIMITED_TABLES_ADDON_KEY} />
          <input type="hidden" name="amount" value={UNLIMITED_TABLES_PRICE} />
          <input type="hidden" name="grant" value={unlocked ? "0" : "1"} />
          <button className={btn}>
            {unlocked
              ? "Void the unlock"
              : `Mark ${formatPeso(UNLIMITED_TABLES_PRICE)} paid`}
          </button>
        </form>
      </div>
    </div>
  );
}
