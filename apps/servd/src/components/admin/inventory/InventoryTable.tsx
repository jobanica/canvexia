"use client";

import { useMemo, useState } from "react";
import { formatPeso } from "@/lib/money";
import {
  deleteInventoryItem,
  recordWaste,
  recordCount,
  recordRestock,
  recordWithdrawal,
} from "@/server/inventory/actions";

export interface InventoryRow {
  id: string;
  name: string;
  unit: string;
  stockQty: number;
  costPerUnit: number; // centavos
  reorderLevel: number;
  low: boolean;
  supplierName: string | null;
}

/**
 * The ingredient list.
 *
 * Cards, not a table. This is counted standing at a shelf with a phone in one
 * hand, and the six-column table this replaced pushed its most important column
 * — the button that opens the adjustments — off the right-hand edge. You could
 * see your stock and not reach the thing that changes it.
 *
 * Same shape as the Products tab next door, so the two halves of inventory
 * behave identically.
 */
export function InventoryTable({ items }: { items: InventoryRow[] }) {
  const [query, setQuery] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (lowOnly && !i.low) return false;
      if (!q) return true;
      return i.name.toLowerCase().includes(q) || (i.supplierName ?? "").toLowerCase().includes(q);
    });
  }, [items, query, lowOnly]);

  const lowCount = items.filter((i) => i.low).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-plum-ink/15 bg-white px-3 py-2">
          <span className="text-plum-ink/40" aria-hidden>🔍</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search ingredients…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-plum-ink/40"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear search" className="text-plum-ink/40">
              ×
            </button>
          )}
        </div>
        <div className="flex rounded-lg bg-plum-ink/5 p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setLowOnly(false)}
            className={`rounded-md px-3 py-1.5 ${!lowOnly ? "bg-white text-plum-ink shadow-sm" : "text-plum-ink/55"}`}
          >
            All ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setLowOnly(true)}
            className={`rounded-md px-3 py-1.5 ${lowOnly ? "bg-white text-guava shadow-sm" : "text-plum-ink/55"}`}
          >
            Low ({lowCount})
          </button>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-tile border border-plum-ink/10 bg-white p-8 text-center text-sm text-plum-ink/45">
          {items.length === 0
            ? "No ingredients yet — add your first one below."
            : "No ingredients match your search."}
        </p>
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {shown.map((i) => (
            <IngredientCard
              key={i.id}
              item={i}
              open={openId === i.id}
              onToggle={() => setOpenId(openId === i.id ? null : i.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function IngredientCard({
  item: i,
  open,
  onToggle,
}: {
  item: InventoryRow;
  open: boolean;
  onToggle: () => void;
}) {
  const out = i.stockQty <= 0;

  return (
    // min-w-0: a grid item won't shrink below its content without it, and a
    // long ingredient name would push the whole page sideways.
    <li className={`min-w-0 rounded-tile border bg-white ${i.low ? "border-guava/40" : "border-plum-ink/10"}`}>
      <div className="flex items-center gap-3 p-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-semibold text-plum-ink">
            <span className="truncate">{i.name}</span>
            {i.low && (
              <span className="shrink-0 rounded-full bg-guava/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-guava">
                Low
              </span>
            )}
          </p>
          <p className="truncate text-xs text-plum-ink/45">
            {i.supplierName ?? "No supplier"} · {formatPeso(i.costPerUnit)}/{i.unit}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className={`font-heading text-lg font-extrabold tabular-nums ${i.low ? "text-guava" : "text-plum-ink"}`}>
            {i.stockQty}
          </p>
          <p className="text-[11px] text-plum-ink/45">{out ? "none left" : i.unit}</p>
        </div>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold ${
            open ? "border-brand-primary text-brand-primary" : "border-plum-ink/15 text-plum-ink/70"
          }`}
        >
          Adjust {open ? "▴" : "▾"}
        </button>
      </div>

      {open && (
        <div className="space-y-2 border-t border-plum-ink/10 bg-cream/40 p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {/* Add stock — the one action that was missing from this panel
                entirely: you could take stock out four ways and never put any
                back without raising a purchase order. */}
            <form action={recordRestock} className="rounded-lg border border-plum-ink/10 bg-white p-3">
              <p className="text-xs font-bold text-plum-ink">Add stock</p>
              <p className="mb-2 text-[11px] text-plum-ink/45">New delivery or restock.</p>
              <input type="hidden" name="id" value={i.id} />
              <div className="flex gap-1.5">
                <Num name="qty" placeholder="Qty" className="w-20" />
                <Num name="unitCostPesos" placeholder="Cost each (optional)" className="min-w-0 flex-1" />
              </div>
              <Submit className="bg-brand-primary text-white">Add stock</Submit>
            </form>

            <form action={recordWithdrawal} className="rounded-lg border border-plum-ink/10 bg-white p-3">
              <p className="text-xs font-bold text-plum-ink">Take out</p>
              <p className="mb-2 text-[11px] text-plum-ink/45">Prep, staff meals, transfers.</p>
              <input type="hidden" name="id" value={i.id} />
              <div className="flex gap-1.5">
                <Num name="qty" placeholder={i.unit} className="w-20" />
                <input
                  name="note"
                  placeholder="What for?"
                  className="min-w-0 flex-1 rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm"
                />
              </div>
              <Submit className="border border-plum-ink/20 text-plum-ink">Take out</Submit>
            </form>

            <form action={recordCount} className="rounded-lg border border-plum-ink/10 bg-white p-3">
              <p className="text-xs font-bold text-plum-ink">Stock count</p>
              <p className="mb-2 text-[11px] text-plum-ink/45">Set to what you counted.</p>
              <input type="hidden" name="id" value={i.id} />
              <Num name="counted" placeholder={`Actual ${i.unit} on hand`} className="w-full" />
              <Submit className="border border-plum-ink/20 text-plum-ink">Set count</Submit>
            </form>

            <form action={recordWaste} className="rounded-lg border border-plum-ink/10 bg-white p-3">
              <p className="text-xs font-bold text-plum-ink">Log waste</p>
              <p className="mb-2 text-[11px] text-plum-ink/45">Spoiled or discarded.</p>
              <input type="hidden" name="id" value={i.id} />
              <Num name="qty" placeholder={`Qty in ${i.unit}`} className="w-full" />
              <Submit className="border border-guava/40 text-guava">Log waste</Submit>
            </form>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[11px] text-plum-ink/45">
            <span>
              Stock value{" "}
              <strong className="text-plum-ink/70">
                {formatPeso(Math.round(i.stockQty * i.costPerUnit))}
              </strong>
            </span>
            <form
              action={deleteInventoryItem}
              onSubmit={(e) => {
                if (!confirm(`Delete "${i.name}" from inventory? This can't be undone.`)) {
                  e.preventDefault();
                }
              }}
            >
              <input type="hidden" name="id" value={i.id} />
              <button className="font-semibold hover:text-guava">Delete ingredient</button>
            </form>
          </div>
        </div>
      )}
    </li>
  );
}

function Num({
  name,
  placeholder,
  className = "",
}: {
  name: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <input
      name={name}
      type="number"
      step="0.01"
      min="0"
      inputMode="decimal"
      placeholder={placeholder}
      className={`rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm ${className}`}
    />
  );
}

function Submit({ children, className }: { children: React.ReactNode; className: string }) {
  return (
    <button className={`mt-2 w-full rounded-lg px-3 py-1.5 text-xs font-semibold ${className}`}>
      {children}
    </button>
  );
}
