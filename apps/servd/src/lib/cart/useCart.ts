"use client";

import { useCallback, useEffect, useState } from "react";
import type { CartLine } from "./types";
import { replaceCartLine } from "./edit-line";

/**
 * Cart state for the diner, persisted in localStorage so a refresh (or coming
 * back after a phone lock) doesn't lose the order-in-progress. The storage key
 * is scoped per restaurant + table, so two tables on one device never mix.
 *
 * The cart is intentionally client-only until checkout — the server re-validates
 * and computes the authoritative total when the order is placed (Phase 5).
 */
export function useCart(restaurantId: string, tableToken: string) {
  const storageKey = `servd-cart:${restaurantId}:${tableToken}`;
  const [lines, setLines] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Load once on mount (client only).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setLines(JSON.parse(raw) as CartLine[]);
    } catch {
      // corrupt/unavailable storage — start empty
    }
    setHydrated(true);
  }, [storageKey]);

  // Persist on change (after hydration so we don't clobber stored data).
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(lines));
    } catch {
      /* ignore quota/availability errors */
    }
  }, [lines, hydrated, storageKey]);

  const addLine = useCallback((line: CartLine) => {
    setLines((prev) => [...prev, line]);
  }, []);

  const setQty = useCallback((lineId: string, quantity: number) => {
    setLines((prev) =>
      quantity <= 0
        ? prev.filter((l) => l.lineId !== lineId)
        : prev.map((l) => (l.lineId === lineId ? { ...l, quantity } : l)),
    );
  }, []);

  /** Replace a line with an edited version of itself, in place. */
  const replaceLine = useCallback((line: CartLine) => {
    setLines((prev) => replaceCartLine(prev, line));
  }, []);

  const removeLine = useCallback((lineId: string) => {
    setLines((prev) => prev.filter((l) => l.lineId !== lineId));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  return { lines, hydrated, addLine, replaceLine, setQty, removeLine, clear };
}
