"use client";

import { useMemo, useState } from "react";
import { formatPeso } from "@/lib/money";
import type { ItemsSold } from "@/lib/orders/items-sold";

/**
 * What sold, and how much of it.
 *
 * Open by default — it's the answer to the question most owners come to this
 * screen with, and burying it behind a tap would mean most never find it. The
 * ticket list underneath answers the rarer "what did THAT customer order".
 *
 * Ranked by quantity, with a bar so the shape of a day is readable without
 * doing arithmetic on twenty numbers.
 */
export function ItemsSoldPanel({ data }: { data: ItemsSold }) {
  const [expanded, setExpanded] = useState(false);
  const [byRevenue, setByRevenue] = useState(false);

  const items = useMemo(() => {
    const list = byRevenue ? [...data.items].sort((a, b) => b.revenue - a.revenue) : data.items;
    return expanded ? list : list.slice(0, 10);
  }, [data.items, byRevenue, expanded]);

  // The bar is scaled to the biggest row on the CURRENT sort, so the top row is
  // always full width and the rest read as a proportion of it.
  const max = Math.max(1, ...items.map((i) => (byRevenue ? i.revenue : i.quantity)));

  if (data.items.length === 0) {
    return (
      <div className="rounded-tile border border-plum-ink/10 bg-white p-6 text-center text-sm text-plum-ink/45">
        Nothing sold in this period.
      </div>
    );
  }

  return (
    <div className="rounded-tile border border-plum-ink/10 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-plum-ink/10 p-3">
        <div>
          <h2 className="font-heading font-bold text-plum-ink">Items sold</h2>
          <p className="text-xs text-plum-ink/50">
            {data.totalQuantity} sold across {data.distinctItems} item
            {data.distinctItems === 1 ? "" : "s"} · {formatPeso(data.totalRevenue)}
          </p>
        </div>
        <div className="flex rounded-lg bg-plum-ink/5 p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setByRevenue(false)}
            className={`rounded-md px-3 py-1.5 ${!byRevenue ? "bg-white text-plum-ink shadow-sm" : "text-plum-ink/55"}`}
          >
            By quantity
          </button>
          <button
            type="button"
            onClick={() => setByRevenue(true)}
            className={`rounded-md px-3 py-1.5 ${byRevenue ? "bg-white text-plum-ink shadow-sm" : "text-plum-ink/55"}`}
          >
            By sales
          </button>
        </div>
      </div>

      <ul className="divide-y divide-plum-ink/5">
        {items.map((i) => {
          const value = byRevenue ? i.revenue : i.quantity;
          return (
            <li key={i.key} className="relative px-3 py-2.5">
              {/* Behind the text, so long names stay readable over it. */}
              <div
                aria-hidden
                className="absolute inset-y-0 left-0 bg-brand-primary/20"
                style={{ width: `${(value / max) * 100}%` }}
              />
              <div className="relative flex items-center gap-3">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-plum-ink">
                  {i.name}
                  {i.deleted && (
                    <span className="ml-1 text-[10px] font-semibold uppercase tracking-wide text-plum-ink/35">
                      removed
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-right">
                  <span className="font-heading font-extrabold tabular-nums text-plum-ink">
                    {i.quantity}
                  </span>
                  <span className="ml-1 text-xs text-plum-ink/45">sold</span>
                </span>
                <span className="w-20 shrink-0 text-right text-sm tabular-nums text-plum-ink/60">
                  {formatPeso(i.revenue)}
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      {data.items.length > 10 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="w-full border-t border-plum-ink/10 py-2.5 text-xs font-semibold text-brand-primary"
        >
          {expanded ? "Show top 10 only" : `Show all ${data.items.length} items`}
        </button>
      )}
    </div>
  );
}
