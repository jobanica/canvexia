"use client";

import { useState, type ReactNode } from "react";

/**
 * Products vs ingredients.
 *
 * Two ways of keeping stock that don't mix on screen: a shop counts the things
 * it sells, a kitchen counts what it cooks with, and plenty of places do both.
 * Stacking the lists would make whichever one you don't use a wall to scroll
 * past every time.
 *
 * Products lead because a business that sells finished goods has stock the day
 * it opens; recipes are something you set up later, if at all.
 */
export function InventoryTabs({
  products,
  ingredients,
  productCount,
  ingredientCount,
}: {
  products: ReactNode;
  ingredients: ReactNode;
  productCount: number;
  ingredientCount: number;
}) {
  const [tab, setTab] = useState<"products" | "ingredients">("products");

  return (
    <div className="space-y-3">
      <div className="flex gap-1 rounded-xl bg-plum-ink/5 p-1 text-sm font-semibold">
        <Tab active={tab === "products"} onClick={() => setTab("products")}>
          📦 Products ({productCount})
        </Tab>
        <Tab active={tab === "ingredients"} onClick={() => setTab("ingredients")}>
          🥕 Ingredients ({ingredientCount})
        </Tab>
      </div>

      {/* Both are rendered; the inactive one is hidden rather than unmounted so
          switching back doesn't lose a half-typed count. */}
      <div className={tab === "products" ? "" : "hidden"}>{products}</div>
      <div className={tab === "ingredients" ? "" : "hidden"}>{ingredients}</div>
    </div>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 rounded-lg px-3 py-2 ${active ? "bg-white text-plum-ink shadow-sm" : "text-plum-ink/55"}`}
    >
      {children}
    </button>
  );
}
