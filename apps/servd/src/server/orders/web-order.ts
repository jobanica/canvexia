"use server";

import { z } from "zod";
import { systemDb, tenantDb } from "@/server/tenancy/scoped-db";
import {
  buildValidatedOrder,
  orderItemsCreate,
  OrderValidationError,
} from "@/server/orders/build-order";
import { recordServingsSold } from "@/server/menu/servings";
import { recordVariantsSold } from "@/server/menu/variants";
import { notifyOrdersChanged } from "@/server/realtime/notify";
import { sendOrderPush } from "@/server/push/send";
import { getPublicStorefront, isOpenNow, computeDownpayment, computePackagingFee } from "@/server/storefront/storefront";
import { uploadMenuImageBytes } from "@/server/storage/menu-images";
import { haversineKm, computeDistanceFee } from "@/lib/geo/distance";
import { resolvePromo } from "@/server/promotions/redeem";
import { getWebOrderCapStatus } from "@/server/billing/order-cap";
import { getLoyaltyConfig, enrollAccount } from "@/server/loyalty/loyalty";
import { markCartConverted } from "@/server/marketing/cart-recovery";
import { formatPeso } from "@/lib/money";
import { isValidPhone, normalizePhone } from "@/lib/phone";

const schema = z.object({
  slug: z.string().min(1),
  // "pickup" — ordered ahead and collected. The storefront always called this
  // "Pickup" in words while storing "takeout", which is exactly why the same
  // order read differently on the cashier and kitchen screens.
  orderType: z.enum(["pickup", "delivery"]),
  customerName: z.string().trim().min(1, "Enter your name").max(80),
  customerPhone: z
    .string()
    .trim()
    .refine(isValidPhone, "Enter an 11-digit phone number (e.g. 09171234567)."),
  customerAddress: z.string().trim().max(300).optional(),
  deliveryZone: z.string().trim().max(80).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  scheduledFor: z.string().datetime().optional(), // ISO; advance order (null = ASAP)
  downpaymentRef: z.string().trim().max(120).optional(), // customer's payment reference
  paymentChoice: z.enum(["cod", "gcash", "maya", "bank"]).optional(), // chosen payment method
  paymentRef: z.string().trim().max(120).optional(), // reference no. for an online payment
  // What the customer says they'll hand over on a cash order, in centavos, so
  // the counter can count the change before they arrive. Capped generously —
  // it is a hint for staff, never money that gets recorded as taken.
  cashTendered: z.number().int().min(0).max(10_000_000).optional(),
  paymentReceipt: z.string().max(8_000_000).optional(), // data-URL screenshot of the payment
  customerNote: z.string().trim().max(500).optional(), // note to the rider / kitchen
  couponCode: z.string().trim().max(40).optional(), // promo/coupon code
  lines: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        quantity: z.coerce.number().int().min(1).max(99),
        note: z.string().trim().max(200).optional(),
        modifierIds: z.array(z.string().uuid()).max(50).default([]),
        variantId: z.string().uuid().optional(),
      }),
    )
    .min(1, "Your cart is empty")
    .max(100),
});

export type WebOrderInput = z.infer<typeof schema>;
export type WebOrderResult =
  | { ok: true; orderId: string; awaitingApproval: boolean; downpaymentAmount: number }
  | { ok: false; error: string };

/**
 * Places an online (website) order for pickup or delivery — no table. Lands as
 * `pending` so the cashier confirms it (incoming-order popup), then it flows
 * through the same kitchen/cashier pipeline as everything else.
 */
export async function placeWebOrder(input: WebOrderInput): Promise<WebOrderResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid order" };
  }
  const d = parsed.data;
  if (d.orderType === "delivery" && !d.customerAddress?.trim()) {
    return { ok: false, error: "A delivery address is required." };
  }

  const restaurant = await systemDb((tx) =>
    tx.restaurant.findFirst({ where: { slug: d.slug, status: "active" }, select: { id: true } }),
  );
  if (!restaurant) return { ok: false, error: "This restaurant is unavailable." };

  // Free plan is capped at 100 online orders/month — block new ones past that
  // (the owner upgrades for unlimited). Paid plans + trials are uncapped.
  const cap = await getWebOrderCapStatus(restaurant.id);
  if (cap.reached) {
    return { ok: false, error: "Sorry, online ordering is temporarily unavailable for this store. Please contact them directly to place your order." };
  }

  // Validate an advance-order time, if one was chosen.
  let scheduledFor: Date | null = null;
  if (d.scheduledFor) {
    const when = new Date(d.scheduledFor);
    if (Number.isNaN(when.getTime())) return { ok: false, error: "That schedule time didn't look right." };
    if (when.getTime() < Date.now() + 15 * 60 * 1000) {
      return { ok: false, error: "Please schedule at least 15 minutes from now." };
    }
    if (when.getTime() > Date.now() + 90 * 24 * 60 * 60 * 1000) {
      return { ok: false, error: "Orders can be scheduled up to 90 days ahead." };
    }
    scheduledFor = when;
  }

  const storefront = await getPublicStorefront(restaurant.id);

  // The owner has stopped online orders by hand — usually because the kitchen
  // is buried. Refused HERE and not only in the page: someone with the site
  // already open, or a bookmarked checkout, would otherwise sail straight past
  // a hidden button and land an order in a kitchen that can't take it.
  if (storefront.ordersPaused) {
    return {
      ok: false,
      error:
        "We've paused online orders for now — the kitchen is at capacity. Please try again shortly.",
    };
  }

  // Enforce the store's fulfillment mode server-side (the client hides the
  // other option, but never trust the client).
  const fulfillment = storefront.delivery.fulfillment;
  if (fulfillment === "pickup" && d.orderType === "delivery") {
    return { ok: false, error: "This store is pick-up only right now." };
  }
  if (fulfillment === "delivery" && d.orderType !== "delivery") {
    return { ok: false, error: "This store is delivery only right now." };
  }
  // A map pin is needed for distance-based fees, and for zone/flat delivery when
  // the owner keeps the map on. Shipping (typed address) and a map-off store skip
  // it. When not required, a typed address is enough.
  const pinRequired =
    d.orderType === "delivery" &&
    storefront.delivery.mode !== "shipping" &&
    (storefront.delivery.mode === "distance" || storefront.delivery.mapEnabled !== false);
  if (pinRequired && (d.lat == null || d.lng == null)) {
    return { ok: false, error: "Please pin your delivery location on the map." };
  }

  // A "closed now" store still takes ADVANCE orders (they're for later) — only
  // block ASAP orders when the owner pauses ordering outside opening hours.
  if (!scheduledFor && storefront.pauseWhenClosed && !isOpenNow(storefront.hours)) {
    return { ok: false, error: "We're currently closed. Please order during store hours, or schedule your order for later." };
  }

  let built;
  try {
    built = await buildValidatedOrder(restaurant.id, d.lines);
  } catch (e) {
    if (e instanceof OrderValidationError) return { ok: false, error: e.message };
    return { ok: false, error: "We couldn't build your order. Please try again." };
  }

  // Delivery fee — computed server-side (never trust the client for money) from
  // either the chosen zone or the distance formula. When feeInTotal is off the
  // customer pays the rider directly, so it's NOT added to the order total (only
  // recorded on the address for reference). Encoded into the address so staff see it.
  let deliveryFee = 0;
  let addressLine: string | null = null;
  if (d.orderType === "delivery") {
    const dc = storefront.delivery;
    let estimate = 0;
    let label = "";
    if (dc.mode === "distance" && dc.originLat != null && dc.originLng != null && d.lat != null && d.lng != null) {
      const r = computeDistanceFee(
        { baseFee: dc.baseFee, perKm: dc.perKm, freeKm: dc.freeKm, minFee: dc.minFee, maxKm: dc.maxKm, roadFactor: dc.roadFactor },
        haversineKm(dc.originLat, dc.originLng, d.lat, d.lng),
      );
      if (r.outOfRange) return { ok: false, error: "Sorry, your location is outside our delivery range." };
      estimate = r.fee;
      label = `≈${r.billableKm.toFixed(1)}km`;
    } else {
      const zone = d.deliveryZone ? storefront.zones.find((z) => z.name === d.deliveryZone) : undefined;
      estimate = zone?.fee ?? 0;
      label = zone?.name ?? "";
    }
    // Shipping is always prepaid in-app; for local delivery, only charge it in
    // the total when the owner collects it in-app (else the rider is paid direct).
    const feeInTotal = dc.mode === "shipping" ? true : dc.feeInTotal;
    deliveryFee = feeInTotal ? estimate : 0;
    const kind = dc.mode === "shipping" ? "shipping" : "delivery";
    const feeNote =
      estimate > 0 ? ` · ${kind} ${formatPeso(estimate)}${feeInTotal ? "" : " (rider-paid)"}` : "";
    const prefix = label || feeNote ? `[${label}${feeNote}] ` : "";
    addressLine = `${prefix}${d.customerAddress?.trim() ?? ""}`.trim() || null;
  }

  // Payment method (cash / GCash / Maya / Bank). The chosen online method must be
  // enabled by the owner; unknown or disabled choices fall back to cash so an
  // order never gets stuck.
  const p = storefront.payment;
  const choice =
    d.paymentChoice === "gcash" && p.gcashEnabled ? "gcash"
    : d.paymentChoice === "maya" && p.mayaEnabled ? "maya"
    : d.paymentChoice === "bank" && p.bankEnabled ? "bank"
    : "cod";
  // COD fee — extra charge on cash-on-delivery orders (delivery paid by cash).
  const codFee =
    d.orderType === "delivery" && choice === "cod" && storefront.payment.codFeeEnabled
      ? storefront.payment.codFee
      : 0;
  if (codFee > 0 && addressLine) addressLine = `[COD +${formatPeso(codFee)}] ${addressLine}`;

  // Proof of payment, when the owner insists on it. Checked after `choice` is
  // resolved so it only applies to an actually-online payment, and enforced here
  // because the client's disabled button is not a guarantee.
  if (storefront.payment.requireReceipt && choice !== "cod" && !d.paymentReceipt) {
    return { ok: false, error: "Please attach a screenshot of your payment to place this order." };
  }

  // Packaging fee for food packaging (tubs/containers) on to-go online orders.
  // Applies to delivery only, or pickup + delivery, per config — and either a
  // flat charge per order or per item (× total quantity), per packagingFeeMode.
  const packagedUnits = built.items.reduce((n, i) => n + i.quantity, 0);
  const packagingFee = computePackagingFee(storefront.payment, d.orderType, packagedUnits);

  // Coupon — re-resolved server-side against the real prices (never trust the
  // client for money). free_delivery waives the delivery fee; percent/amount cut
  // the subtotal. Best-effort so a bad/expired code just yields no discount.
  let discountAmount = 0;
  let discountLabel: string | null = null;
  if (d.couponCode) {
    try {
      const promo = await resolvePromo(restaurant.id, d.couponCode, built, deliveryFee);
      if (promo && promo.amount > 0) {
        discountAmount = Math.min(promo.amount, built.total + deliveryFee); // never below 0
        discountLabel = promo.label;
      }
    } catch { /* promotions not migrated / code invalid — no discount */ }
  }

  const base = {
    restaurantId: restaurant.id,
    orderType: d.orderType,
    customerName: d.customerName.trim(),
    customerPhone: normalizePhone(d.customerPhone),
    customerAddress: addressLine,
    status: "pending" as const,
    paymentStatus: "unpaid" as const,
    total: built.total + deliveryFee + codFee + packagingFee,
    discountAmount,
    discountLabel,
    items: { create: orderItemsCreate(built.items) },
  };
  // Optional columns that a schema-lagged DB may not have yet (geo pin, advance
  // schedule, approval/downpayment). Tried together first, then dropped on error
  // so the order still lands.
  const geo = d.orderType === "delivery" && d.lat != null && d.lng != null ? { customerLat: d.lat, customerLng: d.lng } : null;
  const sched = scheduledFor ? { scheduledFor } : null;
  // Every advance order needs the owner's approval; downpayment is recomputed
  // server-side (never trust the client for money).
  const advance = scheduledFor
    ? {
        approvalStatus: "awaiting",
        downpaymentAmount: computeDownpayment(storefront.booking, base.total) || null,
        downpaymentRef: d.downpaymentRef?.trim() || null,
      }
    : null;
  const pay = {
    paymentChoice: choice,
    paymentRef: choice !== "cod" ? d.paymentRef?.trim() || null : null,
    // Only meaningful on a cash order — and only ever a note for the counter,
    // never treated as money received.
    cashTendered: choice === "cod" && d.cashTendered ? d.cashTendered : null,
  };

  // Online-payment receipt screenshot (best-effort). The customer sends a
  // data-URL; we upload the bytes to storage and keep the public URL. Never
  // blocks the order — a failed/oversized upload just yields no receipt.
  let paymentReceiptUrl: string | null = null;
  if (choice !== "cod" && d.paymentReceipt) {
    try {
      const m = /^data:(image\/(png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/.exec(d.paymentReceipt);
      if (m) {
        const bytes = Buffer.from(m[3], "base64");
        if (bytes.length > 0 && bytes.length <= 5 * 1024 * 1024) {
          const ext = m[1] === "image/png" ? "png" : m[1] === "image/webp" ? "webp" : "jpg";
          paymentReceiptUrl = await uploadMenuImageBytes(restaurant.id, bytes, ext, m[1]);
        }
      }
    } catch { /* receipt upload is best-effort */ }
  }

  const note = d.customerNote?.trim() || null;
  // `source: "web"` tags this as an online-website order (Free-tier monthly
  // meter). It rides in `extra` so a schema-lagged DB just drops it and the
  // order still lands (uncounted until the migration runs).
  const extra = { ...(geo ?? {}), ...(sched ?? {}), ...(advance ?? {}), ...pay, source: "web", customerNote: note, paymentReceiptUrl };

  // Persist with graceful degradation across a schema-lagged DB: try the full
  // set, then everything except the newest `source` column (so the receipt /
  // note / payment fields still save when only `source` is missing), then the
  // base fields only. This keeps the GCash receipt from being dropped just
  // because an unrelated column hasn't been migrated yet.
  const createWith = (data: typeof base) =>
    tenantDb(restaurant.id, (tx) => tx.order.create({ data, select: { id: true } }));

  // Each rung drops only the NEWEST column, so one unmigrated field can't take
  // the older ones down with it — losing the payment screenshot because
  // `cashTendered` isn't there yet would be a bad trade.
  const withoutTendered = { ...extra };
  delete (withoutTendered as { cashTendered?: number | null }).cashTendered;
  const extraNoSource = { ...withoutTendered };
  delete (extraNoSource as { source?: string }).source;

  let order;
  try {
    order = await createWith({ ...base, ...extra } as typeof base);
  } catch {
    try {
      order = await createWith({ ...base, ...withoutTendered } as typeof base);
    } catch {
    try {
      order = await createWith({ ...base, ...extraNoSource } as typeof base);
    } catch {
      try {
        order = await createWith(base);
      } catch (e2) {
        console.error("placeWebOrder failed", e2);
        return { ok: false, error: "We couldn't place your order. Please try again." };
      }
    }
    }
  }

  // Count these servings toward each item's daily cap (best-effort, own tx).
  await recordServingsSold(restaurant.id, built.items);
  await recordVariantsSold(
    restaurant.id,
    built.items.filter((i) => i.variantId).map((i) => ({ variantId: i.variantId!, quantity: i.quantity })),
  );

  await notifyOrdersChanged(restaurant.id);

  // Web Push the merchant devices so a new order alerts them even when the
  // Incoming Orders app is minimized/closed. Best-effort — never blocks the order.
  try {
    await sendOrderPush(restaurant.id, {
      ref: `#${order.id.slice(0, 8).toUpperCase()}`,
      orderType: d.orderType,
      total: base.total,
      scheduled: !!scheduledFor,
    });
  } catch { /* push is best-effort */ }

  // The cart converted — close any open abandoned-cart lead for this phone.
  await markCartConverted(restaurant.id, d.customerPhone);

  // Auto-enroll the customer into loyalty (they gave name + phone). Best-effort.
  try {
    const cfg = await getLoyaltyConfig(restaurant.id);
    if (cfg.enabled) await enrollAccount(restaurant.id, d.customerPhone, d.customerName);
  } catch {
    /* loyalty must never block the order */
  }

  return {
    ok: true,
    orderId: order.id,
    awaitingApproval: !!scheduledFor,
    downpaymentAmount: advance?.downpaymentAmount ?? 0,
  };
}
