"use client";

import { useMemo, useState } from "react";
import { formatPeso } from "@/lib/money";
import {
  recordCount,
  recordRestock,
  recordWaste,
  restockAndRelist,
  setProductReorderLevel,
  startTrackingProduct,
  stopTrackingProduct,
} from "@/server/inventory/actions";

export interface ProductStockRow {
  menuItemId: string;
  name: string;
  categoryName: string;
  price: number;
  imageUrl: string | null;
  isAvailable: boolean;
  /** null => this product's units aren't counted. */
  inventoryItemId: string | null;
  unit: string;
  stockQty: number;
  reorderLevel: number;
  costPerUnit: number;
  low: boolean;
}

/**
 * Stock for the things a shop actually sells.
 *
 * Cards rather than a table: this is the screen someone stands in front of a
 * shelf with, counting on a phone, and a six-column table on a 5-inch screen
 * is either unreadable or sideways-scrolling. The desktop layout gets the same
 * cards in a wider grid instead of a second implementation to keep in step.
 *
 * Untracked products are listed too — you can't start counting something the
 * screen won't show you.
 */
export function ProductStockTable({ rows }: { rows: ProductStockRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "tracked" | "low">("all");
  const [openId, setOpenId] = useState<string | null>(null);

  const counts = useMemo(
    () => ({
      all: rows.length,
      tracked: rows.filter((r) => r.inventoryItemId).length,
      low: rows.filter((r) => r.inventoryItemId && r.low).length,
    }),
    [rows],
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "tracked" && !r.inventoryItemId) return false;
      if (filter === "low" && !(r.inventoryItemId && r.low)) return false;
      if (!q) return true;
      return r.name.toLowerCase().includes(q) || r.categoryName.toLowerCase().includes(q);
    });
  }, [rows, query, filter]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-plum-ink/15 bg-white px-3 py-2">
          <span className="text-plum-ink/40" aria-hidden>🔍</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search products…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-plum-ink/40"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="text-plum-ink/40">
              ×
            </button>
          )}
        </div>
        <div className="flex rounded-lg bg-plum-ink/5 p-1 text-xs font-semibold">
          {(["all", "tracked", "low"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 capitalize ${
                filter === f
                  ? `bg-white shadow-sm ${f === "low" ? "text-guava" : "text-plum-ink"}`
                  : "text-plum-ink/55"
              }`}
            >
              {f === "low" ? "Low stock" : f} ({counts[f]})
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-tile border border-plum-ink/10 bg-white p-8 text-center text-sm text-plum-ink/45">
          {rows.length === 0
            ? "No products yet — add them under Menu, then come back to count your stock."
            : "No products match."}
        </p>
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {shown.map((r) => (
            <ProductCard
              key={r.menuItemId}
              row={r}
              open={openId === r.menuItemId}
              onToggle={() => setOpenId(openId === r.menuItemId ? null : r.menuItemId)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ProductCard({ row: r, open, onToggle }: { row: ProductStockRow; open: boolean; onToggle: () => void }) {
  const tracked = r.inventoryItemId != null;
  const soldOut = tracked && r.stockQty <= 0;

  return (
    // min-w-0: a grid item defaults to min-width:auto, so without this the card
    // refuses to shrink below the widest product name and the whole page scrolls
    // sideways on a phone — which is exactly where stock gets counted.
    <li className={`min-w-0 rounded-tile border bg-white ${soldOut ? "border-guava/40" : "border-plum-ink/10"}`}>
      <div className="flex items-center gap-3 p-3">
        {r.imageUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img src={r.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
        ) : (
          <div aria-hidden className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-plum-ink/5">
            📦
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-plum-ink">{r.name}</p>
          <p className="truncate text-xs text-plum-ink/45">
            {r.categoryName || "Uncategorised"} · {formatPeso(r.price)}
            {!r.isAvailable && <span className="text-guava"> · hidden from customers</span>}
          </p>
        </div>

        <div className="shrink-0 text-right">
          {tracked ? (
            <>
              <p className={`font-heading text-lg font-extrabold tabular-nums ${soldOut || r.low ? "text-guava" : "text-plum-ink"}`}>
                {r.stockQty}
              </p>
              <p className="text-[11px] text-plum-ink/45">{soldOut ? "sold out" : "on hand"}</p>
            </>
          ) : (
            <p className="text-[11px] text-plum-ink/40">not counted</p>
          )}
        </div>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
            open ? "border-brand-primary text-brand-primary" : "border-plum-ink/15 text-plum-ink/70"
          }`}
        >
          {tracked ? "Adjust" : "Count"} {open ? "▴" : "▾"}
        </button>
      </div>

      {open && (
        <div className="border-t border-plum-ink/10 bg-cream/40 p-3">
          {tracked ? <TrackedPanel row={r} /> : <StartTrackingPanel row={r} />}
        </div>
      )}
    </li>
  );
}

function StartTrackingPanel({ row: r }: { row: ProductStockRow }) {
  return (
    <form action={startTrackingProduct} className="space-y-2">
      <input type="hidden" name="menuItemId" value={r.menuItemId} />
      <p className="text-xs text-plum-ink/60">
        Count this product&apos;s own units. Every sale takes one off, and it comes off the
        storefront by itself when it reaches zero.
      </p>
      <div className="grid grid-cols-3 gap-2">
        <Field label="How many now" name="stockQty" placeholder="0" />
        <Field label="Warn me at" name="reorderLevel" placeholder="0" />
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-plum-ink/60">Unit</span>
          <input
            name="unit"
            defaultValue="pc"
            className="w-full rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm"
          />
        </label>
      </div>
      <button className="w-full rounded-lg bg-brand-primary px-3 py-2 text-xs font-semibold text-white">
        Start counting stock
      </button>
    </form>
  );
}

function TrackedPanel({ row: r }: { row: ProductStockRow }) {
  const soldOut = r.stockQty <= 0;
  return (
    <div className="space-y-2">
      {soldOut && (
        <p className="rounded-lg bg-guava/10 px-3 py-2 text-xs font-semibold text-guava">
          Sold out — customers can&apos;t order this. Add stock below to put it back on sale.
        </p>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {/* Restock. Doubles as the way back from sold out, which is why the
            action differs: relisting without saying how many arrived would put
            an empty shelf back on sale. */}
        <form action={soldOut ? restockAndRelist : recordRestock} className="rounded-lg border border-plum-ink/10 bg-white p-3">
          <p className="text-xs font-bold text-plum-ink">Add stock</p>
          <p className="mb-2 text-[11px] text-plum-ink/45">New delivery or restock.</p>
          <input type="hidden" name="id" value={r.inventoryItemId ?? ""} />
          <input type="hidden" name="menuItemId" value={r.menuItemId} />
          <div className="flex gap-1.5">
            <input
              name="qty"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder="Qty"
              className="w-20 rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm"
            />
            <input
              name="unitCostPesos"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              placeholder="Cost each (optional)"
              className="min-w-0 flex-1 rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm"
            />
          </div>
          <button className="mt-2 w-full rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-white">
            {soldOut ? "Add stock & put back on sale" : "Add stock"}
          </button>
        </form>

        <form action={recordCount} className="rounded-lg border border-plum-ink/10 bg-white p-3">
          <p className="text-xs font-bold text-plum-ink">Stock count</p>
          <p className="mb-2 text-[11px] text-plum-ink/45">Set to what you actually counted.</p>
          <input type="hidden" name="id" value={r.inventoryItemId ?? ""} />
          <input
            name="counted"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder={`Actual ${r.unit} on hand`}
            className="w-full rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm"
          />
          <button className="mt-2 w-full rounded-lg border border-plum-ink/20 px-3 py-1.5 text-xs font-semibold text-plum-ink">
            Set count
          </button>
        </form>

        <form action={recordWaste} className="rounded-lg border border-plum-ink/10 bg-white p-3">
          <p className="text-xs font-bold text-plum-ink">Damaged / lost</p>
          <p className="mb-2 text-[11px] text-plum-ink/45">Write off units you can&apos;t sell.</p>
          <input type="hidden" name="id" value={r.inventoryItemId ?? ""} />
          <input
            name="qty"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            placeholder="Qty"
            className="w-full rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm"
          />
          <button className="mt-2 w-full rounded-lg border border-guava/40 px-3 py-1.5 text-xs font-semibold text-guava">
            Write off
          </button>
        </form>

        <form action={setProductReorderLevel} className="rounded-lg border border-plum-ink/10 bg-white p-3">
          <p className="text-xs font-bold text-plum-ink">Low-stock warning</p>
          <p className="mb-2 text-[11px] text-plum-ink/45">Flag it when it drops this low.</p>
          <input type="hidden" name="id" value={r.inventoryItemId ?? ""} />
          <input
            name="reorderLevel"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            defaultValue={r.reorderLevel}
            className="w-full rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm"
          />
          <button className="mt-2 w-full rounded-lg border border-plum-ink/20 px-3 py-1.5 text-xs font-semibold text-plum-ink">
            Save level
          </button>
        </form>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-plum-ink/45">
        <span>
          Cost each {formatPeso(r.costPerUnit)} · stock value{" "}
          <strong className="text-plum-ink/70">{formatPeso(Math.round(r.stockQty * r.costPerUnit))}</strong>
        </span>
        <form
          action={stopTrackingProduct}
          onSubmit={(e) => {
            if (!confirm(`Stop counting stock for "${r.name}"? Its stock history will be removed.`)) {
              e.preventDefault();
            }
          }}
        >
          <input type="hidden" name="menuItemId" value={r.menuItemId} />
          <button className="font-semibold hover:text-guava">Stop counting</button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, name, placeholder }: { label: string; name: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold text-plum-ink/60">{label}</span>
      <input
        name={name}
        type="number"
        step="0.01"
        min="0"
        inputMode="decimal"
        placeholder={placeholder}
        className="w-full rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm"
      />
    </label>
  );
}
