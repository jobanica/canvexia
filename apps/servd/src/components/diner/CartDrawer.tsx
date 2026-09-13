"use client";

import { useState } from "react";
import { CartThumb } from "./CartThumb";
import { useTranslations } from "next-intl";
import { formatPeso } from "@/lib/money";
import { cartTotal } from "@/lib/cart/pricing";
import type { CartLine, DinerItem } from "@/lib/cart/types";
import type { PlaceOrderResult } from "@/lib/validation/order";

export function CartDrawer({
  lines,
  onSetQty,
  onRemove,
  onEdit,
  onClose,
  onPlaceOrder,
  onPlaced,
  upsellItems,
  showUpsellFirst,
  onPickUpsell,
  onUpsellResolved,
  couponCode,
  onCouponCode,
  appliedPromo,
  couponError,
  couponBusy,
  onApplyCoupon,
  onClearCoupon,
}: {
  lines: CartLine[];
  onSetQty: (lineId: string, qty: number) => void;
  onRemove: (lineId: string) => void;
  /** Reopen the item picker on an existing line, to change size/add-ons/note. */
  onEdit?: (line: CartLine) => void;
  onClose: () => void;
  onPlaceOrder: () => Promise<PlaceOrderResult>;
  onPlaced: (orderId: string) => void;
  upsellItems: DinerItem[];
  // True when the cart has no drink yet and the upsell hasn't been resolved.
  showUpsellFirst: boolean;
  onPickUpsell: (item: DinerItem) => void;
  onUpsellResolved: () => void;
  couponCode: string;
  onCouponCode: (code: string) => void;
  appliedPromo: { label: string; amount: number } | null;
  couponError: string | null;
  couponBusy: boolean;
  onApplyCoupon: () => void;
  onClearCoupon: () => void;
}) {
  const total = cartTotal(lines);
  const discount = appliedPromo?.amount ?? 0;
  const netTotal = Math.max(0, total - discount);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placedId, setPlacedId] = useState<string | null>(null);
  const [view, setView] = useState<"cart" | "upsell">("cart");
  const t = useTranslations("cart");

  // The actual order send — only happens once the upsell is resolved.
  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const result = await onPlaceOrder();
      if (result.ok) {
        setPlacedId(result.orderId);
        onPlaced(result.orderId); // clear the cart + start tracking the order
      } else {
        setError(result.error);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false); // never leave the button stuck on "Sending…"
    }
  }

  // Tapping "Place order": offer the drinks upsell FIRST (so we don't send the
  // order to the cashier until the diner decides — avoids a second order).
  function handlePlaceClick() {
    if (showUpsellFirst) {
      setView("upsell");
      return;
    }
    submit();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-tile bg-white p-5 sm:rounded-tile">
        {placedId ? (
          // Success state
          <div className="py-8 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand-gradient text-2xl text-white">
              ✓
            </div>
            <h2 className="mt-4 font-heading text-xl font-bold text-brand-ink">
              {t("orderSent")}
            </h2>
            <p className="mt-1 text-sm text-brand-ink/60">
              {t("reference", { ref: placedId.slice(0, 8) })}
            </p>
            <button
              onClick={onClose}
              className="mt-6 w-full rounded-full py-3 font-semibold btn-brand"
            >
              {t("done")}
            </button>
          </div>
        ) : view === "upsell" ? (
          // Drinks & desserts upsell — shown before the order is sent.
          <div>
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-xl font-bold text-brand-ink">Anything to drink? 🥤</h2>
              <button onClick={onClose} aria-label="Close" className="text-2xl leading-none text-plum-ink/40">×</button>
            </div>
            <p className="mt-1 text-sm text-plum-ink/60">
              Add a drink or dessert to your order before we send it to the kitchen.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {upsellItems.map((it) => (
                <button
                  key={it.id}
                  onClick={() => {
                    // Keep the order pending — open the add modal so the diner can
                    // add this drink to the SAME order, then place once.
                    setView("cart");
                    onUpsellResolved();
                    onPickUpsell(it);
                  }}
                  className="overflow-hidden rounded-tile border border-plum-ink/10 bg-white text-left transition hover:shadow-md"
                >
                  {it.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.imageUrl} alt={it.name} className="h-24 w-full object-cover" />
                  ) : (
                    <div className="h-24 w-full" style={{ background: "var(--brand-gradient)", opacity: 0.12 }} />
                  )}
                  <div className="p-2.5">
                    <p className="line-clamp-1 text-sm font-semibold text-brand-ink">{it.name}</p>
                    <p className="mt-0.5 text-sm font-bold text-brand-primary">{formatPeso(it.price)}</p>
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                // Declined — NOW send the order to the cashier.
                setView("cart");
                onUpsellResolved();
                submit();
              }}
              disabled={submitting}
              className="mt-4 w-full rounded-full py-3 font-semibold btn-brand disabled:opacity-60"
            >
              {submitting ? t("sending") : "No thanks — place order"}
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-xl font-bold text-brand-ink">
                {t("yourOrder")}
              </h2>
              <button
                onClick={onClose}
                aria-label="Close"
                className="text-2xl leading-none text-plum-ink/40"
              >
                ×
              </button>
            </div>

            {lines.length === 0 ? (
              <p className="mt-6 text-center text-sm text-plum-ink/50">
                {t("empty")}
              </p>
            ) : (
              <ul className="mt-4 divide-y divide-plum-ink/5">
                {lines.map((line) => (
                  <li key={line.lineId} className="flex gap-3 py-3">
                    <CartThumb src={line.imageUrl} alt={line.name} />
                    {/* min-w-0 so a long name wraps rather than pushing the
                        price off the edge of a phone screen. */}
                    <div className="min-w-0 flex-1">
                    {/* The whole description is the edit target. Changing your
                        mind about a size or an add-on used to mean deleting the
                        line and building it again from scratch. */}
                    <button
                      type="button"
                      onClick={() => onEdit?.(line)}
                      disabled={!onEdit}
                      className="block w-full text-left disabled:cursor-default"
                    >
                      <div className="flex justify-between gap-2">
                        <span className="min-w-0 font-medium text-brand-ink">
                          {line.name}
                        </span>
                        <span className="shrink-0 font-semibold">
                          {formatPeso(line.unitPrice * line.quantity)}
                        </span>
                      </div>
                      {line.modifiers.length > 0 && (
                        <p className="text-xs text-plum-ink/50">
                          {line.modifiers.map((m) => m.name).join(", ")}
                        </p>
                      )}
                      {line.note && (
                        <p className="text-xs italic text-plum-ink/50">
                          “{line.note}”
                        </p>
                      )}
                    </button>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="flex items-center rounded-full border border-plum-ink/15">
                        <button
                          onClick={() => onSetQty(line.lineId, line.quantity - 1)}
                          className="px-3 py-1 text-lg"
                          aria-label="Decrease"
                        >
                          −
                        </button>
                        <span className="w-7 text-center text-sm font-semibold">
                          {line.quantity}
                        </span>
                        <button
                          onClick={() => onSetQty(line.lineId, line.quantity + 1)}
                          className="px-3 py-1 text-lg"
                          aria-label="Increase"
                        >
                          +
                        </button>
                      </div>
                      {onEdit && (
                        <button
                          onClick={() => onEdit(line)}
                          className="text-xs font-semibold text-brand-primary"
                        >
                          Edit
                        </button>
                      )}
                      <button
                        onClick={() => onRemove(line.lineId)}
                        className="text-xs font-semibold text-plum-ink/50 hover:text-guava"
                      >
                        {t("remove")}
                      </button>
                    </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {error && <p className="mt-3 text-sm text-guava">{error}</p>}

            {lines.length > 0 && (
              <div className="mt-4 border-t border-plum-ink/10 pt-4">
                {/* Coupon code */}
                <div className="mb-3">
                  {appliedPromo ? (
                    <div className="flex items-center justify-between rounded-lg border border-mango/40 bg-mango/10 px-3 py-2 text-sm">
                      <span className="font-semibold text-mango">
                        🎟️ {appliedPromo.label} applied
                      </span>
                      <button
                        onClick={onClearCoupon}
                        className="text-xs font-semibold text-plum-ink/50 hover:text-guava"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex gap-2">
                        <input
                          value={couponCode}
                          onChange={(e) => onCouponCode(e.target.value.toUpperCase())}
                          placeholder="Coupon code"
                          className="min-w-0 flex-1 rounded-lg border border-plum-ink/15 px-3 py-2 text-sm uppercase"
                        />
                        <button
                          onClick={onApplyCoupon}
                          disabled={couponBusy || !couponCode.trim()}
                          className="rounded-lg border border-plum-ink/15 px-4 py-2 text-sm font-semibold disabled:opacity-50"
                        >
                          {couponBusy ? "…" : "Apply"}
                        </button>
                      </div>
                      {couponError && <p className="mt-1 text-xs text-guava">{couponError}</p>}
                    </>
                  )}
                </div>

                {discount > 0 && (
                  <div className="flex justify-between text-sm text-mango">
                    <span>{appliedPromo?.label}</span>
                    <span>−{formatPeso(discount)}</span>
                  </div>
                )}
                <div className="mt-1 flex justify-between font-heading text-lg font-bold">
                  <span>{t("total")}</span>
                  <span>{formatPeso(netTotal)}</span>
                </div>
                <button
                  onClick={handlePlaceClick}
                  disabled={submitting}
                  className="mt-4 w-full rounded-full py-3 font-semibold btn-brand disabled:opacity-60"
                >
                  {submitting ? t("sending") : t("placeOrder")}
                </button>
                <p className="mt-2 text-center text-xs text-brand-ink/40">
                  {t("payNote")}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
