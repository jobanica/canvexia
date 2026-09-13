"use server";

import { systemDb } from "@/server/tenancy/scoped-db";
import { buildValidatedOrder, OrderValidationError } from "@/server/orders/build-order";
import { computePromo, type PromoRule } from "@/lib/promotions/compute";

/**
 * Coupon redemption — shared by the diner "Apply code" preview and the
 * server-side order placement. Money is always recomputed here from the real
 * menu prices; the client is never trusted.
 */

export interface ResolvedPromo {
  promoId: string;
  amount: number; // centavos off
  label: string; // e.g. "20% off"
}

type Built = { total: number; items: { menuItemId: string; quantity: number; unitPrice: number }[] };

/** Look up an active, non-expired promo by code (case-insensitive). */
export async function findPromoByCode(restaurantId: string, code: string) {
  const trimmed = code.trim();
  if (!trimmed) return null;
  try {
    const promos = await systemDb((tx) =>
      tx.promotion.findMany({
        where: { restaurantId, active: true },
        select: {
          id: true,
          code: true,
          type: true,
          value: true,
          freeItemId: true,
          minSpend: true,
          expiresAt: true,
        },
      }),
    );
    const now = Date.now();
    return (
      promos.find(
        (p) =>
          (p.code ?? "").trim().toLowerCase() === trimmed.toLowerCase() &&
          (!p.expiresAt || new Date(p.expiresAt).getTime() > now),
      ) ?? null
    );
  } catch {
    return null; // columns not migrated yet
  }
}

/** Resolve a code against an already-built order (used at placement time). */
export async function resolvePromo(
  restaurantId: string,
  code: string,
  built: Built,
  deliveryFee = 0,
): Promise<ResolvedPromo | null> {
  const promo = await findPromoByCode(restaurantId, code);
  if (!promo) return null;
  const rule: PromoRule = {
    type: promo.type,
    value: promo.value,
    freeItemId: promo.freeItemId,
    minSpend: promo.minSpend,
  };
  const res = computePromo(rule, {
    subtotal: built.total,
    deliveryFee,
    lines: built.items.map((i) => ({
      menuItemId: i.menuItemId,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
    })),
  });
  if (!res.ok || res.amount <= 0) return null;
  return { promoId: promo.id, amount: res.amount, label: res.label };
}

export type PreviewResult =
  | { ok: true; amount: number; label: string }
  | { ok: false; error: string };

/**
 * Diner-facing preview: validate a code against the current cart and return the
 * discount, WITHOUT placing the order. Resolves the restaurant by public slug.
 */
export async function previewPromoCode(input: {
  slug: string;
  code: string;
  lines: { itemId: string; quantity: number; modifierIds?: string[]; variantId?: string }[];
  deliveryFee?: number; // centavos — so free-delivery codes can be previewed on a delivery order
}): Promise<PreviewResult> {
  const code = (input.code ?? "").trim();
  if (!code) return { ok: false, error: "Enter a code." };

  const restaurant = await systemDb((tx) =>
    tx.restaurant.findFirst({ where: { slug: input.slug, status: "active" }, select: { id: true } }),
  );
  if (!restaurant) return { ok: false, error: "This restaurant is unavailable." };

  const promo = await findPromoByCode(restaurant.id, code);
  if (!promo) return { ok: false, error: "That code isn't valid or has expired." };

  let built: Built;
  try {
    built = await buildValidatedOrder(
      restaurant.id,
      input.lines.map((l) => ({
        itemId: l.itemId,
        quantity: l.quantity,
        modifierIds: l.modifierIds ?? [],
        variantId: l.variantId,
      })),
    );
  } catch (e) {
    if (e instanceof OrderValidationError) return { ok: false, error: e.message };
    return { ok: false, error: "Couldn't check your cart. Please try again." };
  }

  const res = computePromo(
    { type: promo.type, value: promo.value, freeItemId: promo.freeItemId, minSpend: promo.minSpend },
    {
      subtotal: built.total,
      deliveryFee: Math.max(0, Math.round(input.deliveryFee ?? 0)),
      lines: built.items.map((i) => ({
        menuItemId: i.menuItemId,
        unitPrice: i.unitPrice,
        quantity: i.quantity,
      })),
    },
  );
  if (!res.ok) return res;
  if (res.amount <= 0) return { ok: false, error: "This code doesn't apply to your cart." };
  return { ok: true, amount: res.amount, label: res.label };
}
