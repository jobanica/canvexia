import { formatPeso } from "@/lib/money";

/**
 * Coupon/promotion discount math — the single source of truth for turning a
 * promo + a cart into pesos off. Pure and tiny so the diner preview and the
 * server-side order placement always agree (the server is authoritative).
 */

export type PromoType = "info" | "percent" | "amount" | "free_delivery" | "free_item" | "bogo";

export interface PromoRule {
  type: string; // PromoType (string from the DB)
  value: number; // percent (1-100) or centavos off
  freeItemId: string | null;
  minSpend: number; // centavos
}

export interface CartForPromo {
  subtotal: number; // centavos, gross items (no delivery)
  deliveryFee: number; // centavos
  lines: { menuItemId: string; unitPrice: number; quantity: number }[];
}

export type PromoComputed =
  | { ok: true; amount: number; label: string }
  | { ok: false; error: string };

/** Compute the discount (centavos off) a promo gives a cart, or why it can't. */
export function computePromo(promo: PromoRule, cart: CartForPromo): PromoComputed {
  if (promo.minSpend > 0 && cart.subtotal < promo.minSpend) {
    return { ok: false, error: `Spend at least ${formatPeso(promo.minSpend)} to use this code.` };
  }

  switch (promo.type) {
    case "percent": {
      const pct = Math.max(0, Math.min(100, Math.round(promo.value)));
      if (pct <= 0) return { ok: false, error: "This code isn't valid." };
      return { ok: true, amount: Math.round((cart.subtotal * pct) / 100), label: `${pct}% off` };
    }
    case "amount": {
      const amt = Math.min(cart.subtotal, Math.max(0, Math.round(promo.value)));
      if (amt <= 0) return { ok: false, error: "This code isn't valid." };
      return { ok: true, amount: amt, label: `${formatPeso(amt)} off` };
    }
    case "free_delivery": {
      if (cart.deliveryFee <= 0) return { ok: false, error: "No delivery fee to waive." };
      return { ok: true, amount: cart.deliveryFee, label: "Free delivery" };
    }
    case "free_item": {
      const line = cart.lines.find((l) => l.menuItemId === promo.freeItemId);
      if (!line) return { ok: false, error: "Add the promo item to your cart to use this code." };
      return { ok: true, amount: line.unitPrice, label: "Free item" };
    }
    case "bogo": {
      const line = cart.lines.find((l) => l.menuItemId === promo.freeItemId);
      const freeUnits = line ? Math.floor(line.quantity / 2) : 0;
      if (!line || freeUnits < 1) {
        return { ok: false, error: "Add 2 of the promo item to use this buy-1-get-1 code." };
      }
      return { ok: true, amount: freeUnits * line.unitPrice, label: "Buy 1 get 1 free" };
    }
    default:
      return { ok: false, error: "This promo doesn't have a redeemable code." };
  }
}

/** Short human-readable summary of an offer, for the diner Promos list. */
export function offerSummary(promo: PromoRule): string {
  switch (promo.type) {
    case "percent":
      return `${Math.round(promo.value)}% off`;
    case "amount":
      return `${formatPeso(promo.value)} off`;
    case "free_delivery":
      return "Free delivery";
    case "free_item":
      return "Free item";
    case "bogo":
      return "Buy 1 get 1 free";
    default:
      return "";
  }
}
