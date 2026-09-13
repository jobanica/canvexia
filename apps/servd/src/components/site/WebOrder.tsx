"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatPeso, formatDelta, pesosToCentavos, cashSuggestions } from "@/lib/money";
import {
  unitPrice,
  validateSelection,
  selectionToLineModifiers,
  cartTotal,
  cartCount,
} from "@/lib/cart/pricing";
import type { CartLine, DinerCategory, DinerItem, Selection } from "@/lib/cart/types";
import { placeWebOrder } from "@/server/orders/web-order";
import { isValidPhone, phoneError } from "@/lib/phone";
import { prepareReceipt } from "@/lib/images/receipt";
import { getWebOrderStatus } from "@/server/orders/web-order-status";
import { previewPromoCode } from "@/server/promotions/redeem";
import { CartThumb } from "@/components/diner/CartThumb";
import { CategoryTabs, categorySectionId } from "@/components/menu/CategoryTabs";
import { captureCartLead } from "@/server/marketing/cart-recovery";
import { replaceCartLine, selectionFromLine } from "@/lib/cart/edit-line";
import { wrapsMidnight } from "@/lib/site/store-hours";
import { LocationPicker } from "./LocationPicker";
import { WebOrderTracker } from "./WebOrderTracker";
import { haversineKm, computeDistanceFee } from "@/lib/geo/distance";
import { PoweredByServd } from "@/components/branding/PoweredByServd";

function lineId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Signature that makes two cart lines "the same" (item + size + note + mods). */
function lineSig(l: CartLine): string {
  return `${l.itemId}|${l.variantId ?? ""}|${(l.note ?? "").trim()}|${l.modifiers
    .map((m) => m.modifierId)
    .sort()
    .join(",")}`;
}

/**
 * Add a line to the cart, merging into an identical existing line (same item,
 * size, note and modifiers) by bumping its quantity — so tapping "Add" four
 * times shows one row of ×4 instead of four separate rows.
 */
function addCartLine(prev: CartLine[], line: CartLine): CartLine[] {
  const key = lineSig(line);
  const idx = prev.findIndex((l) => lineSig(l) === key);
  if (idx === -1) return [...prev, line];
  const next = [...prev];
  next[idx] = { ...next[idx], quantity: next[idx].quantity + line.quantity };
  return next;
}

const VAT_RATE = 0.12;

interface LoyaltyInfo {
  enabled: boolean;
  pesosPerPoint: number;
  pointValue: number;
}

interface DayHours { open: string; close: string; closed: boolean }
interface DeliveryZone { name: string; fee: number }

export interface WebOrderProps {
  slug: string;
  restaurantName: string;
  logoUrl?: string | null;
  coverImageUrl?: string | null;
  rating?: { count: number; average: number | null } | null;
  categories: DinerCategory[];
  contact?: { address: string | null; phone: string | null };
  loyalty?: LoyaltyInfo | null;
  /** The owner stopped online orders by hand. Beats the clock. */
  ordersPaused?: boolean;
  hours?: DayHours[];
  zones?: DeliveryZone[];
  openNow?: boolean;
  pauseWhenClosed?: boolean;
  homeHref?: string;
  acceptsBookings?: boolean;
  bookHref?: string;
  scheduleFor?: string; // ISO — preselect "schedule for later" (from the pre-order page)
  /**
   * Show "Powered by Servd · www.servdph.com" at the foot of the page.
   *
   * Decided on the server (server/branding/powered-by.ts): new accounts carry
   * it, accounts that were already trading before it existed are grandfathered,
   * and anyone who bought the full white-label unlock never does. Defaults to
   * OFF, so a caller that hasn't been told about it shows nothing rather than
   * stamping a page that shouldn't be stamped.
   */
  poweredBy?: boolean;
  /**
   * DIY preview: render the storefront exactly as a live one, but intercept the
   * final "Place order" tap with the activation prompt instead of creating an
   * order. Demo DEMONSTRATES the product; it never provides the service — and
   * the server refuses preview restaurants on every order path anyway.
   */
  demo?: boolean;
  onDemoOrder?: () => void;
  booking?: {
    requireDownpayment: boolean;
    downpaymentType: "percent" | "fixed";
    downpaymentValue: number; // percent (0–100) or centavos
    downpaymentInstructions: string;
  };
  payment?: {
    codEnabled: boolean;
    codFeeEnabled?: boolean;
    codFee?: number; // centavos
    gcashEnabled: boolean;
    gcashName: string;
    gcashNumber: string;
    gcashQrUrl: string;
    mayaEnabled?: boolean;
    mayaName?: string;
    mayaNumber?: string;
    mayaQrUrl?: string;
    bankEnabled?: boolean;
    bankName?: string;
    bankNumber?: string;
    bankQrUrl?: string;
    packagingFeeEnabled?: boolean;
    packagingFee?: number; // centavos
    packagingFeeScope?: "delivery" | "all";
    packagingFeeMode?: "order" | "item";
    requireReceipt?: boolean;
    showVat?: boolean;
  };
  delivery?: {
    mode: "zones" | "distance" | "shipping";
    baseFee: number;
    perKm: number;
    freeKm: number;
    minFee: number;
    maxKm: number;
    roadFactor: number;
    originLat: number | null;
    originLng: number | null;
    feeInTotal?: boolean;
    mapEnabled?: boolean;
    selfBookRider?: boolean;
    selfBookRiderNote?: string;
    fulfillment?: "both" | "pickup" | "delivery";
  };
  // Where to center the delivery map by default (the store's location), so diners
  // start near the store instead of a far-away default view.
  storeCenter?: { lat: number; lng: number } | null;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** ISO instant → { date:"YYYY-MM-DD", time:"HH:MM" } in PH wall-clock (UTC+8). */
function isoToPhParts(iso?: string): { date: string; time: string } {
  if (!iso) return { date: "", time: "" };
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return { date: "", time: "" };
  const ph = new Date(dt.getTime() + 8 * 3600000).toISOString();
  return { date: ph.slice(0, 10), time: ph.slice(11, 16) };
}

/** PH date+time inputs → the matching UTC ISO instant (PH is a fixed UTC+8). */
function phPartsToIso(date: string, time: string): string | undefined {
  if (!date || !time) return undefined;
  const dt = new Date(`${date}T${time}:00+08:00`);
  return Number.isNaN(dt.getTime()) ? undefined : dt.toISOString();
}

/** "09:00" → "9:00 AM" for a cleaner, customer-facing time. */
function to12h(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  const period = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m || 0).padStart(2, "0")} ${period}`;
}

/** Collapse consecutive identical days into ranges (e.g. "Mon–Fri · 9 AM–9 PM"). */
function groupHours(hours: DayHours[]): { label: string; value: string }[] {
  if (hours.length !== 7) return [];
  const key = (h: DayHours) => (h.closed ? "closed" : `${h.open}-${h.close}`);
  const rows: { label: string; value: string }[] = [];
  let start = 0;
  for (let i = 1; i <= 7; i++) {
    if (i < 7 && key(hours[i]) === key(hours[start])) continue;
    const h = hours[start];
    const range = start === i - 1 ? DAY_LABELS[start] : `${DAY_LABELS[start]}–${DAY_LABELS[i - 1]}`;
    const label = start === 0 && i === 7 ? "Every day" : range;
    // "10 AM – 2:30 AM" reads as a mistake unless it says which day it means.
    const overnight = wrapsMidnight(h);
    rows.push({
      label,
      value: h.closed
        ? "Closed"
        : `${to12h(h.open)} – ${to12h(h.close)}${overnight ? " (next day)" : ""}`,
    });
    start = i;
  }
  return rows;
}

/** Inline modifier/quantity picker (no i18n dependency). */
function ItemConfig({ item, editing, onAdd, onCancel }: { item: DinerItem; editing?: CartLine | null; onAdd: (l: CartLine) => void; onCancel: () => void }) {
  const variants = item.variants ?? [];
  const inStock = (v: { stock?: number | null }) => v.stock == null || v.stock > 0;
  const [variantId, setVariantId] = useState<string>(editing?.variantId ?? (variants.find(inStock) ?? variants[0])?.id ?? "");
  const [selection, setSelection] = useState<Selection>(editing ? selectionFromLine(editing) : {});
  const [quantity, setQuantity] = useState(editing?.quantity ?? 1);
  const [note, setNote] = useState(editing?.note ?? "");
  const [showError, setShowError] = useState(false);
  const chosenVariant = variants.find((v) => v.id === variantId) ?? null;
  const variantOut = !!chosenVariant && !inStock(chosenVariant);
  const effItem = useMemo(() => (chosenVariant ? { ...item, price: chosenVariant.price } : item), [item, chosenVariant]);
  const price = useMemo(() => unitPrice(effItem, selection), [effItem, selection]);
  const error = useMemo(() => validateSelection(effItem, selection), [effItem, selection]);

  // Tap to select, tap again to clear — so an accidental tap can be undone. A
  // required single-select group keeps its choice (pick another one instead).
  function toggle(g: string, m: string, single: boolean, max: number, required: boolean) {
    setSelection((prev) => {
      const cur = prev[g] ?? [];
      if (single) {
        if (!cur.includes(m)) return { ...prev, [g]: [m] };
        return required ? prev : { ...prev, [g]: [] };
      }
      if (cur.includes(m)) return { ...prev, [g]: cur.filter((x) => x !== m) };
      if (cur.length >= max) return prev;
      return { ...prev, [g]: [...cur, m] };
    });
  }
  function add() {
    if (error || variantOut) return setShowError(true);
    onAdd({
      // Editing keeps the line id, so the cart updates the row in place.
      lineId: editing?.lineId ?? lineId(),
      itemId: item.id,
      name: chosenVariant ? `${item.name} (${chosenVariant.name})` : item.name,
      basePrice: effItem.price,
      unitPrice: price,
      quantity,
      modifiers: selectionToLineModifiers(effItem, selection),
      note: note.trim() || undefined,
      variantId: chosenVariant?.id,
      imageUrl: item.imageUrl,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onCancel}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 className="font-heading text-xl font-bold text-plum-ink">{item.name}</h2>
          <button onClick={onCancel} className="text-2xl leading-none text-plum-ink/40">×</button>
        </div>
        {item.description && <p className="mt-1 text-sm text-plum-ink/60">{item.description}</p>}
        {variants.length > 0 && (
          <fieldset className="mt-4">
            <legend className="font-semibold text-plum-ink">Size <span className="text-guava">*</span></legend>
            <div className="mt-2 space-y-1">
              {variants.map((v) => {
                const out = !inStock(v);
                return (
                  <label key={v.id} className={`flex items-center justify-between rounded-lg border border-plum-ink/10 px-3 py-2 text-sm ${out ? "opacity-50" : ""}`}>
                    <span className="flex items-center gap-2">
                      <input type="radio" name="__variant" disabled={out} checked={variantId === v.id} onChange={() => setVariantId(v.id)} />
                      {v.name}
                      {out ? (
                        <span className="text-xs font-semibold text-guava">Sold out</span>
                      ) : v.stock != null ? (
                        <span className="text-xs text-plum-ink/45">{v.stock} left</span>
                      ) : null}
                    </span>
                    <span className="font-semibold text-plum-ink">{formatPeso(v.price)}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
        {item.groups.map((group) => {
          const single = group.maxSelect === 1;
          const chosen = selection[group.id] ?? [];
          return (
            <fieldset key={group.id} className="mt-4">
              <legend className="font-semibold text-plum-ink">{group.name}{group.required && <span className="text-guava"> *</span>}</legend>
              <div className="mt-2 space-y-1">
                {group.modifiers.map((mod) => {
                  const out = mod.isAvailable === false;
                  return (
                    <label key={mod.id} className={`flex items-center justify-between rounded-lg border border-plum-ink/10 px-3 py-2 text-sm ${out ? "cursor-not-allowed opacity-50" : ""}`}>
                      <span className="flex items-center gap-2">
                        {/* onClick, not onChange: a radio doesn't fire change when
                            it's already selected, and re-tapping is how a diner
                            clears an option they hit by accident. */}
                        <input
                          type={single ? "radio" : "checkbox"}
                          name={group.id}
                          checked={chosen.includes(mod.id)}
                          disabled={out}
                          onClick={() => toggle(group.id, mod.id, single, group.maxSelect, group.required)}
                          onChange={() => {}}
                        />
                        {mod.name}
                        {out && <span className="text-xs font-semibold text-guava">Sold out</span>}
                      </span>
                      {mod.priceDelta !== 0 && <span className="text-red-600">{formatDelta(mod.priceDelta)}</span>}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Special request (optional)" className="mt-4 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
        {showError && error && <p className="mt-2 text-sm text-guava">{error}</p>}
        <div className="mt-4 flex items-center gap-3">
          <div className="flex items-center rounded-full border border-plum-ink/15">
            <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="px-3 py-2 text-lg">−</button>
            <span className="w-8 text-center font-semibold">{quantity}</span>
            <button onClick={() => setQuantity((q) => q + 1)} className="px-3 py-2 text-lg">+</button>
          </div>
          <button onClick={add} disabled={!!error || variantOut} className="flex-1 rounded-full bg-red-600 py-3 font-semibold text-white disabled:opacity-50">
            {variantOut ? "Sold out" : `${editing ? "Update" : "Add"} · ${formatPeso(price * quantity)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Product card — image-forward tile with a floating add button (delivery-app style). */
function ProductCard({ item, onPick }: { item: DinerItem; onPick: (i: DinerItem) => void }) {
  return (
    <div className="flex flex-col">
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-gray-100">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gray-200 text-3xl font-bold text-gray-400">{item.name.charAt(0)}</div>
        )}
        {!item.isAvailable && <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm font-bold text-plum-ink">Sold out</span>}
        <button
          onClick={() => onPick(item)}
          disabled={!item.isAvailable}
          aria-label={`Add ${item.name}`}
          className="absolute bottom-2 right-2 flex h-9 w-9 items-center justify-center rounded-full bg-white text-2xl font-bold leading-none text-red-600 shadow-md ring-1 ring-black/5 hover:bg-red-600 hover:text-white disabled:opacity-40"
        >
          +
        </button>
      </div>
      <p className="mt-2 line-clamp-2 text-sm font-semibold text-plum-ink">{item.name}</p>
      {item.description && <p className="mt-0.5 line-clamp-1 text-xs text-plum-ink/50">{item.description}</p>}
      <span className="mt-1 text-sm font-bold text-plum-ink">
        {item.variants && item.variants.length > 0 && <span className="text-xs font-medium text-plum-ink/50">from </span>}
        {formatPeso(item.price)}
      </span>
    </div>
  );
}

export function WebOrder(props: WebOrderProps) {
  const { slug, restaurantName, logoUrl, categories, contact, loyalty, hours, zones = [], openNow, pauseWhenClosed, ordersPaused, acceptsBookings, bookHref, demo = false, onDemoOrder, poweredBy = false } = props;
  const home = props.homeHref ?? `/r/${slug}`;
  const book = bookHref ?? `/r/${slug}/book`;
  // Two ways ordering stops. `ordersPaused` is the owner's own switch, thrown
  // because the kitchen is buried — it holds whatever the clock says.
  // `pauseWhenClosed` is automatic and only bites outside opening hours.
  const paused = !!ordersPaused || (!!pauseWhenClosed && openNow === false);
  const pausedByOwner = !!ordersPaused;
  // Say it at the top as well. Finding out at the checkout button, after
  // choosing a meal, is the version of this that loses a customer for good.
  const pausedBanner = pausedByOwner
    ? "We've paused online orders right now — the kitchen is at capacity. Please check back shortly."
    : null;

  const [lines, setLines] = useState<CartLine[]>([]);
  const [configItem, setConfigItem] = useState<DinerItem | null>(null);
  // The cart line being changed, when the picker was opened from the cart.
  const [editingLine, setEditingLine] = useState<CartLine | null>(null);
  // What the online store offers (pick-up only / delivery only / both).
  const fulfillment = props.delivery?.fulfillment ?? "both";
  const [orderType, setOrderType] = useState<"pickup" | "delivery">(
    fulfillment === "delivery" ? "delivery" : "pickup",
  );
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [zone, setZone] = useState("");
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  // Structured shipping address (nationwide-shipping mode; no map pin).
  const [ship, setShip] = useState({ street: "", barangay: "", city: "", province: "", postal: "", landmark: "" });
  const setShipField = (k: keyof typeof ship, v: string) => setShip((s) => ({ ...s, [k]: v }));
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placedId, setPlacedId] = useState<string | null>(null);
  const [cartOpen, setCartOpen] = useState(false); // mobile cart sheet
  const [checkout, setCheckout] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  // Cheapest delivery fee to advertise on the hero info card (zones min, else
  // the distance/shipping base). Null when unknown → we show a softer message.
  const minDeliveryFee = useMemo(() => {
    if (zones.length > 0) return Math.min(...zones.map((z) => z.fee));
    const dc = props.delivery;
    if (dc && (dc.mode === "distance" || dc.mode === "shipping") && dc.baseFee > 0) return dc.baseFee;
    return null;
  }, [zones, props.delivery]);
  // A recent order saved in this browser — lets the customer re-open its status
  // even after closing the tab (shown as a banner above the menu).
  const [recentOrderPath, setRecentOrderPath] = useState<string | null>(null);
  useEffect(() => {
    const key = `servd:lastOrder:${slug}`;
    let cancelled = false;
    (async () => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const o = JSON.parse(raw);
        // Drop stale (>6h) or malformed entries.
        if (!o?.path || !o?.orderId || !o?.at || Date.now() - o.at >= 6 * 3600 * 1000) {
          localStorage.removeItem(key);
          return;
        }
        // Only offer the shortcut while the order is still in progress — once it's
        // completed / delivered / cancelled, forget it so the banner disappears.
        const st = await getWebOrderStatus(slug, o.orderId);
        if (cancelled) return;
        const done = !st || st.status === "closed" || st.status === "cancelled" || st.deliveryStatus === "delivered";
        if (done) {
          localStorage.removeItem(key);
          return;
        }
        setRecentOrderPath(o.path);
      } catch { /* storage unavailable */ }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  // Advance ordering ("order now for later"). Enabled alongside table bookings.
  const canSchedule = !!acceptsBookings;
  const initSched = useMemo(() => isoToPhParts(props.scheduleFor), [props.scheduleFor]);
  const todayPh = useMemo(() => new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10), []);
  const [schedMode, setSchedMode] = useState<"asap" | "later">(props.scheduleFor ? "later" : "asap");
  const [schedDate, setSchedDate] = useState(initSched.date);
  const [schedTime, setSchedTime] = useState(initSched.time);
  const [downpaymentRef, setDownpaymentRef] = useState("");
  // Coupon code (promotions/discounts).
  const [couponOpen, setCouponOpen] = useState(false);
  const [coupon, setCoupon] = useState("");
  const [couponBusy, setCouponBusy] = useState(false);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; amount: number; label: string } | null>(null);
  // Customer's agreement to pay the rider directly (required when the fee isn't
  // collected in-app).
  const [agreeRider, setAgreeRider] = useState(false);
  // Confirmation details for an advance order awaiting the owner's approval.
  const [placedAdvance, setPlacedAdvance] = useState<{ downpayment: number } | null>(null);
  // Payment method (cash / manual online QR). Each online method is only offered
  // if the owner set it up (enabled + a QR uploaded). The customer picks one.
  const pay = props.payment;
  const onlineMethods = [
    pay?.gcashEnabled && pay?.gcashQrUrl
      ? { key: "gcash" as const, label: "📱 GCash", name: pay.gcashName, number: pay.gcashNumber, qr: pay.gcashQrUrl }
      : null,
    pay?.mayaEnabled && pay?.mayaQrUrl
      ? { key: "maya" as const, label: "🟢 Maya", name: pay.mayaName ?? "", number: pay.mayaNumber ?? "", qr: pay.mayaQrUrl }
      : null,
    pay?.bankEnabled && pay?.bankQrUrl
      ? { key: "bank" as const, label: "🏦 Bank", name: pay.bankName ?? "", number: pay.bankNumber ?? "", qr: pay.bankQrUrl }
      : null,
  ].filter(Boolean) as { key: "gcash" | "maya" | "bank"; label: string; name: string; number: string; qr: string }[];
  const hasOnline = onlineMethods.length > 0;
  const [payMethod, setPayMethod] = useState<"cod" | "gcash" | "maya" | "bank">(
    pay && pay.codEnabled === false && hasOnline ? onlineMethods[0].key : "cod",
  );
  const [gcashRef, setGcashRef] = useState(""); // reference no. for the chosen online method
  // What the customer will hand over in cash, so the counter can count the
  // change before they arrive. It used to be left to the free-text
  // instructions box, where in practice nobody wrote it.
  const [cashWith, setCashWith] = useState("");
  const [receipt, setReceipt] = useState<string | null>(null); // uploaded payment screenshot (data URL)
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [riderNote, setRiderNote] = useState(""); // customer's note to the rider
  const [cutlery, setCutlery] = useState(true); // include cutlery/utensils (default yes)
  const selectedOnline = onlineMethods.find((m) => m.key === payMethod) ?? null;
  // The owner can insist on proof of payment before an online-paid order lands.
  const receiptRequired = !!pay?.requireReceipt && payMethod !== "cod";
  const receiptMissing = receiptRequired && !receipt;
  const phoneErr = phoneError(phone);

  /**
   * Prepare the receipt for sending.
   *
   * This used to swallow any failure and leave the receipt null, so a customer
   * whose phone produced an image the browser couldn't decode — HEIC, on every
   * iPhone — saw nothing happen, ordered anyway, and left the cashier with
   * "verify first" and nothing to verify. It now falls back to the original
   * bytes and says so out loud when it truly can't.
   */
  async function pickReceipt(file: File | undefined) {
    if (!file) return;
    setReceiptBusy(true);
    setReceiptError(null);
    const { dataUrl, error } = await prepareReceipt(file);
    setReceipt(dataUrl);
    setReceiptError(error);
    setReceiptBusy(false);
  }

  const count = cartCount(lines);
  const subtotal = cartTotal(lines);
  // Distance-based delivery: live fee from the store origin to the pinned drop-off.
  const dcfg = props.delivery;
  // Nationwide shipping: typed postal address + region fee, no map pin.
  const shippingMode = orderType === "delivery" && dcfg?.mode === "shipping";
  // Assembled shipping address string sent to the merchant (kept human-readable).
  const shippingAddress = [
    ship.street.trim(),
    ship.barangay.trim() && `Brgy. ${ship.barangay.trim()}`,
    ship.city.trim(),
    ship.province.trim(),
    ship.postal.trim(),
    ship.landmark.trim() && `(${ship.landmark.trim()})`,
  ].filter(Boolean).join(", ");
  const shippingReady = !!(ship.street.trim() && ship.barangay.trim() && ship.city.trim() && ship.province.trim() && zone);
  const distanceMode = orderType === "delivery" && dcfg?.mode === "distance" && dcfg.originLat != null && dcfg.originLng != null;
  // Whether to show the map pin. Distance mode always needs it; other modes only
  // when the owner keeps it on. Shipping never uses it.
  const showMap = orderType === "delivery" && !shippingMode && (distanceMode || dcfg?.mapEnabled !== false);
  const distance =
    distanceMode && geo
      ? computeDistanceFee(
          { baseFee: dcfg!.baseFee, perKm: dcfg!.perKm, freeKm: dcfg!.freeKm, minFee: dcfg!.minFee, maxKm: dcfg!.maxKm, roadFactor: dcfg!.roadFactor },
          haversineKm(dcfg!.originLat!, dcfg!.originLng!, geo.lat, geo.lng),
        )
      : null;
  const deliveryFeeEstimate =
    orderType !== "delivery"
      ? 0
      : distanceMode
        ? distance && !distance.outOfRange ? distance.fee : 0
        : zones.find((z) => z.name === zone)?.fee ?? 0;
  // Whether the delivery fee is collected in-app or paid to the rider directly.
  // Shipping is always prepaid in-app.
  const collectDeliveryFee = shippingMode ? true : dcfg?.feeInTotal !== false;
  const deliveryFee = collectDeliveryFee ? deliveryFeeEstimate : 0; // added to the total
  // COD fee — an extra charge on cash-on-delivery orders (delivery paid by cash).
  const isCod = orderType === "delivery" && payMethod === "cod";
  const cashTenderedCentavos = pesosToCentavos(Number(cashWith) || 0);
  const codFee = isCod && props.payment?.codFeeEnabled ? props.payment.codFee ?? 0 : 0;
  // Packaging fee for food packaging (tubs/containers) on to-go orders. Delivery
  // only, or pickup + delivery, per config — charged once per order, or per item
  // (× total quantity) when packagingFeeMode is "item".
  const packagingFee =
    props.payment?.packagingFeeEnabled &&
    (props.payment.packagingFeeScope === "all" || orderType === "delivery")
      ? (props.payment.packagingFee ?? 0) * (props.payment.packagingFeeMode === "item" ? count : 1)
      : 0;
  const discount = appliedPromo?.amount ?? 0;
  const total = Math.max(0, subtotal + deliveryFee + codFee + packagingFee - discount);
  // Change preview, shown live so the customer picks a note that actually works.
  const changePreview = cashTenderedCentavos > 0 ? cashTenderedCentavos - total : null;

  // A coupon's value can depend on the cart, delivery fee and order type — clear
  // it when any of those change so the customer re-applies (and the server stays
  // authoritative at placement).
  useEffect(() => {
    setAppliedPromo(null);
    setCouponError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal, deliveryFee, orderType]);

  async function applyCoupon() {
    const code = coupon.trim();
    if (!code) return;
    setCouponBusy(true);
    setCouponError(null);
    const res = await previewPromoCode({
      slug,
      code,
      lines: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, modifierIds: l.modifiers.map((m) => m.modifierId), variantId: l.variantId })),
      deliveryFee: orderType === "delivery" ? deliveryFee : 0,
    });
    setCouponBusy(false);
    if (res.ok) setAppliedPromo({ code, amount: res.amount, label: res.label });
    else { setAppliedPromo(null); setCouponError(res.error); }
  }
  const vat = Math.round(total - total / (1 + VAT_RATE));
  const nonEmpty = categories.filter((c) => c.items.length > 0);
  const q = search.trim().toLowerCase();
  const shownCats = q
    ? nonEmpty
        .map((c) => ({ ...c, items: c.items.filter((i) => i.name.toLowerCase().includes(q)) }))
        .filter((c) => c.items.length > 0)
    : nonEmpty;

  function pick(item: DinerItem) {
    if (!item.isAvailable) return;
    // Items with modifiers OR sizes need the picker; only plain items shortcut.
    if (item.groups.length === 0 && !(item.variants && item.variants.length > 0)) {
      setLines((p) => addCartLine(p, { lineId: lineId(), itemId: item.id, name: item.name, basePrice: item.price, unitPrice: item.price, quantity: 1, modifiers: [], imageUrl: item.imageUrl }));
    } else setConfigItem(item);
  }
  /**
   * Reopen the picker on a line already in the cart, pre-filled.
   *
   * Nothing happens if the item has since left the menu — there's no sensible
   * thing to edit against, and the line can still be removed.
   */
  function editLine(line: CartLine) {
    const item = categories.flatMap((c) => c.items).find((i) => i.id === line.itemId);
    if (!item) return;
    setEditingLine(line);
    setConfigItem(item);
  }

  function setQty(id: string, delta: number) {
    setLines((p) =>
      p.flatMap((l) => (l.lineId === id ? (l.quantity + delta <= 0 ? [] : [{ ...l, quantity: l.quantity + delta }]) : [l])),
    );
  }

  // When closed + paused, an advance order is still allowed — force "later".
  const forceLater = canSchedule && paused;
  const effectiveSchedMode: "asap" | "later" = forceLater ? "later" : schedMode;
  const schedulingLater = canSchedule && effectiveSchedMode === "later";
  const scheduledIso = schedulingLater ? phPartsToIso(schedDate, schedTime) : undefined;
  // Downpayment the customer will owe on this advance order (mirror of the server
  // calc; the server recomputes authoritatively).
  const bk = props.booking;
  const downpaymentDue = schedulingLater && bk?.requireDownpayment
    ? Math.max(0, Math.min(total, bk.downpaymentType === "percent" ? Math.round((total * bk.downpaymentValue) / 100) : bk.downpaymentValue))
    : 0;

  async function submit() {
    // Preview build: show the "activate to go live" prompt instead of ordering.
    // Nothing is sent — no order, no notification, no payment.
    if (demo) {
      onDemoOrder?.();
      return;
    }
    setBusy(true);
    setError(null);
    const res = await placeWebOrder({
      slug,
      orderType,
      customerName: name,
      customerPhone: phone,
      customerAddress: orderType === "delivery" ? (shippingMode ? shippingAddress : address) : undefined,
      deliveryZone: orderType === "delivery" ? zone || undefined : undefined,
      lat: orderType === "delivery" && !shippingMode ? geo?.lat : undefined,
      lng: orderType === "delivery" && !shippingMode ? geo?.lng : undefined,
      scheduledFor: scheduledIso,
      downpaymentRef: schedulingLater && downpaymentDue > 0 ? downpaymentRef || undefined : undefined,
      paymentChoice: payMethod,
      cashTendered: payMethod === "cod" && cashTenderedCentavos > 0 ? cashTenderedCentavos : undefined,
      paymentRef: payMethod !== "cod" ? gcashRef || undefined : undefined,
      paymentReceipt: payMethod !== "cod" ? receipt || undefined : undefined,
      customerNote: [
        cutlery ? null : "🚫 No cutlery",
        orderType === "delivery" && riderNote.trim() ? riderNote.trim() : null,
      ].filter(Boolean).join(" · ") || undefined,
      couponCode: appliedPromo?.code || undefined,
      lines: lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity, note: l.note, modifierIds: l.modifiers.map((m) => m.modifierId), variantId: l.variantId })),
    });
    setBusy(false);
    if (res.ok) {
      if (res.awaitingApproval) setPlacedAdvance({ downpayment: res.downpaymentAmount });
      setPlacedId(res.orderId);
    } else setError(res.error);
  }

  // Advance orders don't have a live status yet — they wait for the owner to
  // approve. Show a clear confirmation (with any downpayment steps) instead of
  // the live order tracker.
  if (placedId && placedAdvance) {
    return (
      <div className="min-h-screen bg-gray-100">
        <header className="sticky top-0 z-30 bg-plum-ink text-white">
          <div className="mx-auto flex h-16 max-w-3xl items-center gap-3 px-4">
            <span className="font-heading text-lg font-extrabold">{restaurantName}</span>
            <a href={home} className="ml-auto text-sm font-semibold text-white/80 hover:text-white">← Menu</a>
          </div>
        </header>
        <div className="mx-auto max-w-lg p-4">
          <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-3xl">✓</div>
            <h1 className="font-heading text-2xl font-bold text-plum-ink">Advance order received!</h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-plum-ink/60">
              Thanks, {name.trim() || "friend"}. Your order for{" "}
              <span className="font-semibold text-plum-ink/80">
                {scheduledIso ? new Date(scheduledIso).toLocaleString("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "your chosen time"}
              </span>{" "}
              is now pending the restaurant&apos;s approval. We&apos;ll contact you on {phone || "your number"} to confirm.
            </p>
            {placedAdvance.downpayment > 0 && (
              <div className="mt-4 rounded-xl bg-mango/10 p-4 text-left">
                <p className="font-heading font-bold text-plum-ink">Downpayment to confirm: {formatPeso(placedAdvance.downpayment)}</p>
                {bk?.downpaymentInstructions ? (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-plum-ink/70">{bk.downpaymentInstructions}</p>
                ) : (
                  <p className="mt-1 text-sm text-plum-ink/70">Please settle the downpayment to secure your order; the restaurant will confirm once received.</p>
                )}
                {downpaymentRef && <p className="mt-2 text-xs text-plum-ink/50">Your reference: <span className="font-semibold text-plum-ink/70">{downpaymentRef}</span></p>}
              </div>
            )}
            <a href={home} className="mt-6 inline-block rounded-xl bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white">Back to menu</a>
          </div>
        </div>
      </div>
    );
  }

  if (placedId) {
    return (
      <WebOrderTracker
        slug={slug}
        orderId={placedId}
        orderType={orderType}
        restaurantName={restaurantName}
        phone={phone}
        homeHref={home}
        selfBookRider={orderType === "delivery" && !!props.delivery?.selfBookRider}
        selfBookRiderNote={props.delivery?.selfBookRiderNote}
        pickupAddress={contact?.address ?? null}
      />
    );
  }

  // Reusable order/cart panel (right column on desktop, sheet on mobile).
  const cartPanel = (
    <div className="flex h-full flex-col">
      <div className="border-b border-black/5 px-4 py-3">
        <h2 className="font-heading text-sm font-bold uppercase tracking-wide text-plum-ink/70">My order</h2>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {lines.length === 0 ? (
          <p className="py-8 text-center text-sm text-plum-ink/40">Your cart is empty. Tap + on an item.</p>
        ) : (
          <ul className="space-y-3">
            {lines.map((l) => (
              <li key={l.lineId} className="flex gap-3 text-sm">
                <CartThumb src={l.imageUrl} alt={l.name} />
                {/* min-w-0 so a long item name wraps instead of pushing the
                    price off the edge of a phone screen. */}
                <div className="min-w-0 flex-1">
                  {/* The description taps through to the picker, pre-filled.
                      Changing a size or an add-on used to mean deleting the
                      line and building it again. */}
                  <button type="button" onClick={() => editLine(l)} className="block w-full text-left">
                    <div className="flex justify-between gap-2">
                      <span className="min-w-0 font-medium text-plum-ink">{l.name}</span>
                      <span className="shrink-0 font-semibold">{formatPeso(l.unitPrice * l.quantity)}</span>
                    </div>
                    {l.modifiers.length > 0 && <p className="text-xs text-plum-ink/50">{l.modifiers.map((m) => m.name).join(", ")}</p>}
                    {l.note && <p className="text-xs italic text-plum-ink/50">“{l.note}”</p>}
                  </button>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex items-center rounded-full border border-plum-ink/15">
                      <button onClick={() => setQty(l.lineId, -1)} className="px-2 text-lg">−</button>
                      <span className="w-6 text-center text-sm font-semibold">{l.quantity}</span>
                      <button onClick={() => setQty(l.lineId, 1)} className="px-2 text-lg">+</button>
                    </div>
                    <button onClick={() => editLine(l)} className="text-xs font-semibold text-brand-primary">Edit</button>
                    <button onClick={() => setLines((p) => p.filter((x) => x.lineId !== l.lineId))} className="text-xs font-semibold text-plum-ink/50 hover:text-guava">Remove</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Checkout details */}
        {checkout && lines.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-black/5 pt-4">
            {/* Only offer the order types this store actually accepts. */}
            {fulfillment === "both" ? (
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1">
                {(([["pickup", "🛍️ Pickup"], ["delivery", dcfg?.mode === "shipping" ? "🚚 Ship to me" : "🛵 Delivery"]]) as ["pickup" | "delivery", string][]).map(([k, label]) => (
                  <button key={k} onClick={() => setOrderType(k)} className={`rounded-md py-2 text-sm font-semibold ${orderType === k ? "bg-white text-red-600 shadow-sm" : "text-plum-ink/60"}`}>{label}</button>
                ))}
              </div>
            ) : (
              <div className="rounded-lg bg-gray-100 p-2 text-center text-sm font-semibold text-plum-ink">
                {fulfillment === "delivery"
                  ? dcfg?.mode === "shipping" ? "🚚 Ship to me" : "🛵 Delivery"
                  : "🛍️ Pickup"}
              </div>
            )}

            {/* When — order now, or schedule it for a future date/time. */}
            {canSchedule && (
              <div className="rounded-lg border border-plum-ink/10 p-2">
                {forceLater ? (
                  <p className="px-1 pb-1.5 text-xs font-semibold text-plum-ink/60">
                    🔒 We&apos;re closed right now — schedule your order for later:
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-1 rounded-lg bg-gray-100 p-1">
                    <button type="button" onClick={() => setSchedMode("asap")} className={`rounded-md py-1.5 text-xs font-semibold ${effectiveSchedMode === "asap" ? "bg-white text-red-600 shadow-sm" : "text-plum-ink/60"}`}>⏱ As soon as possible</button>
                    <button type="button" onClick={() => setSchedMode("later")} className={`rounded-md py-1.5 text-xs font-semibold ${effectiveSchedMode === "later" ? "bg-white text-red-600 shadow-sm" : "text-plum-ink/60"}`}>📅 Schedule for later</button>
                  </div>
                )}
                {effectiveSchedMode === "later" && (
                  <div className="mt-2 flex gap-2">
                    <input type="date" min={todayPh} value={schedDate} onChange={(e) => setSchedDate(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-plum-ink/15 px-2 py-2 text-sm" />
                    <input type="time" value={schedTime} onChange={(e) => setSchedTime(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-plum-ink/15 px-2 py-2 text-sm" />
                  </div>
                )}
                {schedulingLater && (
                  <p className="mt-2 px-1 text-xs text-plum-ink/50">📋 Advance orders are confirmed once the restaurant approves them.</p>
                )}
                {schedulingLater && downpaymentDue > 0 && (
                  <div className="mt-2 rounded-lg bg-mango/10 p-2">
                    <p className="text-xs font-bold text-plum-ink">
                      Downpayment to confirm: {formatPeso(downpaymentDue)}
                      {bk?.downpaymentType === "percent" ? ` (${bk.downpaymentValue}% of ${formatPeso(total)})` : ""}
                    </p>
                    {bk?.downpaymentInstructions && (
                      <p className="mt-1 whitespace-pre-wrap text-xs text-plum-ink/65">{bk.downpaymentInstructions}</p>
                    )}
                    <input
                      value={downpaymentRef}
                      onChange={(e) => setDownpaymentRef(e.target.value)}
                      placeholder="Payment reference (e.g. GCash ref no.)"
                      className="mt-2 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </div>
            )}

            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onBlur={() => {
                // Capture an abandoned-cart lead once a usable phone is entered.
                if (isValidPhone(phone) && lines.length > 0) {
                  captureCartLead({ slug, name, phone, itemCount: lines.length, total: subtotal }).catch(() => {});
                }
              }}
              inputMode="numeric"
              maxLength={13}
              placeholder="Phone number (e.g. 09171234567)"
              aria-invalid={!!phoneErr}
              className={`w-full rounded-lg border px-3 py-2 text-sm ${phoneErr ? "border-guava" : "border-plum-ink/15"}`}
            />
            {phoneErr && <p className="-mt-1 text-xs text-guava">{phoneErr}</p>}
            {orderType === "delivery" && (
              shippingMode ? (
                /* Nationwide shipping — typed postal address, no map pin. */
                <div className="space-y-2">
                  {zones.length > 0 && (
                    <select value={zone} onChange={(e) => setZone(e.target.value)} className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm">
                      <option value="">Select shipping region…</option>
                      {zones.map((z) => (
                        <option key={z.name} value={z.name}>{z.name} — {formatPeso(z.fee)}</option>
                      ))}
                    </select>
                  )}
                  <input value={ship.street} onChange={(e) => setShipField("street", e.target.value)} placeholder="House no., street, subdivision" className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
                  <input value={ship.barangay} onChange={(e) => setShipField("barangay", e.target.value)} placeholder="Barangay" className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={ship.city} onChange={(e) => setShipField("city", e.target.value)} placeholder="City / Municipality" className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
                    <input value={ship.province} onChange={(e) => setShipField("province", e.target.value)} placeholder="Province" className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={ship.postal} onChange={(e) => setShipField("postal", e.target.value)} inputMode="numeric" placeholder="Postal code (optional)" className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
                    <input value={ship.landmark} onChange={(e) => setShipField("landmark", e.target.value)} placeholder="Landmark (optional)" className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
                  </div>
                  <p className="text-[11px] text-plum-ink/45">📦 We&apos;ll ship this via courier and send you a tracking update once it&apos;s dispatched.</p>
                </div>
              ) : (
              <>
                {!distanceMode && zones.length > 0 && (
                  <select value={zone} onChange={(e) => setZone(e.target.value)} className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm">
                    <option value="">Select delivery zone…</option>
                    {zones.map((z) => (
                      <option key={z.name} value={z.name}>{z.name} — {formatPeso(z.fee)}</option>
                    ))}
                  </select>
                )}
                <textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} placeholder="Delivery address" className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm" />
                {showMap && (
                  <div>
                    <p className="mb-1 text-xs font-semibold text-plum-ink/60">Pin your location (required for delivery)</p>
                    <LocationPicker defaultCenter={props.storeCenter ?? undefined} onChange={(lat, lng) => setGeo({ lat, lng })} />
                    {!geo && <p className="mt-1 text-xs text-guava">Please pin your location to place a delivery order.</p>}
                    {distanceMode && geo && distance && (
                      distance.outOfRange ? (
                        <p className="mt-1 text-xs font-semibold text-guava">
                          Sorry — that&apos;s about {distance.billableKm.toFixed(1)} km away, outside our delivery range.
                        </p>
                      ) : (
                        <p className="mt-1 text-xs font-semibold text-plum-ink/70">
                          ≈ {distance.billableKm.toFixed(1)} km away
                          {collectDeliveryFee ? ` · Delivery ${formatPeso(distance.fee)}` : ""}
                        </p>
                      )
                    )}
                  </div>
                )}
                {!collectDeliveryFee && (
                  <div className="rounded-lg bg-mango/10 p-3">
                    <p className="text-xs text-plum-ink/70">
                      🛵 Only your food is charged here. The delivery fee is <span className="font-semibold text-plum-ink">paid directly to the rider</span> — the exact amount is set by the courier on arrival.
                    </p>
                    <label className="mt-2 flex items-start gap-2 text-xs font-semibold text-plum-ink">
                      <input type="checkbox" checked={agreeRider} onChange={(e) => setAgreeRider(e.target.checked)} className="mt-0.5" />
                      <span>I agree to pay the delivery fee directly to the rider on arrival.</span>
                    </label>
                  </div>
                )}
              </>
              )
            )}

            {orderType === "delivery" && (
              <div>
                <p className="mb-1 text-xs font-semibold text-plum-ink/60">Note to the rider (optional)</p>
                <textarea
                  value={riderNote}
                  onChange={(e) => setRiderNote(e.target.value)}
                  rows={2}
                  maxLength={500}
                  placeholder="e.g. Gate is blue, call when near, leave with guard, bring panukli. thank you"
                  className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
                />
              </div>
            )}

            <label className="flex items-center gap-2 text-sm text-plum-ink/70">
              <input type="checkbox" checked={cutlery} onChange={(e) => setCutlery(e.target.checked)} className="h-4 w-4" />
              🍴 Include cutlery / utensils
            </label>

            {/* Payment method — a choice whenever the owner offers any online
                method (GCash / Maya / Bank) alongside cash. */}
            {hasOnline && (
              <div>
                <p className="mb-1 text-xs font-semibold text-plum-ink/60">Payment</p>
                <div className="flex flex-wrap gap-1 rounded-lg bg-gray-100 p-1">
                  {pay?.codEnabled !== false && (
                    <button type="button" onClick={() => setPayMethod("cod")} className={`flex-1 rounded-md px-2 py-2 text-sm font-semibold ${payMethod === "cod" ? "bg-white text-red-600 shadow-sm" : "text-plum-ink/60"}`}>
                      💵 {orderType === "delivery" ? "Cash on delivery" : "Cash on pickup"}
                    </button>
                  )}
                  {onlineMethods.map((m) => (
                    <button
                      key={m.key}
                      type="button"
                      onClick={() => setPayMethod(m.key)}
                      className={`flex-1 whitespace-nowrap rounded-md px-2 py-2 text-sm font-semibold ${payMethod === m.key ? "bg-white text-blue-600 shadow-sm" : "text-plum-ink/60"}`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                {/* Cash: ask what they'll pay with, so the change is counted
                    before they get to the counter or the door. */}
                {payMethod === "cod" && (
                  <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/70 p-3">
                    <label className="block text-xs font-semibold text-plum-ink/70">
                      Magkano ang ibabayad mo? <span className="font-normal">(optional)</span>
                    </label>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {cashSuggestions(total).map((amount) => (
                        <button
                          key={amount}
                          type="button"
                          onClick={() => setCashWith(String(amount / 100))}
                          className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
                            cashWith === String(amount / 100)
                              ? "border-plum-ink bg-plum-ink text-white"
                              : "border-plum-ink/15 bg-white text-plum-ink/70"
                          }`}
                        >
                          {formatPeso(amount)}
                        </button>
                      ))}
                    </div>
                    <input
                      value={cashWith}
                      onChange={(e) => setCashWith(e.target.value.replace(/[^0-9.]/g, ""))}
                      inputMode="decimal"
                      placeholder="Or type the amount"
                      className="mt-2 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
                    />
                    {changePreview !== null && (
                      <p className="mt-1.5 text-xs font-semibold text-plum-ink/70">
                        {changePreview >= 0
                          ? `Sukli mo: ${formatPeso(changePreview)}`
                          : `Kulang pa ng ${formatPeso(-changePreview)}`}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-plum-ink/45">
                      Para handa na ang sukli mo pagdating mo.
                    </p>
                  </div>
                )}

                {selectedOnline && (
                  <div className="mt-2 rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-center">
                    <p className="text-xs font-semibold text-plum-ink/70">Scan to pay {formatPeso(total)}</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={selectedOnline.qr} alt={`${selectedOnline.label} QR`} className="mx-auto mt-2 h-44 w-44 rounded-lg border border-plum-ink/10 bg-white object-contain" />
                    {(selectedOnline.name || selectedOnline.number) && (
                      <p className="mt-2 text-xs text-plum-ink/60">
                        {selectedOnline.name}{selectedOnline.name && selectedOnline.number ? " · " : ""}{selectedOnline.number}
                      </p>
                    )}
                    <input
                      value={gcashRef}
                      onChange={(e) => setGcashRef(e.target.value)}
                      placeholder="Payment reference no. (optional)"
                      className="mt-2 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
                    />
                    {/* Optional: upload a screenshot of the payment receipt. */}
                    {receipt ? (
                      <div className="mt-2 flex items-center gap-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={receipt} alt="Payment receipt" className="h-14 w-14 rounded-lg border border-plum-ink/10 object-cover" />
                        <span className="text-xs font-semibold text-green-700">Receipt attached ✓</span>
                        <button type="button" onClick={() => setReceipt(null)} className="text-xs text-plum-ink/50 underline">remove</button>
                      </div>
                    ) : (
                      <label className="mt-2 block cursor-pointer rounded-lg border border-dashed border-plum-ink/25 px-3 py-2 text-xs font-semibold text-plum-ink/60">
                        {receiptBusy
                          ? "Processing…"
                          : receiptRequired
                            ? "📎 Upload payment receipt (required)"
                            : "📎 Upload payment receipt (optional)"}
                        {/* Any image type: an iPhone offers HEIC, and refusing
                            it at the picker is how you get a customer who
                            believes they attached something. */}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => pickReceipt(e.target.files?.[0])}
                        />
                      </label>
                    )}
                    {receiptError && (
                      <p className="mt-1 text-[11px] font-semibold text-guava">{receiptError}</p>
                    )}
                    {receiptRequired ? (
                      <p className="mt-1 text-[11px] font-semibold text-guava">
                        A screenshot of your payment is required before you can place this order.
                      </p>
                    ) : (
                      <p className="mt-1 text-[11px] text-plum-ink/45">Optional — add the reference or receipt to help us confirm, or just show your payment to the rider on arrival.</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Coupon code */}
            <div className="border-t border-black/5 pt-2">
              {appliedPromo ? (
                <div className="flex items-center justify-between rounded-lg bg-green-50 px-3 py-2 text-sm">
                  <span className="font-semibold text-green-700">🏷 {appliedPromo.label} applied ({appliedPromo.code.toUpperCase()})</span>
                  <button type="button" onClick={() => { setAppliedPromo(null); setCoupon(""); setCouponOpen(false); }} className="text-xs font-semibold text-plum-ink/50 hover:text-guava">Remove</button>
                </div>
              ) : !couponOpen ? (
                <button type="button" onClick={() => setCouponOpen(true)} className="text-sm font-semibold text-brand-primary">🏷 Have a coupon code?</button>
              ) : (
                <div>
                  <div className="flex items-center gap-2">
                    <input
                      value={coupon}
                      onChange={(e) => setCoupon(e.target.value)}
                      placeholder="Enter coupon code"
                      className="min-w-0 flex-1 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm uppercase placeholder:normal-case"
                    />
                    <button type="button" onClick={applyCoupon} disabled={couponBusy || !coupon.trim()} className="shrink-0 rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                      {couponBusy ? "…" : "Apply"}
                    </button>
                  </div>
                  {couponError && <p className="mt-1 text-xs text-guava">{couponError}</p>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-black/5 px-4 py-3">
        {checkout && (orderType === "delivery" || discount > 0 || packagingFee > 0) && (
          <div className="mb-1 space-y-0.5 text-sm text-plum-ink/60">
            <div className="flex justify-between"><span>Subtotal</span><span>{formatPeso(subtotal)}</span></div>
            {orderType === "delivery" && (collectDeliveryFee ? (
              <div className="flex justify-between"><span>{shippingMode ? "Shipping fee" : "Delivery fee"}</span><span>{deliveryFee > 0 ? formatPeso(deliveryFee) : "—"}</span></div>
            ) : (
              <div className="flex justify-between text-plum-ink/50">
                <span>Delivery</span>
                <span>Pay rider directly</span>
              </div>
            ))}
            {packagingFee > 0 && (
              <div className="flex justify-between">
                <span>Packaging fee{props.payment?.packagingFeeMode === "item" ? ` (×${count})` : ""}</span>
                <span>{formatPeso(packagingFee)}</span>
              </div>
            )}
            {codFee > 0 && (
              <div className="flex justify-between"><span>COD fee</span><span>{formatPeso(codFee)}</span></div>
            )}
            {discount > 0 && (
              <div className="flex justify-between font-semibold text-green-700">
                <span>Discount{appliedPromo ? ` (${appliedPromo.label})` : ""}</span><span>−{formatPeso(discount)}</span>
              </div>
            )}
          </div>
        )}
        <div className="flex items-center justify-between font-heading text-xl font-extrabold text-plum-ink">
          <span>TOTAL</span><span>{formatPeso(total)}</span>
        </div>
        {props.payment?.showVat !== false && (
          <p className="text-xs text-plum-ink/45">VAT (12%) included · {formatPeso(vat)}</p>
        )}
        {error && <p className="mt-2 text-sm text-guava">{error}</p>}
        {paused && !canSchedule ? (
          <div className="mt-3 rounded-lg bg-plum-ink/5 px-3 py-2 text-center text-sm font-semibold text-plum-ink/60">
            {pausedByOwner
              ? "🔒 We've paused online orders — the kitchen is at capacity. Please check back shortly."
              : "🔒 Online ordering is paused — we're closed right now."}
          </div>
        ) : !checkout ? (
          <button
            onClick={() => setCheckout(true)}
            disabled={lines.length === 0}
            className="mt-3 w-full rounded-lg bg-green-600 py-3 font-semibold text-white disabled:opacity-50"
          >
            Confirm Order
          </button>
        ) : (
          <button
            onClick={submit}
            disabled={!demo && (busy || receiptMissing || lines.length === 0 || !name.trim() || !isValidPhone(phone) || (schedulingLater && !scheduledIso) || (orderType === "delivery" && (shippingMode ? !shippingReady : (!address.trim() || (showMap && !geo) || !collectDeliveryFee && !agreeRider || (distanceMode ? !!distance?.outOfRange : (zones.length > 0 && !zone))))))}
            className="mt-3 w-full rounded-lg bg-green-600 py-3 font-semibold text-white disabled:opacity-50"
          >
            {busy
              ? "Placing…"
              : schedulingLater
                ? `Schedule ${orderType === "delivery" ? (shippingMode ? "" : "delivery ") : "pickup "}order`
                : `Place ${orderType === "delivery" ? (shippingMode ? "" : "delivery ") : "pickup "}order`}
          </button>
        )}
        {checkout && (
          <p className="mt-2 text-center text-xs text-plum-ink/40">
            {schedulingLater && scheduledIso
              ? `For ${new Date(scheduledIso).toLocaleString("en-PH", { timeZone: "Asia/Manila", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} · `
              : ""}
            {selectedOnline
              ? `Paying via ${selectedOnline.label.replace(/^[^\w]+\s*/, "")}.`
              : `Pay on ${orderType === "delivery" ? "delivery" : "pickup"}.`}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto max-w-xl bg-white shadow-sm">
        {/* Said up front, not only at the checkout button. Finding out after
            choosing a meal is the version of this that loses the customer. */}
        {pausedBanner && (
          <div className="bg-mango/15 px-4 py-2.5 text-center text-sm font-semibold text-plum-ink">
            ⏸ {pausedBanner}
          </div>
        )}
        {/* Hero cover + overlaid actions */}
        <div className="relative">
          <div className="relative h-48 w-full overflow-hidden bg-plum-ink sm:h-56">
            {props.coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={props.coverImageUrl} alt={restaurantName} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-plum-ink to-red-700 text-white/30">
                <span className="font-heading text-5xl font-extrabold">{restaurantName.charAt(0)}</span>
              </div>
            )}
            {/* Action buttons */}
            <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
              <button
                type="button"
                onClick={() => { if (window.history.length > 1) window.history.back(); else window.location.href = home; }}
                aria-label="Back"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg text-plum-ink shadow"
              >
                ←
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    const url = typeof window !== "undefined" ? window.location.href : "";
                    try {
                      if (navigator.share) await navigator.share({ title: restaurantName, url });
                      else { await navigator.clipboard.writeText(url); setShareCopied(true); setTimeout(() => setShareCopied(false), 1600); }
                    } catch { /* cancelled */ }
                  }}
                  aria-label="Share"
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-lg text-plum-ink shadow"
                >
                  ⤴
                </button>
              </div>
            </div>
            {shareCopied && (
              <p className="absolute right-3 top-16 rounded-full bg-plum-ink px-3 py-1 text-xs font-semibold text-white shadow">Link copied</p>
            )}
          </div>

          {/* Centered logo tile sitting IN FRONT of the cover (overlapping it) */}
          <div className="relative z-10 -mt-12 flex justify-center">
            {/* Height-fixed, width-flexible so a wide wordmark logo shows in
                full instead of being cropped to a square. */}
            <div className="flex h-20 min-w-[5rem] items-center justify-center overflow-hidden rounded-2xl bg-white px-3 shadow-lg ring-1 ring-black/5">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt={restaurantName} className="max-h-full w-auto max-w-[220px] object-contain" />
              ) : (
                <span className="font-heading text-2xl font-extrabold text-red-600">{restaurantName.charAt(0)}</span>
              )}
            </div>
          </div>
        </div>

        {/* Name + rating */}
        <div className="px-5 pt-3 text-center">
          <h1 className="font-heading text-2xl font-extrabold text-plum-ink">{restaurantName}</h1>
          <div className="mt-1 flex items-center justify-center gap-2 text-sm">
            {props.rating?.average != null ? (
              <span className="inline-flex items-center gap-1 font-semibold text-plum-ink">
                <span className="text-mango">★</span>
                {props.rating.average.toFixed(1)}
                <span className="font-normal text-plum-ink/50">({props.rating.count} rating{props.rating.count === 1 ? "" : "s"})</span>
              </span>
            ) : openNow != null ? (
              <span className={`inline-flex items-center gap-1.5 font-semibold ${openNow ? "text-green-600" : "text-plum-ink/50"}`}>
                <span className={`h-2 w-2 rounded-full ${openNow ? "bg-green-500" : "bg-plum-ink/40"}`} />
                {openNow ? "Open now" : "Closed"}
              </span>
            ) : null}
          </div>
        </div>

        {/* Delivery / Pick-up toggle — only when the store offers both;
            otherwise a static label of the one mode it offers. */}
        <div className="px-5 pt-4">
          {fulfillment === "both" ? (
            <div className="mx-auto flex w-full max-w-[280px] rounded-full bg-gray-100 p-1 text-sm font-bold">
              <button
                type="button"
                onClick={() => setOrderType("delivery")}
                className={`flex-1 rounded-full py-2 transition ${orderType === "delivery" ? "bg-white text-plum-ink shadow" : "text-plum-ink/50"}`}
              >
                🛵 Delivery
              </button>
              <button
                type="button"
                onClick={() => setOrderType("pickup")}
                className={`flex-1 rounded-full py-2 transition ${orderType === "pickup" ? "bg-white text-plum-ink shadow" : "text-plum-ink/50"}`}
              >
                🥡 Pick-up
              </button>
            </div>
          ) : (
            <div className="mx-auto w-fit rounded-full bg-gray-100 px-5 py-2 text-center text-sm font-bold text-plum-ink">
              {fulfillment === "delivery" ? "🛵 Delivery only" : "🥡 Pick-up only"}
            </div>
          )}
        </div>

        {/* Delivery / open info card */}
        <div className="px-5 pt-3">
          <div className="rounded-2xl border border-plum-ink/10 p-4">
            <div className="flex items-center justify-between">
              <p className="font-heading font-bold text-plum-ink">
                {orderType === "delivery" ? "🛵 Delivery" : "🥡 Pick-up"}
                {typeof openNow === "boolean" && (
                  <span className={`ml-2 align-middle text-xs font-semibold ${openNow ? "text-green-600" : "text-guava"}`}>
                    {openNow ? "· Open now" : "· Closed"}
                  </span>
                )}
              </p>
            </div>
            <p className="mt-1 text-sm text-plum-ink/60">
              {orderType === "delivery"
                ? minDeliveryFee != null
                  ? `Delivery fee from ${formatPeso(minDeliveryFee)}. Set your location at checkout.`
                  : "Delivery available. We'll confirm the fee for your area at checkout."
                : contact?.address
                  ? `Pick up at ${contact.address}`
                  : "Ready for pick-up at the store."}
            </p>
          </div>
        </div>

        {recentOrderPath && (
          <a
            href={recentOrderPath}
            className="mx-5 mt-3 block rounded-2xl bg-green-600 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-green-700"
          >
            🧾 You have a recent order — tap to track its status →
          </a>
        )}

      {/* Search */}
      <div className="px-5 pt-4">
        <div className="flex items-center gap-2 rounded-full bg-gray-100 px-4 py-2.5">
          <span className="text-plum-ink/40">🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search menu"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-plum-ink/40"
          />
        </div>
      </div>

      {/* Sticky category tabs — the same component the cashier's POS uses, so
          the two menus can't drift apart. */}
      {!q && (
        <CategoryTabs
          categories={nonEmpty.map((c) => ({ id: c.id, name: c.name }))}
          className="mt-3 px-5"
        />
      )}

      {/* Menu */}
      <main id="menu" className="px-5 pb-28 pt-4">
        {/* Loyalty promo card */}
        {loyalty?.enabled && (
          <div className="mb-4 overflow-hidden rounded-2xl bg-gradient-to-r from-red-600 to-orange-500 p-4 text-white shadow-sm">
            <p className="font-heading text-base font-extrabold">Earn reward points 🎉</p>
            <p className="mt-0.5 text-sm text-white/90">
              ₱{loyalty.pesosPerPoint} spent = 1 point. Enter your phone at checkout to start earning.
            </p>
          </div>
        )}

        {shownCats.length === 0 && <p className="rounded-2xl bg-gray-50 p-6 text-center text-sm text-plum-ink/50">No items match your search.</p>}
        {shownCats.map((cat, ci) => (
          <section key={cat.id} id={categorySectionId(cat.id)} className="mb-7 scroll-mt-16">
            <h2 className="mb-3 flex items-center gap-2 font-heading text-xl font-extrabold text-plum-ink">
              {ci === 0 && <span aria-hidden>🔥</span>}
              {cat.name}
            </h2>
            <div className="grid grid-cols-2 gap-3">
              {cat.items.map((item) => (
                <ProductCard key={item.id} item={item} onPick={pick} />
              ))}
            </div>
          </section>
        ))}

        {/* Below everything the diner came here to do, and above the cart bar's
            reserved space. Only new accounts without the white-label unlock
            reach this — see lib/branding/powered-by.ts. */}
        {poweredBy && <PoweredByServd className="mt-4 text-plum-ink/60" />}
      </main>
      </div>

      {/* Item config modal */}
      {configItem && (
        <ItemConfig
          item={configItem}
          editing={editingLine}
          onAdd={(l) => {
            // addCartLine merges identical lines; an edit has to replace the
            // one row it came from, or the original is left behind.
            setLines((p) => (editingLine ? replaceCartLine(p, l) : addCartLine(p, l)));
            setConfigItem(null);
            setEditingLine(null);
          }}
          onCancel={() => { setConfigItem(null); setEditingLine(null); }}
        />
      )}

      {/* Cart bar + sheet (centered at the app width). */}
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-xl p-3">
          <button onClick={() => setCartOpen(true)} className="flex w-full items-center justify-between rounded-full bg-green-600 px-5 py-3.5 font-semibold text-white shadow-lg">
            <span>{count} item{count > 1 ? "s" : ""}</span>
            <span>My order · {formatPeso(total)}</span>
          </button>
        </div>
      )}
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-center bg-black/40">
          {/* Centered app-width sheet: a fixed close bar, then the cart panel
              fills the rest (its own body scrolls, the footer stays put). */}
          <div className="flex h-full w-full max-w-xl flex-col bg-white">
            <div className="flex shrink-0 justify-end px-2 pt-1">
              <button onClick={() => setCartOpen(false)} className="px-2 text-2xl leading-none text-plum-ink/40" aria-label="Close">×</button>
            </div>
            <div className="min-h-0 flex-1">{cartPanel}</div>
          </div>
        </div>
      )}
    </div>
  );
}
