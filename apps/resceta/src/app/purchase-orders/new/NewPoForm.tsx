"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { suggestedOrder } from "@/lib/pharmacy/alerts";
import { searchProducts } from "@/lib/pharmacy/counter-search";
import { peso } from "@/lib/money";
import { IconSearch } from "@/components/Icons";
import { raisePurchaseOrder, type PoState } from "../actions";

const IDLE: PoState = { status: "idle" };
const FIELD =
  "w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-violet-400/60 focus:outline-none";

export interface PoProduct {
  id: string;
  name: string;
  sku: string | null;
  barcode: string | null;
  genericName: string | null;
  unit: string;
  /** What the last delivery of this cost, as the starting price. */
  lastCostCentavos: number;
  onHand: number;
  reorderPoint: number;
}

interface Line {
  key: number;
  productId: string | null;
  /** What is typed in the search box until a product is chosen. */
  query: string;
  quantity: string;
  unitCost: string;
}

/**
 * Raising an order.
 *
 * SEARCH, NOT A DROPDOWN. Every line used to be a `<select>` holding the whole
 * catalogue. That is fine at forty products and unusable at 1,886 — the same
 * wall the counter hit, for the same reason, and a buyer working an order of
 * forty lines hits it forty times.
 *
 * THE COST DEFAULTS TO WHAT THE LAST DELIVERY COST. Typing a price for every
 * line of a forty-line order is how a pharmacy stops raising orders; the last
 * cost is nearly always right and is always visible to correct.
 *
 * THE LOW LIST IS THE OTHER HALF. Most orders are "what am I about to run out
 * of", so that list is on the page with an Add beside each row, rather than
 * behind a search somebody has to already know the answer to.
 *
 * Lines are added and removed in the browser and submitted as parallel arrays.
 * A server round-trip per line is unusable on a connection that drops.
 */
export function NewPoForm({
  products,
  suppliers,
  prefillLow = false,
}: {
  products: PoProduct[];
  suppliers: { id: string; name: string }[];
  /**
   * Arrived from the alerts page's Create PO button, so the low-stock lines
   * are already the answer. Without this the button lands on an empty form and
   * the buyer retypes the list they were just looking at.
   */
  prefillLow?: boolean;
}) {
  const [state, action, pending] = useActionState(raisePurchaseOrder, IDLE);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  // Out of stock counts even with no reorder point set — the same rule the
  // alerts page uses, and the reason an imported catalogue is not all invisible.
  const low = useMemo(
    () =>
      products
        .filter((p) => p.onHand === 0 || (p.onHand <= p.reorderPoint && p.reorderPoint > 0))
        .sort((a, b) => a.onHand - b.onHand || a.name.localeCompare(b.name)),
    [products],
  );

  const nextKey = useRef(1);
  const lineFor = (p: PoProduct): Line => ({
    key: nextKey.current++,
    productId: p.id,
    query: p.name,
    quantity: String(suggestedOrder(p.onHand, p.reorderPoint)),
    unitCost: p.lastCostCentavos > 0 ? (p.lastCostCentavos / 100).toFixed(2) : "",
  });

  const [lines, setLines] = useState<Line[]>(() =>
    prefillLow && low.length > 0
      ? low.map((p) => lineFor(p))
      : [{ key: nextKey.current++, productId: null, query: "", quantity: "1", unitCost: "" }],
  );

  const chosen = new Set(lines.map((l) => l.productId).filter(Boolean) as string[]);

  function addProduct(p: PoProduct) {
    setLines((ls) => {
      // Already on the order: bump its quantity rather than opening a second
      // line for the same product, which a supplier reads as a mistake.
      const at = ls.findIndex((l) => l.productId === p.id);
      if (at >= 0) {
        return ls.map((l, i) =>
          i === at
            ? { ...l, quantity: String((Number(l.quantity) || 0) + suggestedOrder(p.onHand, p.reorderPoint)) }
            : l,
        );
      }
      // An untouched empty line is filled rather than left above the new one.
      const blank = ls.findIndex((l) => l.productId === null && l.query.trim() === "");
      const line = lineFor(p);
      if (blank >= 0) return ls.map((l, i) => (i === blank ? { ...line, key: l.key } : l));
      return [...ls, line];
    });
  }

  const total = lines.reduce((sum, l) => {
    const qty = Number(l.quantity) || 0;
    const cost = Math.round((Number(l.unitCost.replace(/[^0-9.]/g, "")) || 0) * 100);
    return sum + qty * cost;
  }, 0);

  const ready = lines.filter((l) => l.productId !== null);

  return (
    <form action={action} className="space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="text-slate-300">Supplier</span>
            <select name="supplierId" className={`mt-1 ${FIELD}`} defaultValue="">
              <option value="">— select later —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-slate-300">Expected date</span>
            <input type="date" name="expectedDate" className={`mt-1 ${FIELD}`} />
          </label>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-white">Items</p>
            {total > 0 && (
              <p className="text-sm text-slate-300">
                {ready.length} line{ready.length === 1 ? "" : "s"} ·{" "}
                <strong className="text-white">{peso(total)}</strong>
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={() =>
              setLines((ls) => [
                ...ls,
                { key: nextKey.current++, productId: null, query: "", quantity: "1", unitCost: "" },
              ])
            }
            className="rounded-xl border border-white/15 bg-white/[0.06] px-3.5 py-2 text-sm text-slate-200 hover:bg-white/10"
          >
            + Add line
          </button>

          <div className="mt-3 space-y-2">
            {lines.map((line, i) => (
              <LineRow
                key={line.key}
                line={line}
                products={products}
                chosen={chosen}
                showHeader={i === 0}
                onChange={(next) =>
                  setLines((ls) => ls.map((l) => (l.key === line.key ? { ...l, ...next } : l)))
                }
                onRemove={() => setLines((ls) => ls.filter((l) => l.key !== line.key))}
                pickedName={line.productId ? (byId.get(line.productId)?.name ?? "") : ""}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── WHAT IS ABOUT TO RUN OUT ───────────────────────────────────── */}
      {low.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-4">
          <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-200">
            <span aria-hidden>⚠</span>
            Low in inventory ({low.length} to reorder)
          </p>
          <ul className="max-h-96 space-y-1.5 overflow-y-auto pr-1">
            {low.slice(0, 300).map((p) => {
              const on = chosen.has(p.id);
              return (
                <li
                  key={p.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-black/20 px-3 py-2"
                >
                  <span className="text-sm font-medium text-white">{p.name}</span>
                  <span className="text-xs text-slate-400">
                    {p.onHand} on hand · reorder at {p.reorderPoint} · short{" "}
                    {suggestedOrder(p.onHand, p.reorderPoint)} {p.unit}
                  </span>
                  <button
                    type="button"
                    onClick={() => addProduct(p)}
                    className="ml-auto rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs text-slate-100 hover:bg-white/10"
                  >
                    {on ? "+ Add more" : "+ Add"}
                  </button>
                </li>
              );
            })}
          </ul>
          {low.length > 300 && (
            <p className="mt-2 text-xs text-amber-300/80">
              Showing the 300 shortest. Use the search above for the rest.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={pending || ready.length === 0}
          className="rounded-xl brand-gradient px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {pending ? "Raising…" : `Raise the order (${ready.length})`}
        </button>
        {state.status === "error" && <span className="text-sm text-rose-300">{state.message}</span>}
        {lines.length > ready.length && (
          <span className="text-xs text-slate-400">
            {/* A half-typed line is dropped, not an error — the buyer is mid-thought. */}
            {lines.length - ready.length} line
            {lines.length - ready.length === 1 ? "" : "s"} with no product chosen will be left
            out.
          </span>
        )}
      </div>
    </form>
  );
}

function LineRow({
  line,
  products,
  chosen,
  showHeader,
  onChange,
  onRemove,
  pickedName,
}: {
  line: Line;
  products: PoProduct[];
  chosen: Set<string>;
  showHeader: boolean;
  onChange: (next: Partial<Line>) => void;
  onRemove: () => void;
  pickedName: string;
}) {
  const [open, setOpen] = useState(false);

  const hits = useMemo(() => {
    if (!open || line.query.trim() === "") return [];
    return searchProducts(products, line.query, 8);
  }, [open, line.query, products]);

  return (
    <div>
      {showHeader && (
        <div className="mb-1 hidden gap-2 px-1 text-xs text-slate-400 sm:grid sm:grid-cols-[1fr_6rem_8rem_2rem]">
          <span />
          <span>Qty</span>
          <span>Unit cost ₱</span>
          <span />
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-[1fr_6rem_8rem_2rem]">
        <div className="relative">
          {/*
            The chosen product travels as a hidden field. The visible box is a
            search, and a search box submitted as the answer is how a typo
            becomes an order line for nothing.
          */}
          {line.productId && <input type="hidden" name="productId" value={line.productId} />}
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={line.query}
            onChange={(e) => {
              onChange({ query: e.target.value, productId: null });
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => window.setTimeout(() => setOpen(false), 150)}
            placeholder="Search product…"
            aria-label="Search for a product"
            className={`${FIELD} pl-10 ${
              line.productId ? "border-violet-400/40 bg-violet-500/10" : ""
            }`}
          />
          {open && hits.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-white/15 bg-[#241d3a] p-1 shadow-xl">
              {hits.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange({
                        productId: p.id,
                        query: p.name,
                        quantity: String(suggestedOrder(p.onHand, p.reorderPoint) || 1),
                        unitCost:
                          p.lastCostCentavos > 0 ? (p.lastCostCentavos / 100).toFixed(2) : "",
                      });
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-white/10"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-white">{p.name}</span>
                      <span className="block truncate text-xs text-slate-400">
                        {p.onHand} {p.unit} on hand
                        {p.lastCostCentavos > 0 && ` · last ${peso(p.lastCostCentavos)}`}
                        {chosen.has(p.id) && " · already on this order"}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <input
          name={line.productId ? "quantity" : undefined}
          type="text"
          inputMode="numeric"
          value={line.quantity}
          onChange={(e) => onChange({ quantity: e.target.value })}
          placeholder="Qty"
          aria-label="Quantity"
          className={`${FIELD} text-right tabular-nums`}
        />
        <input
          name={line.productId ? "unitCost" : undefined}
          type="text"
          inputMode="decimal"
          value={line.unitCost}
          onChange={(e) => onChange({ unitCost: e.target.value })}
          placeholder="0.00"
          aria-label="Unit cost"
          className={`${FIELD} text-right tabular-nums`}
        />
        <button
          type="button"
          onClick={onRemove}
          className="self-center text-slate-500 hover:text-rose-300"
          aria-label={`Remove ${pickedName || "line"}`}
        >
          🗑
        </button>
      </div>
    </div>
  );
}
