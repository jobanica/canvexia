"use client";

import { useMemo, useState } from "react";
import { formatPeso } from "@/lib/money";
import { setRecipeComponent } from "@/server/inventory/actions";
import type { RecipeRow } from "@/server/inventory/queries";

interface Ingredient {
  id: string;
  name: string;
  unit: string;
  costPerUnit: number;
}

/**
 * What each dish is made of.
 *
 * This is the link that makes a sale move stock: sell one adobo and every
 * ingredient listed against it comes off by the quantity given. Until this
 * screen existed, the deduction engine and the data model were both in place
 * and there was nothing anywhere to type a recipe into — so no restaurant's
 * ingredients ever moved.
 *
 * Dishes without a recipe sort first. An empty recipe is the thing that needs
 * attention, and a list that leads with what's already done gives an owner
 * nowhere to start.
 */
export function RecipeEditor({
  rows,
  ingredients,
}: {
  rows: RecipeRow[];
  ingredients: Ingredient[];
}) {
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [onlyMissing, setOnlyMissing] = useState(false);

  const withRecipe = rows.filter((r) => r.components.length > 0).length;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (onlyMissing && r.components.length > 0) return false;
        if (!q) return true;
        return r.name.toLowerCase().includes(q) || r.categoryName.toLowerCase().includes(q);
      })
      .sort((a, b) => a.components.length - b.components.length || (a.name < b.name ? -1 : 1));
  }, [rows, query, onlyMissing]);

  if (ingredients.length === 0) {
    return (
      <div className="rounded-tile border border-mango/40 bg-mango/10 p-5">
        <p className="font-heading font-bold text-plum-ink">Add your ingredients first</p>
        <p className="mt-1 text-sm text-plum-ink/70">
          A recipe is a list of ingredients and how much of each a dish uses, so there has to be
          something to pick from. Add them under <strong>Inventory → Ingredients</strong>, then come
          back and build your recipes here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-plum-ink/15 bg-white px-3 py-2">
          <span className="text-plum-ink/40" aria-hidden>🔍</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search dishes…"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-plum-ink/40"
          />
        </div>
        <div className="flex rounded-lg bg-plum-ink/5 p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setOnlyMissing(false)}
            className={`rounded-md px-3 py-1.5 ${!onlyMissing ? "bg-white text-plum-ink shadow-sm" : "text-plum-ink/55"}`}
          >
            All ({rows.length})
          </button>
          <button
            type="button"
            onClick={() => setOnlyMissing(true)}
            className={`rounded-md px-3 py-1.5 ${onlyMissing ? "bg-white text-plum-ink shadow-sm" : "text-plum-ink/55"}`}
          >
            No recipe ({rows.length - withRecipe})
          </button>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="rounded-tile border border-plum-ink/10 bg-white p-8 text-center text-sm text-plum-ink/45">
          {rows.length === 0 ? "No dishes on the menu yet." : "Nothing matches."}
        </p>
      ) : (
        <ul className="space-y-2">
          {shown.map((r) => (
            <DishRow
              key={r.menuItemId}
              row={r}
              ingredients={ingredients}
              open={openId === r.menuItemId}
              onToggle={() => setOpenId(openId === r.menuItemId ? null : r.menuItemId)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function DishRow({
  row: r,
  ingredients,
  open,
  onToggle,
}: {
  row: RecipeRow;
  ingredients: Ingredient[];
  open: boolean;
  onToggle: () => void;
}) {
  const has = r.components.length > 0;
  // Margin only means anything once a recipe exists; with no ingredients the
  // cost is zero and "100% margin" would be a lie told confidently.
  const margin = has && r.price > 0 ? Math.round(((r.price - r.recipeCost) / r.price) * 100) : null;

  const used = new Set(r.components.map((c) => c.inventoryItemId));
  const addable = ingredients.filter((i) => !used.has(i.id));

  return (
    <li className="min-w-0 rounded-tile border border-plum-ink/10 bg-white">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-plum-ink">{r.name}</p>
          <p className="truncate text-xs text-plum-ink/50">
            {r.categoryName || "Uncategorised"} · {formatPeso(r.price)}
          </p>
        </div>
        {has ? (
          <div className="shrink-0 text-right">
            <p className="text-sm font-semibold tabular-nums text-plum-ink">
              {formatPeso(r.recipeCost)}
            </p>
            <p className="text-[11px] text-plum-ink/45">
              {r.components.length} ingredient{r.components.length === 1 ? "" : "s"}
              {margin != null && ` · ${margin}% margin`}
            </p>
          </div>
        ) : (
          <span className="shrink-0 rounded-full bg-mango/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-plum-ink">
            No recipe
          </span>
        )}
        <span className="shrink-0 text-plum-ink/30" aria-hidden>{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="border-t border-plum-ink/10 bg-cream/40 p-3">
          {!has && (
            <p className="mb-2 text-xs text-plum-ink/60">
              Selling this dish moves no stock yet. Add what one serving uses.
            </p>
          )}

          {r.components.length > 0 && (
            <ul className="mb-3 space-y-1.5">
              {r.components.map((c) => (
                <li key={c.inventoryItemId}>
                  {/* Saving zero removes the ingredient — the same field does
                      both, so there's no separate delete to hunt for. */}
                  <form action={setRecipeComponent} className="flex items-center gap-2">
                    <input type="hidden" name="menuItemId" value={r.menuItemId} />
                    <input type="hidden" name="inventoryItemId" value={c.inventoryItemId} />
                    <span className="min-w-0 flex-1 truncate text-sm text-plum-ink">{c.name}</span>
                    <input
                      name="quantity"
                      type="number"
                      step="0.001"
                      min="0"
                      inputMode="decimal"
                      defaultValue={c.quantity}
                      className="w-20 rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm tabular-nums"
                    />
                    <span className="w-10 shrink-0 text-xs text-plum-ink/50">{c.unit}</span>
                    <span className="w-16 shrink-0 text-right text-xs tabular-nums text-plum-ink/50">
                      {formatPeso(c.cost)}
                    </span>
                    <button className="shrink-0 rounded-lg border border-plum-ink/15 px-2.5 py-1.5 text-xs font-semibold">
                      Save
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          {addable.length > 0 ? (
            <form action={setRecipeComponent} className="flex items-center gap-2 border-t border-plum-ink/10 pt-3">
              <input type="hidden" name="menuItemId" value={r.menuItemId} />
              <select
                name="inventoryItemId"
                required
                defaultValue=""
                className="min-w-0 flex-1 rounded-lg border border-plum-ink/15 bg-white px-2 py-1.5 text-sm"
              >
                <option value="" disabled>Add an ingredient…</option>
                {addable.map((i) => (
                  <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                ))}
              </select>
              <input
                name="quantity"
                type="number"
                step="0.001"
                min="0"
                inputMode="decimal"
                placeholder="Qty"
                required
                className="w-20 rounded-lg border border-plum-ink/15 px-2 py-1.5 text-sm"
              />
              <button className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold btn-brand">
                Add
              </button>
            </form>
          ) : (
            <p className="border-t border-plum-ink/10 pt-3 text-xs text-plum-ink/45">
              Every ingredient is already in this recipe.
            </p>
          )}
        </div>
      )}
    </li>
  );
}
