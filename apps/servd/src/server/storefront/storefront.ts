import "server-only";

import { tenantDb, systemDb } from "@/server/tenancy/scoped-db";
import { isOpenAt } from "@/lib/site/store-hours";
import { normalizeAutoAcceptSeconds } from "@/lib/orders/auto-accept";

export interface DayHours {
  open: string; // "HH:MM"
  close: string; // "HH:MM"
  closed: boolean;
}
export interface DeliveryZone {
  name: string;
  fee: number; // centavos
}
export interface BookingConfig {
  requireDownpayment: boolean;
  downpaymentType: "percent" | "fixed"; // percent of total, or a fixed peso amount
  downpaymentValue: number; // percent (0–100) or centavos, per downpaymentType
  downpaymentInstructions: string; // e.g. "Send GCash to 0917… and enter the ref below"
}
export interface PaymentConfig {
  codEnabled: boolean; // cash on delivery / on pickup
  codFeeEnabled: boolean; // charge an extra fee on cash-on-delivery orders
  codFee: number; // centavos added to delivery orders paid by cash
  gcashEnabled: boolean;
  gcashName: string; // account name shown to the customer
  gcashNumber: string; // GCash mobile number
  gcashQrUrl: string; // uploaded QR image URL
  dineInGcashEnabled: boolean; // offer "Pay with GCash QR" on the table-QR bill —
  //                              the waiter brings the printed QR to the table
  //                              (direct to the store's own GCash, no gateway)
  mayaEnabled: boolean;
  mayaName: string; // account name shown to the customer
  mayaNumber: string; // Maya mobile number
  mayaQrUrl: string; // uploaded QR image URL
  bankEnabled: boolean;
  bankName: string; // bank + account name (e.g. "BPI · Juan Dela Cruz")
  bankNumber: string; // account number
  bankQrUrl: string; // uploaded InstaPay/QRPH image URL
  packagingFeeEnabled: boolean; // charge a food-packaging fee (tubs/containers)
  packagingFee: number; // centavos (per order, or per item — see packagingFeeMode)
  packagingFeeScope: "delivery" | "all"; // delivery only, or pickup & delivery
  packagingFeeMode: "order" | "item"; // flat once per order, or charged per item (× quantity)
  requireReceipt: boolean; // customer must attach a payment screenshot before they
  //                          can place an online-paid order (GCash / Maya / Bank)
  showVat: boolean; // show the "VAT (12%) included" line at web checkout
  //                    (off for non-VAT / percentage-tax businesses)
}

/** The online (non-cash) payment methods a store can offer at web checkout. */
export type OnlinePayMethod = "gcash" | "maya" | "bank";
export interface DeliveryConfig {
  mode: "zones" | "distance" | "shipping"; // zones/distance = local rider; shipping = nationwide courier (region fee, no map pin)
  baseFee: number; // centavos
  perKm: number; // centavos per km
  freeKm: number; // first N km included in base
  minFee: number; // centavos minimum (0 = ignore)
  maxKm: number; // don't deliver beyond this (0 = unlimited)
  roadFactor: number; // straight-line × factor ≈ road distance (default 1.3)
  originLat: number | null; // store location (pinned by the owner)
  originLng: number | null;
  feeInTotal: boolean; // true = add the fee to the order total (pay in-app);
  //                      false = customer pays the rider directly (food only in-app)
  mapEnabled: boolean; // ask the customer to pin their location on a map at checkout
  //                      (distance mode always needs it; ignored there)
  selfBookRider: boolean; // after placing, ask the customer to book their OWN rider
  selfBookRiderNote: string; // instructions shown to the customer (e.g. app/link to use)
  fulfillment: "both" | "pickup" | "delivery"; // which order types the online store offers
}
export interface Storefront {
  hours: DayHours[]; // always length 7, index 0=Sun … 6=Sat
  zones: DeliveryZone[];
  pauseWhenClosed: boolean;
  /**
   * The saved booking/payment/delivery config could NOT be read.
   *
   * Everything in this object is then a DEFAULT, not the shop's settings. The
   * settings page prefills from here and its Save writes back what it was
   * shown, so a write that happens while this is true replaces a real
   * configuration with blanks. That is precisely what happened once; the flag
   * exists so it can't happen quietly again.
   */
  configUnavailable: boolean;
  /**
   * The owner has stopped online orders by hand, right now.
   *
   * Separate from pauseWhenClosed: that one follows the clock, this one is a
   * busy-switch, and it only comes back on when somebody turns it back on.
   */
  ordersPaused: boolean;
  /**
   * Accept an unanswered online order by itself after this many seconds.
   * Null = off, which is every shop that hasn't asked for it.
   */
  autoAcceptSeconds: number | null;
  acceptsBookings: boolean; // website "Book a table" flow enabled
  booking: BookingConfig; // advance-order downpayment / approval settings
  payment: PaymentConfig; // manual GCash / cash settings
  delivery: DeliveryConfig; // zones vs distance-based fee
}

export function defaultDeliveryConfig(): DeliveryConfig {
  return { mode: "zones", baseFee: 0, perKm: 0, freeKm: 0, minFee: 0, maxKm: 0, roadFactor: 1.3, originLat: null, originLng: null, feeInTotal: true, mapEnabled: true, selfBookRider: false, selfBookRiderNote: "", fulfillment: "both" };
}

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeDeliveryConfig(raw: unknown): DeliveryConfig {
  const d = defaultDeliveryConfig();
  if (raw && typeof raw === "object") {
    const r = raw as Partial<DeliveryConfig>;
    return {
      mode: r.mode === "distance" ? "distance" : r.mode === "shipping" ? "shipping" : "zones",
      baseFee: Math.max(0, Math.round(num(r.baseFee))),
      perKm: Math.max(0, Math.round(num(r.perKm))),
      freeKm: Math.max(0, num(r.freeKm)),
      minFee: Math.max(0, Math.round(num(r.minFee))),
      maxKm: Math.max(0, num(r.maxKm)),
      roadFactor: num(r.roadFactor, 1.3) > 0 ? num(r.roadFactor, 1.3) : 1.3,
      originLat: r.originLat == null ? null : num(r.originLat),
      originLng: r.originLng == null ? null : num(r.originLng),
      // Default true (fee included) so existing stores are unchanged.
      feeInTotal: r.feeInTotal === undefined ? true : !!r.feeInTotal,
      // Default true (map shown) so existing stores keep the pin.
      mapEnabled: r.mapEnabled === undefined ? true : !!r.mapEnabled,
      selfBookRider: !!r.selfBookRider,
      selfBookRiderNote: typeof r.selfBookRiderNote === "string" ? r.selfBookRiderNote.slice(0, 500) : "",
      fulfillment: r.fulfillment === "pickup" ? "pickup" : r.fulfillment === "delivery" ? "delivery" : "both",
    };
  }
  return d;
}

export function defaultPaymentConfig(): PaymentConfig {
  return {
    codEnabled: true, codFeeEnabled: false, codFee: 0,
    gcashEnabled: false, gcashName: "", gcashNumber: "", gcashQrUrl: "", dineInGcashEnabled: false,
    mayaEnabled: false, mayaName: "", mayaNumber: "", mayaQrUrl: "",
    bankEnabled: false, bankName: "", bankNumber: "", bankQrUrl: "",
    packagingFeeEnabled: false, packagingFee: 0, packagingFeeScope: "delivery", packagingFeeMode: "order",
    requireReceipt: false, showVat: true,
  };
}

function normalizePaymentConfig(raw: unknown): PaymentConfig {
  const d = defaultPaymentConfig();
  if (raw && typeof raw === "object") {
    const r = raw as Partial<PaymentConfig>;
    const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
    return {
      // Cash defaults ON so every store always has at least one method.
      codEnabled: r.codEnabled === undefined ? true : !!r.codEnabled,
      codFeeEnabled: !!r.codFeeEnabled,
      codFee: Math.max(0, Math.round(Number(r.codFee) || 0)),
      gcashEnabled: !!r.gcashEnabled,
      gcashName: str(r.gcashName, 120),
      gcashNumber: str(r.gcashNumber, 40),
      gcashQrUrl: str(r.gcashQrUrl, 500),
      dineInGcashEnabled: !!r.dineInGcashEnabled,
      mayaEnabled: !!r.mayaEnabled,
      mayaName: str(r.mayaName, 120),
      mayaNumber: str(r.mayaNumber, 40),
      mayaQrUrl: str(r.mayaQrUrl, 500),
      bankEnabled: !!r.bankEnabled,
      bankName: str(r.bankName, 120),
      bankNumber: str(r.bankNumber, 40),
      bankQrUrl: str(r.bankQrUrl, 500),
      packagingFeeEnabled: !!r.packagingFeeEnabled,
      packagingFee: Math.max(0, Math.round(Number(r.packagingFee) || 0)),
      packagingFeeScope: r.packagingFeeScope === "all" ? "all" : "delivery",
      requireReceipt: !!r.requireReceipt,
      // Default "order" (flat) so existing stores' totals are unchanged.
      packagingFeeMode: r.packagingFeeMode === "item" ? "item" : "order",
      // Default true so existing stores keep showing "VAT (12%) included".
      showVat: r.showVat === undefined ? true : !!r.showVat,
    };
  }
  return d;
}

/**
 * The packaging fee that applies to an online order of the given type (centavos).
 * "order" mode charges the flat fee once; "item" mode charges it per item unit,
 * so it scales with the total quantity in the cart.
 */
export function computePackagingFee(
  cfg: PaymentConfig,
  orderType: "pickup" | "delivery",
  itemCount = 1,
): number {
  if (!cfg.packagingFeeEnabled || cfg.packagingFee <= 0) return 0;
  if (cfg.packagingFeeScope === "delivery" && orderType !== "delivery") return 0;
  const units = cfg.packagingFeeMode === "item" ? Math.max(1, Math.round(itemCount)) : 1;
  return cfg.packagingFee * units;
}

export function defaultBookingConfig(): BookingConfig {
  return { requireDownpayment: false, downpaymentType: "percent", downpaymentValue: 50, downpaymentInstructions: "" };
}

function normalizeBookingConfig(raw: unknown): BookingConfig {
  const d = defaultBookingConfig();
  if (raw && typeof raw === "object") {
    const r = raw as Partial<BookingConfig>;
    return {
      requireDownpayment: !!r.requireDownpayment,
      downpaymentType: r.downpaymentType === "fixed" ? "fixed" : "percent",
      downpaymentValue: Math.max(0, Math.round(Number(r.downpaymentValue) || 0)) || d.downpaymentValue,
      downpaymentInstructions: typeof r.downpaymentInstructions === "string" ? r.downpaymentInstructions.slice(0, 500) : "",
    };
  }
  return d;
}

/** The downpayment a given order total requires under a booking config (centavos). */
export function computeDownpayment(cfg: BookingConfig, total: number): number {
  if (!cfg.requireDownpayment) return 0;
  const amt = cfg.downpaymentType === "percent"
    ? Math.round((total * cfg.downpaymentValue) / 100)
    : cfg.downpaymentValue;
  return Math.max(0, Math.min(total, amt)); // never more than the order total
}

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function defaultHours(): DayHours[] {
  return Array.from({ length: 7 }, () => ({ open: "09:00", close: "21:00", closed: false }));
}

function normalizeHours(raw: unknown): DayHours[] {
  const out = defaultHours();
  if (Array.isArray(raw)) {
    for (let i = 0; i < 7; i++) {
      const r = raw[i] as Partial<DayHours> | undefined;
      if (r && typeof r === "object") {
        out[i] = {
          open: typeof r.open === "string" ? r.open : "09:00",
          close: typeof r.close === "string" ? r.close : "21:00",
          closed: !!r.closed,
        };
      }
    }
  }
  return out;
}

function normalizeZones(raw: unknown): DeliveryZone[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((z) => ({ name: String((z as DeliveryZone)?.name ?? "").trim(), fee: Math.max(0, Math.round(Number((z as DeliveryZone)?.fee) || 0)) }))
    .filter((z) => z.name);
}

/** Storefront settings (admin context). Resilient to a missing table.
 * `acceptsBookings` ships in a later migration than hours/zones, so it's read in
 * its own best-effort query — a missing column can never wipe the core settings. */
export async function getStorefront(restaurantId: string): Promise<Storefront> {
  try {
    const s = await tenantDb(restaurantId, (tx) =>
      tx.storefrontSetting.findFirst({ where: { restaurantId }, select: { hours: true, deliveryZones: true, pauseWhenClosed: true } }),
    );
    let acceptsBookings = false;
    let ordersPaused = false;
    let autoAcceptSeconds: number | null = null;
    let configUnavailable = false;
    let booking = defaultBookingConfig();
    let payment = defaultPaymentConfig();
    let delivery = defaultDeliveryConfig();
    try {
      const b = await tenantDb(restaurantId, (tx) =>
        tx.storefrontSetting.findFirst({ where: { restaurantId }, select: { acceptsBookings: true, bookingConfig: true, paymentConfig: true, deliveryConfig: true } }),
      );
      acceptsBookings = !!b?.acceptsBookings;
      booking = normalizeBookingConfig(b?.bookingConfig);
      payment = normalizePaymentConfig(b?.paymentConfig);
      delivery = normalizeDeliveryConfig(b?.deliveryConfig);
    } catch {
      // Columns not migrated yet — booking/payment/delivery below are DEFAULTS,
      // not this shop's settings. Say so, loudly, in the returned object.
      configUnavailable = true;
    }
    // ordersPaused is NEWER STILL, so it gets its own query and its own catch.
    // Reading it alongside the block above is what broke: one missing column
    // threw the whole query, the catch handed back DEFAULTS for payment,
    // booking and delivery, the settings page prefilled from those defaults,
    // and the next Save wrote the blanks over a shop's real configuration.
    // One best-effort read per migration generation, never a shared one.
    try {
      const pausedRow = await tenantDb(restaurantId, (tx) =>
        tx.storefrontSetting.findFirst({ where: { restaurantId }, select: { ordersPaused: true } }),
      );
      ordersPaused = !!pausedRow?.ordersPaused;
    } catch { /* ordersPaused not migrated yet */ }
    // autoAcceptSeconds is newer again, so it gets its own query and its own
    // catch, for the same reason ordersPaused does. One best-effort read per
    // migration generation, never a shared one.
    try {
      const autoRow = await tenantDb(restaurantId, (tx) =>
        tx.storefrontSetting.findFirst({ where: { restaurantId }, select: { autoAcceptSeconds: true } }),
      );
      autoAcceptSeconds = normalizeAutoAcceptSeconds(autoRow?.autoAcceptSeconds);
    } catch { /* autoAcceptSeconds not migrated yet — stays off */ }
    return { hours: normalizeHours(s?.hours), zones: normalizeZones(s?.deliveryZones), pauseWhenClosed: !!s?.pauseWhenClosed, ordersPaused, autoAcceptSeconds, configUnavailable, acceptsBookings, booking, payment, delivery };
  } catch {
    return { hours: defaultHours(), zones: [], pauseWhenClosed: false, ordersPaused: false, autoAcceptSeconds: null, configUnavailable: true, acceptsBookings: false, booking: defaultBookingConfig(), payment: defaultPaymentConfig(), delivery: defaultDeliveryConfig() };
  }
}

/** Public storefront for the website (system context). */
export async function getPublicStorefront(restaurantId: string): Promise<Storefront> {
  try {
    const s = await systemDb((tx) =>
      tx.storefrontSetting.findFirst({ where: { restaurantId }, select: { hours: true, deliveryZones: true, pauseWhenClosed: true } }),
    );
    let acceptsBookings = false;
    let ordersPaused = false;
    let autoAcceptSeconds: number | null = null;
    let configUnavailable = false;
    let booking = defaultBookingConfig();
    let payment = defaultPaymentConfig();
    let delivery = defaultDeliveryConfig();
    try {
      const b = await systemDb((tx) =>
        tx.storefrontSetting.findFirst({ where: { restaurantId }, select: { acceptsBookings: true, bookingConfig: true, paymentConfig: true, deliveryConfig: true } }),
      );
      acceptsBookings = !!b?.acceptsBookings;
      booking = normalizeBookingConfig(b?.bookingConfig);
      payment = normalizePaymentConfig(b?.paymentConfig);
      delivery = normalizeDeliveryConfig(b?.deliveryConfig);
    } catch {
      // Columns not migrated yet — booking/payment/delivery below are DEFAULTS,
      // not this shop's settings. Say so, loudly, in the returned object.
      configUnavailable = true;
    }
    // ordersPaused is NEWER STILL, so it gets its own query and its own catch.
    // Reading it alongside the block above is what broke: one missing column
    // threw the whole query, the catch handed back DEFAULTS for payment,
    // booking and delivery, the settings page prefilled from those defaults,
    // and the next Save wrote the blanks over a shop's real configuration.
    // One best-effort read per migration generation, never a shared one.
    try {
      const pausedRow = await systemDb((tx) =>
        tx.storefrontSetting.findFirst({ where: { restaurantId }, select: { ordersPaused: true } }),
      );
      ordersPaused = !!pausedRow?.ordersPaused;
    } catch { /* ordersPaused not migrated yet */ }
    // autoAcceptSeconds is newer again, so it gets its own query and its own
    // catch, for the same reason ordersPaused does. One best-effort read per
    // migration generation, never a shared one.
    try {
      const autoRow = await systemDb((tx) =>
        tx.storefrontSetting.findFirst({ where: { restaurantId }, select: { autoAcceptSeconds: true } }),
      );
      autoAcceptSeconds = normalizeAutoAcceptSeconds(autoRow?.autoAcceptSeconds);
    } catch { /* autoAcceptSeconds not migrated yet — stays off */ }
    return { hours: normalizeHours(s?.hours), zones: normalizeZones(s?.deliveryZones), pauseWhenClosed: !!s?.pauseWhenClosed, ordersPaused, autoAcceptSeconds, configUnavailable, acceptsBookings, booking, payment, delivery };
  } catch {
    return { hours: defaultHours(), zones: [], pauseWhenClosed: false, ordersPaused: false, autoAcceptSeconds: null, configUnavailable: true, acceptsBookings: false, booking: defaultBookingConfig(), payment: defaultPaymentConfig(), delivery: defaultDeliveryConfig() };
  }
}

/**
 * Whether the store is open at the given moment (PH time, UTC+8).
 *
 * The rule lives in lib/site/store-hours so the storefront badge, the online
 * order gate and its tests all read the same one. It used to consult only the
 * current day's row, which shut a shop at 2 AM on a Sunday while Saturday's
 * 10:00–02:30 session was still running.
 */
export function isOpenNow(hours: DayHours[], now = new Date()): boolean {
  return isOpenAt(hours, now);
}
