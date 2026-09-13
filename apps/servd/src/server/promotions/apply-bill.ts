"use server";

import { z } from "zod";
import { systemDb, tenantDb } from "@/server/tenancy/scoped-db";
import { notifyOrdersChanged } from "@/server/realtime/notify";
import { findPromoByCode } from "@/server/promotions/redeem";
import { getActivePromotions } from "@/server/promotions/queries";
import { computePromo, offerSummary } from "@/lib/promotions/compute";

/**
 * Diner-applied coupon at the bill stage (dine-in, after eating). No session —
 * authorized by the table token in the URL. The discount is computed server-
 * side from the real order totals and written onto the table's outstanding
 * orders as discountAmount/discountLabel, so the cashier board AND the online
 * checkout both charge the discounted amount. Re-applying recomputes from the
 * gross totals, so codes never stack.
 */

const schema = z.object({
  slug: z.string().min(1),
  tableToken: z.string().min(1),
  code: z.string().trim().max(24).optional(),
});

/** Marks a discount as diner-applied so we only ever clear our own. */
const PROMO_PREFIX = "Promo";

async function resolveTable(slug: string, tableToken: string) {
  return systemDb(async (tx) => {
    const restaurant = await tx.restaurant.findFirst({
      where: { slug, status: "active" },
      select: { id: true },
    });
    if (!restaurant) return null;
    const table = await tx.table.findFirst({
      where: { restaurantId: restaurant.id, qrToken: tableToken },
      select: { id: true },
    });
    if (!table) return null;
    return { restaurantId: restaurant.id, tableId: table.id };
  });
}

/** The table's outstanding (unpaid, open) orders with the lines a promo needs. */
function outstandingOrders(restaurantId: string, tableId: string) {
  return tenantDb(restaurantId, (tx) =>
    tx.order.findMany({
      where: {
        tableId,
        status: { in: ["new", "preparing", "done"] },
        paymentStatus: { in: ["unpaid", "failed"] },
      },
      select: {
        id: true,
        total: true,
        discountLabel: true,
        items: { select: { menuItemId: true, quantity: true, unitPrice: true } },
      },
    }),
  );
}

export interface RedeemableCode {
  code: string;
  title: string;
  summary: string; // e.g. "20% off"
  minSpend: number; // centavos, 0 = none
}

/** The restaurant's active, redeemable coupon codes — for the bill's "tap to
 * apply" list. Only promos that actually carry a code and a redeemable offer
 * type (not display-only "info"). Resolved by public slug; no session. */
export async function listRedeemableCodes(input: {
  slug: string;
}): Promise<RedeemableCode[]> {
  const slug = (input?.slug ?? "").trim();
  if (!slug) return [];
  const restaurant = await systemDb((tx) =>
    tx.restaurant.findFirst({ where: { slug, status: "active" }, select: { id: true } }),
  );
  if (!restaurant) return [];

  const promos = await getActivePromotions(restaurant.id);
  return promos
    .filter((p) => p.code && p.type !== "info")
    .map((p) => ({
      code: p.code!.toUpperCase(),
      title: p.title,
      summary: offerSummary({ type: p.type, value: p.value, freeItemId: p.freeItemId, minSpend: p.minSpend }),
      minSpend: p.minSpend,
    }));
}

export type ApplyPromoResult =
  | { ok: true; discount: number; label: string }
  | { ok: false; error: string };

export async function applyBillPromo(input: {
  slug: string;
  tableToken: string;
  code: string;
}): Promise<ApplyPromoResult> {
  const parsed = schema.safeParse(input);
  const code = (parsed.success ? parsed.data.code ?? "" : "").trim();
  if (!parsed.success || !code) return { ok: false, error: "Enter a code." };

  const ctx = await resolveTable(parsed.data.slug, parsed.data.tableToken);
  if (!ctx) return { ok: false, error: "Table unavailable." };

  const promo = await findPromoByCode(ctx.restaurantId, code);
  if (!promo) return { ok: false, error: "That code isn't valid or has expired." };

  const orders = await outstandingOrders(ctx.restaurantId, ctx.tableId);
  if (orders.length === 0) return { ok: false, error: "Nothing to pay right now." };

  // Combined cart across the table's open orders (gross — ignores any prior
  // discount so codes can't stack).
  const subtotal = orders.reduce((s, o) => s + o.total, 0);
  const lineMap = new Map<string, { menuItemId: string; unitPrice: number; quantity: number }>();
  for (const o of orders) {
    for (const it of o.items) {
      if (it.menuItemId == null) continue; // item was deleted — no promo targeting it
      const cur = lineMap.get(it.menuItemId);
      if (cur) cur.quantity += it.quantity;
      else lineMap.set(it.menuItemId, { menuItemId: it.menuItemId, unitPrice: it.unitPrice, quantity: it.quantity });
    }
  }

  const res = computePromo(
    { type: promo.type, value: promo.value, freeItemId: promo.freeItemId, minSpend: promo.minSpend },
    { subtotal, deliveryFee: 0, lines: [...lineMap.values()] },
  );
  if (!res.ok) return res;
  if (res.amount <= 0) return { ok: false, error: "This code doesn't apply to your order." };

  const label = `${PROMO_PREFIX} ${code.toUpperCase()} · ${res.label}`;

  // Allocate the discount across orders proportionally to each order's total,
  // capped per order, with any rounding remainder applied to the last order.
  const allocations = new Map<string, number>();
  let allocated = 0;
  orders.forEach((o, idx) => {
    let amt =
      idx === orders.length - 1
        ? res.amount - allocated
        : Math.round((res.amount * o.total) / subtotal);
    amt = Math.max(0, Math.min(amt, o.total));
    allocations.set(o.id, amt);
    allocated += amt;
  });

  await tenantDb(ctx.restaurantId, async (tx) => {
    for (const o of orders) {
      await tx.order.updateMany({
        where: { id: o.id },
        data: { discountAmount: allocations.get(o.id) ?? 0, discountLabel: label },
      });
    }
  });

  await notifyOrdersChanged(ctx.restaurantId);
  return { ok: true, discount: res.amount, label };
}

/** Remove a diner-applied promo (only clears discounts we set). */
export async function clearBillPromo(input: {
  slug: string;
  tableToken: string;
}): Promise<{ ok: boolean; error?: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const ctx = await resolveTable(parsed.data.slug, parsed.data.tableToken);
  if (!ctx) return { ok: false, error: "Table unavailable." };

  await tenantDb(ctx.restaurantId, (tx) =>
    tx.order.updateMany({
      where: {
        tableId: ctx.tableId,
        status: { in: ["new", "preparing", "done"] },
        paymentStatus: { in: ["unpaid", "failed"] },
        discountLabel: { startsWith: PROMO_PREFIX },
      },
      data: { discountAmount: 0, discountLabel: null },
    }),
  );

  await notifyOrdersChanged(ctx.restaurantId);
  return { ok: true };
}
