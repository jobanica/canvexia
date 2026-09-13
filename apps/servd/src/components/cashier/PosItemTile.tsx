"use client";

import { formatPeso } from "@/lib/money";
import type { DinerItem } from "@/lib/cart/types";

// Soft, deterministic tile colors for items without a photo — so the grid still
// reads as colorful cards (like a classic POS) instead of blank boxes.
const TILE_COLORS = [
  "bg-brand-primary/15 text-brand-primary",
  "bg-mango/20 text-plum-ink",
  "bg-guava/15 text-guava",
  "bg-emerald-500/15 text-emerald-700",
  "bg-sky-500/15 text-sky-700",
  "bg-violet-500/15 text-violet-700",
  "bg-amber-500/20 text-amber-800",
  "bg-rose-500/15 text-rose-700",
];

function colorFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TILE_COLORS[h % TILE_COLORS.length];
}

/**
 * One image-forward menu tile for the cashier POS grid — a photo (or a colored
 * placeholder with the name) with the item name + price overlaid, so staff can
 * order by tapping pictures, like a classic touchscreen POS.
 *
 * `stockMode` turns the whole grid into the sold-out switch instead of the
 * order pad: every tile becomes tappable — the sold-out ones ESPECIALLY, since
 * those are the ones being put back — and the label says what the tap will do.
 * A separate mode rather than a corner button on each tile, because the corner
 * of a tile is exactly where a thumb lands when a queue is building, and taking
 * a dish off the menu is not something to do by accident.
 */
export function PosItemTile({
  item,
  onPick,
  stockMode = false,
  busy = false,
}: {
  item: DinerItem;
  onPick: (item: DinerItem) => void;
  stockMode?: boolean;
  busy?: boolean;
}) {
  const soldOut = !item.isAvailable;
  return (
    <button
      type="button"
      disabled={stockMode ? busy : soldOut}
      onClick={() => onPick(item)}
      className={`group relative aspect-square overflow-hidden rounded-lg border text-left transition disabled:opacity-50 ${
        stockMode
          ? "border-mango ring-2 ring-mango/40 hover:border-mango"
          : "border-plum-ink/10 hover:border-brand-primary"
      }`}
    >
      {item.imageUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.imageUrl}
            alt={item.name}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* Gradient keeps the label readable over any photo. */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/35 to-transparent px-2 pb-1.5 pt-6">
            <p className="line-clamp-2 text-xs font-semibold leading-tight text-white">{item.name}</p>
            <p className="text-[11px] font-bold text-white/90">{formatPeso(item.price)}</p>
          </div>
        </>
      ) : (
        <div className={`absolute inset-0 flex flex-col items-center justify-center gap-1 p-2 ${colorFor(item.id)}`}>
          <span className="line-clamp-3 text-center text-sm font-bold leading-tight">{item.name}</span>
          <span className="text-xs font-bold opacity-80">{formatPeso(item.price)}</span>
        </div>
      )}

      {soldOut && (
        <span className="absolute right-1 top-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-white">
          Sold out
        </span>
      )}

      {/* What this tap will do, spelled out. In stock mode the tile is no
          longer an "add to order" button, and it has to stop looking like one. */}
      {stockMode && (
        <span
          className={`absolute inset-x-0 top-0 px-1 py-1 text-center text-[10px] font-bold uppercase tracking-wide text-white ${
            busy ? "bg-plum-ink/70" : soldOut ? "bg-emerald-600/90" : "bg-guava/90"
          }`}
        >
          {busy ? "Saving…" : soldOut ? "Put back" : "Sold out"}
        </span>
      )}
    </button>
  );
}
