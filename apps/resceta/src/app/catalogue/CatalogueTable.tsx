"use client";

import { useState } from "react";
import { ArchiveButton, ProductForm } from "./ProductForm";
import { BatchPanel } from "./BatchPanel";
import type { CatalogueEditRow, CategoryRow } from "@/server/pharmacy/catalogue";

/**
 * The catalogue, editable one row at a time.
 *
 * ONE ROW OPEN AT A TIME. Sixteen fields per product across two hundred
 * products is a page nobody can read; an expanding row keeps the list scannable
 * and puts the form exactly where the thing being edited is.
 *
 * ARCHIVED ROWS ARE SHOWN, greyed. `catalogue()` in queries.ts filters them out
 * because that is what a counter should offer — but this is the screen where
 * archiving happens, and hiding the result would make it a one-way door with
 * SQL as the only undo.
 */
export function CatalogueTable({
  products,
  categories,
  showCost,
  canEditBatches,
  suppliers,
}: {
  products: CatalogueEditRow[];
  categories: CategoryRow[];
  /** Batch costs are margin, so they follow the same gate as everywhere else. */
  showCost: boolean;
  canEditBatches: boolean;
  suppliers: { id: string; name: string }[];
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");

  const needle = query.trim().toLowerCase();
  const shown = products.filter((p) => {
    // "" is every category; "none" is the products nobody has filed, which is
    // the list somebody opens this filter to find.
    if (category === "none" && p.categoryId !== null) return false;
    if (category && category !== "none" && p.categoryId !== category) return false;
    if (!needle) return true;
    return [p.name, p.genericName, p.sku, p.barcode]
      .filter(Boolean)
      .some((v) => v!.toLowerCase().includes(needle));
  });

  const unfiled = products.filter((p) => p.categoryId === null).length;

  // Products a counter cannot warn about, because nobody has said when to.
  const unset = products.filter((p) => p.isActive && p.reorderPoint === 0).length;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, generic, SKU or barcode"
          aria-label="Search the catalogue"
          className="min-w-0 flex-1 rounded-lg border border-white/15 px-3 py-2 text-sm"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Filter by category"
          className="rounded-lg border border-white/15 px-3 py-2 text-sm"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
          {unfiled > 0 && <option value="none">No category ({unfiled})</option>}
        </select>
        {!adding && (
          <button
            onClick={() => {
              setAdding(true);
              setEditing(null);
            }}
            className="rounded-lg brand-gradient px-4 py-2 text-sm font-medium text-white"
          >
            Add a product
          </button>
        )}
      </div>

      {/*
        A NUDGE, NOT A NAG, and only while it is true. Every product created
        before this screen existed has a reorder point of 0, which means the
        dashboard can only tell them about it after they have run out.
      */}
      {unset > 0 && !adding && (
        <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <strong>{unset}</strong> {unset === 1 ? "item has" : "items have"} no reorder point set,
          so the dashboard can only warn you once {unset === 1 ? "it has" : "they have"} run out.
          Open one and set &ldquo;Warn me at&rdquo;.
        </p>
      )}

      {adding && (
        <div className="mb-4 rounded-lg border border-white/15 bg-white/[0.04] p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">New product</h2>
          <ProductForm
            categories={categories}
            suppliers={suppliers}
            onDone={() => setAdding(false)}
          />
        </div>
      )}

      {products.length === 0 ? (
        <p className="rounded-lg border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6 text-sm text-slate-300">
          Nothing in the catalogue yet. Add a product here, or create one as you receive a
          delivery.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] backdrop-blur-xl">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.06] text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-4 py-2 text-right font-medium">Price</th>
                <th className="px-4 py-2 text-right font-medium">On hand</th>
                <th className="px-4 py-2 text-right font-medium">Warn at</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {shown.map((p) => (
                <FragmentRow
                  key={p.id}
                  p={p}
                  categories={categories}
                  showCost={showCost}
                  canEditBatches={canEditBatches}
                  open={editing === p.id}
                  onOpen={() => {
                    setEditing(editing === p.id ? null : p.id);
                    setAdding(false);
                  }}
                  onClose={() => setEditing(null)}
                />
              ))}
            </tbody>
          </table>
          {shown.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              Nothing matches &ldquo;{query}&rdquo;.
            </p>
          )}
        </div>
      )}
    </>
  );
}

function FragmentRow({
  p,
  categories,
  showCost,
  canEditBatches,
  open,
  onOpen,
  onClose,
}: {
  p: CatalogueEditRow;
  categories: CategoryRow[];
  showCost: boolean;
  canEditBatches: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  return (
    <>
      <tr className={p.isActive ? "" : "bg-white/[0.06] text-slate-500"}>
        <td className="px-4 py-2">
          <span className="font-medium">{p.name}</span>
          {p.requiresPrescription && (
            <span className="ml-2 rounded bg-amber-500/15 px-1.5 py-0.5 text-[0.65rem] font-semibold uppercase text-amber-200">
              Rx
            </span>
          )}
          {!p.isActive && (
            <span className="ml-2 rounded bg-white/15 px-1.5 py-0.5 text-[0.65rem] uppercase">
              Archived
            </span>
          )}
          {(p.genericName || p.strength || p.form) && (
            <span className="block text-xs text-slate-500">
              {[p.genericName, p.strength, p.form].filter(Boolean).join(" · ")}
            </span>
          )}
        </td>
        <td className="px-4 py-2 text-right tabular-nums">
          ₱{(p.priceCentavos / 100).toFixed(2)}
        </td>
        <td className="px-4 py-2 text-right tabular-nums">{p.onHand}</td>
        <td className="px-4 py-2 text-right tabular-nums">
          {p.reorderPoint === 0 ? (
            // "0" reads as a configured threshold. It is the absence of one.
            <span className="text-amber-300">not set</span>
          ) : (
            p.reorderPoint
          )}
        </td>
        <td className="px-4 py-2 text-right whitespace-nowrap">
          <button
            onClick={onOpen}
            className="mr-3 text-xs font-medium text-slate-300 underline hover:text-white"
          >
            {open ? "Close" : "Edit"}
          </button>
          <ArchiveButton product={p} />
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={5} className="bg-white/[0.06] px-4 py-4">
            <ProductForm product={p} categories={categories} onDone={onClose} />
            {/*
              THE EXPIRY DATES LIVE HERE, under the product, because this is
              where somebody goes looking for them — and there is no expiry on
              a product to show instead.
            */}
            <BatchPanel
              batches={p.batches}
              productName={p.name}
              priceCentavos={p.priceCentavos}
              showCost={showCost}
              canEdit={canEditBatches}
            />
          </td>
        </tr>
      )}
    </>
  );
}
