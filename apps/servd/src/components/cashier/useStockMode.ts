"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { DinerCategory, DinerItem } from "@/lib/cart/types";
import {
  applyStockToggle,
  nextAvailability,
  stockToggleMessage,
} from "@/lib/menu/stock-toggle";
import { setPosItemAvailability } from "@/server/menu/pos-availability";

/**
 * The till's sold-out switch, shared by both POS item pickers.
 *
 * Owns the mode flag, which tile is mid-save, and the one-line result. The
 * menu it patches belongs to the caller — the modal already holds it — so the
 * change shows on the tile the moment the server says yes, without refetching
 * the whole menu and losing the cashier's scroll position mid-service.
 */
export function useStockMode(setMenu: Dispatch<SetStateAction<DinerCategory[] | null>>) {
  const [stockMode, setStockMode] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  /** Leaving stock mode clears the note — it described the last tap, not the screen. */
  function toggleMode() {
    setStockMode((on) => !on);
    setNote(null);
  }

  async function toggleStock(item: DinerItem) {
    // One at a time. Two taps racing would leave the tile showing whichever
    // reply landed last, which isn't necessarily whichever write landed last.
    if (busyId) return;
    const available = nextAvailability(item);
    setBusyId(item.id);
    setNote(null);
    let result;
    try {
      result = await setPosItemAvailability(item.id, available);
    } catch {
      result = { error: "Couldn't reach the server. Check your connection." };
    }
    setBusyId(null);
    if ("error" in result) {
      // Nothing is patched on a failure — the tile keeps showing what the
      // database actually holds rather than what the tap hoped for.
      setNote(result.error);
      return;
    }
    setMenu((prev) => applyStockToggle(prev, item.id, available));
    setNote(stockToggleMessage(item.name, item, available));
  }

  return { stockMode, busyId, note, toggleMode, toggleStock };
}
