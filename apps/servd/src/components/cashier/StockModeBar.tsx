"use client";

/**
 * The control that puts the POS grid into sold-out mode, and the strip that
 * says so while it's on.
 *
 * The banner is not decoration: in stock mode a tap no longer adds to the
 * order, and the cashier needs to be told that in words before they tap
 * anything. It stays until they turn the mode off.
 */
export function StockModeButton({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
        on
          ? "bg-mango text-plum-ink"
          : "border border-plum-ink/15 text-plum-ink/60 hover:border-mango hover:text-plum-ink"
      }`}
    >
      {on ? "✓ Done" : "🚫 Sold out"}
    </button>
  );
}

export function StockModeBanner({ note }: { note: string | null }) {
  return (
    <div className="mt-2 rounded-lg border border-mango/40 bg-mango/10 px-3 py-2">
      <p className="text-xs font-semibold text-plum-ink">
        Tap a dish to mark it sold out. Tap a sold-out one to put it back.
      </p>
      <p className="text-[11px] text-plum-ink/60">
        It comes off your website and the diner QR menu straight away. Nothing is added to the
        order while this is on.
      </p>
      {note && <p className="mt-1 text-[11px] font-semibold text-brand-primary">{note}</p>}
    </div>
  );
}
