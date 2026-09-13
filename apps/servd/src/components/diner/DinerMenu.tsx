"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { formatPeso } from "@/lib/money";
import { DIETARY_TAGS, tagInfo } from "@/lib/menu/dietary";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { cartCount, cartTotal } from "@/lib/cart/pricing";
import { useCart } from "@/lib/cart/useCart";
import type { CartLine, DinerCategory, DinerItem } from "@/lib/cart/types";
import { placeOrder } from "@/server/orders/place-order";
import { previewPromoCode } from "@/server/promotions/redeem";
import type { PlaceOrderResult } from "@/lib/validation/order";
import { ItemModal } from "./ItemModal";
import { CartDrawer } from "./CartDrawer";
import { BillSheet } from "./BillSheet";
import { CallWaiterButton } from "./CallWaiterButton";
import { RewardsPanel } from "./RewardsPanel";
import { OrderStatusTracker } from "./OrderStatusTracker";
import { BrandSplash } from "./BrandSplash";
import { PoweredByServd } from "@/components/branding/PoweredByServd";
import { NO_SERVD_BRANDING, type ServdBranding } from "@/lib/branding/powered-by";

interface RestaurantBrand {
  name: string;
  logoUrl: string | null;
  coverImageUrl?: string | null;
  tagline: string | null;
}

interface PromoItem {
  id: string;
  title: string;
  description: string | null;
  code: string | null;
  type: string;
  value: number;
  freeItemId: string | null;
  minSpend: number;
}

/** Product card — image, "+" affordance, price pill, name. */
function ProductCard({
  item,
  soldOutLabel,
  onPick,
}: {
  item: DinerItem;
  soldOutLabel: string;
  onPick: (item: DinerItem) => void;
}) {
  return (
    <button
      type="button"
      disabled={!item.isAvailable}
      onClick={() => onPick(item)}
      className="group relative flex flex-col overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 ring-brand-ink/5 transition active:scale-[0.98] disabled:opacity-60"
    >
      <div className="relative aspect-square w-full bg-cream">
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-brand-gradient text-3xl font-bold text-white">
            {item.name.charAt(0)}
          </div>
        )}

        {/* + add affordance */}
        {item.isAvailable && (
          <span className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-brand-primary text-xl font-bold leading-none text-white shadow-md">
            +
          </span>
        )}

        {/* happy-hour ribbon */}
        {item.originalPrice && item.originalPrice > item.price && (
          <span className="absolute left-2 top-2 rounded-full bg-mango px-2 py-0.5 text-[10px] font-bold text-white shadow">
            ⏰ Happy hour
          </span>
        )}

        {/* price pill (struck-through original when on happy hour; "from" for sizes) */}
        <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-brand-primary px-2.5 py-1 text-xs font-extrabold text-white shadow">
          {item.originalPrice && item.originalPrice > item.price && (
            <span className="font-medium text-white/70 line-through">{formatPeso(item.originalPrice)}</span>
          )}
          {item.variants && item.variants.length > 0 && <span className="font-medium">from</span>}
          {formatPeso(item.price)}
        </span>

        {!item.isAvailable && (
          <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-sm font-bold text-brand-ink">
            {soldOutLabel}
          </span>
        )}
      </div>

      <div className="p-2.5">
        <p className="text-sm font-semibold leading-snug text-brand-ink">{item.name}</p>
        {item.description && (
          <p className="mt-0.5 line-clamp-1 text-xs text-brand-ink/50">{item.description}</p>
        )}
        <DietBadges tags={item.dietaryTags} />
      </div>
    </button>
  );
}

/** Diet/allergen badges — emoji chips with the tag label as a tooltip. */
function DietBadges({ tags, size = "sm" }: { tags: string[]; size?: "sm" | "md" }) {
  if (!tags?.length) return null;
  const resolved = tags.map(tagInfo).filter((t): t is NonNullable<typeof t> => !!t);
  if (resolved.length === 0) return null;
  return (
    <div className={`mt-1 flex flex-wrap gap-1 ${size === "md" ? "text-sm" : "text-[11px]"}`}>
      {resolved.map((t) => (
        <span
          key={t.key}
          title={t.label}
          className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 ${
            t.kind === "allergen"
              ? "bg-guava/10 text-guava"
              : "bg-brand-primary/10 text-brand-primary"
          }`}
        >
          <span>{t.emoji}</span>
          {size === "md" && <span className="font-medium">{t.label}</span>}
        </span>
      ))}
    </div>
  );
}

function NavButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
        active ? "text-brand-primary" : "text-brand-ink/50"
      }`}
    >
      {children}
      {label}
    </button>
  );
}

export function DinerMenu({
  restaurantId,
  slug,
  tableToken,
  tableNumber,
  isCounter = false,
  brand,
  categories,
  justPaid,
  googleReviewUrl = null,
  promotions = [],
  loyaltyEnabled = false,
  rating = null,
  branding = NO_SERVD_BRANDING,
}: {
  restaurantId: string;
  slug: string;
  tableToken: string;
  tableNumber: string;
  isCounter?: boolean;
  brand: RestaurantBrand;
  categories: DinerCategory[];
  justPaid?: boolean;
  googleReviewUrl?: string | null;
  promotions?: PromoItem[];
  loyaltyEnabled?: boolean;
  rating?: { count: number; average: number | null } | null;
  /**
   * Which Servd marks this table's menu carries — the splash after the scan and
   * the line at the foot. Decided on the server; see lib/branding/powered-by.ts.
   *
   * Defaults to exactly how the menu behaved before any of this existed: the
   * splash shows, nothing is added at the foot. So a caller that hasn't been
   * told about branding neither loses the splash nor gains a badge.
   */
  branding?: ServdBranding;
}) {
  const cart = useCart(restaurantId, tableToken);
  const t = useTranslations("diner");

  // Live tracking of the diner's most recent order (survives a refresh).
  const trackKey = `servd:order:${tableToken}`;
  const [trackedOrderId, setTrackedOrderId] = useState<string | null>(null);
  const [orderStatus, setOrderStatus] = useState<string>("pending");
  useEffect(() => {
    try {
      const saved = localStorage.getItem(trackKey);
      if (saved) setTrackedOrderId(saved);
    } catch {
      /* ignore */
    }
  }, [trackKey]);

  function startTracking(orderId: string) {
    setTrackedOrderId(orderId);
    try {
      localStorage.setItem(trackKey, orderId);
    } catch {
      /* ignore */
    }
  }
  function stopTracking() {
    setTrackedOrderId(null);
    try {
      localStorage.removeItem(trackKey);
    } catch {
      /* ignore */
    }
  }

  // Loyalty phone/name (remembered so orders earn points automatically).
  const loyaltyKey = `servd:loyaltyPhone:${restaurantId}`;
  const loyaltyNameKey = `servd:loyaltyName:${restaurantId}`;
  const [loyaltyPhone, setLoyaltyPhone] = useState("");
  const [loyaltyName, setLoyaltyName] = useState("");
  useEffect(() => {
    try {
      setLoyaltyPhone(localStorage.getItem(loyaltyKey) ?? "");
      setLoyaltyName(localStorage.getItem(loyaltyNameKey) ?? "");
    } catch {
      /* ignore */
    }
  }, [loyaltyKey, loyaltyNameKey]);
  function saveLoyaltyPhone(p: string, n?: string) {
    setLoyaltyPhone(p);
    try {
      localStorage.setItem(loyaltyKey, p);
      if (n) {
        setLoyaltyName(n);
        localStorage.setItem(loyaltyNameKey, n);
      }
    } catch {
      /* ignore */
    }
  }

  async function submitOrder(): Promise<PlaceOrderResult> {
    return placeOrder({
      slug,
      tableToken,
      loyaltyPhone: loyaltyPhone || undefined,
      couponCode: appliedPromo ? couponCode.trim() : undefined,
      lines: cart.lines.map((l) => ({
        itemId: l.itemId,
        quantity: l.quantity,
        note: l.note,
        modifierIds: l.modifiers.map((m) => m.modifierId),
        variantId: l.variantId,
      })),
    });
  }

  // --- Coupon code (applied at checkout) ---
  const [couponCode, setCouponCode] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<{ label: string; amount: number } | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);

  async function applyCoupon() {
    const code = couponCode.trim();
    if (!code) return;
    setCouponBusy(true);
    setCouponError(null);
    try {
      const res = await previewPromoCode({
        slug,
        code,
        lines: cart.lines.map((l) => ({
          itemId: l.itemId,
          quantity: l.quantity,
          modifierIds: l.modifiers.map((m) => m.modifierId),
          variantId: l.variantId,
        })),
      });
      if (res.ok) {
        setAppliedPromo({ label: res.label, amount: res.amount });
      } else {
        setAppliedPromo(null);
        setCouponError(res.error);
      }
    } catch {
      setAppliedPromo(null);
      setCouponError("Couldn't check that code. Please try again.");
    } finally {
      setCouponBusy(false);
    }
  }

  function clearCoupon() {
    setCouponCode("");
    setAppliedPromo(null);
    setCouponError(null);
  }

  const [activeItem, setActiveItem] = useState<DinerItem | null>(null);
  // A cart line being changed rather than a new item being added. Null means
  // the picker is open to add something.
  const [editingLine, setEditingLine] = useState<CartLine | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);
  const [promosOpen, setPromosOpen] = useState(false);
  const [rewardsOpen, setRewardsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState("all");
  const [dietFilter, setDietFilter] = useState<Set<string>>(new Set());
  // Whether the drinks upsell has been resolved for the current cart session.
  const [upsellDone, setUpsellDone] = useState(false);
  // Branded welcome splash shown right after the QR scan, before the menu.
  const [splashDone, setSplashDone] = useState(false);

  const count = cartCount(cart.lines);
  const total = cartTotal(cart.lines);
  const nonEmpty = categories.filter((c) => c.items.length > 0);

  // Drinks / desserts, detected by category name — powers the place-order upsell.
  const DRINK_RE = /drink|beverage|juice|coffee|tea|shake|soda|smoothie|frappe|lemonade|water|cola/i;
  const DESSERT_RE = /dessert|sweet|cake|ice ?cream|pastry|gelato|halo/i;
  // Every item on the menu, flat — used to find the item a cart line came from
  // when the diner taps it to change something.
  const allItems = categories.flatMap((c) => c.items);
  const drinkItemIds = new Set(
    categories.filter((c) => DRINK_RE.test(c.name)).flatMap((c) => c.items.map((i) => i.id)),
  );
  const upsellItems = categories
    .filter((c) => DRINK_RE.test(c.name) || DESSERT_RE.test(c.name))
    .flatMap((c) => c.items.filter((i) => i.isAvailable))
    .slice(0, 6);
  const cartHasDrink = cart.lines.some((l) => drinkItemIds.has(l.itemId));
  // Show the upsell before sending the order when there's no drink yet.
  const showUpsellFirst = upsellItems.length > 0 && !cartHasDrink && !upsellDone;

  // Flatten for searching / filtering.
  const flat = nonEmpty.flatMap((c) => c.items.map((it) => ({ it, catId: c.id, catName: c.name })));
  const q = search.trim().toLowerCase();

  // Diet-preference filters: only offer tags that actually appear on the menu.
  const menuDietKeys = new Set(flat.flatMap(({ it }) => it.dietaryTags ?? []));
  const dietChips = DIETARY_TAGS.filter((t) => t.kind === "diet" && menuDietKeys.has(t.key));
  const activeDiets = [...dietFilter];

  let shown = q
    ? flat.filter(({ it }) => it.name.toLowerCase().includes(q))
    : activeCat === "all"
      ? flat
      : flat.filter(({ catId }) => catId === activeCat);
  if (activeDiets.length > 0) {
    shown = shown.filter(({ it }) => activeDiets.every((k) => (it.dietaryTags ?? []).includes(k)));
  }

  function scrollTop() {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="relative mx-auto min-h-screen max-w-md bg-brand-surface pb-24">
      {/* "Powered by Servd" welcome splash — shown first, before the menu.
          Skipped entirely for a restaurant that bought the full white-label
          unlock: they paid for Servd's name not to appear in front of their
          customers, and this is the most prominent place it did. */}
      {branding.showSplash && !splashDone && <BrandSplash onDone={() => setSplashDone(true)} />}

      {/* Hero cover + centered logo + name + rating (scrolls away) */}
      <div className="relative">
        <div className="relative h-40 w-full overflow-hidden bg-brand-ink">
          {brand.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brand.coverImageUrl} alt={brand.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-brand-gradient text-white/30">
              <span className="font-heading text-5xl font-extrabold">{brand.name.charAt(0)}</span>
            </div>
          )}
          {/* Overlaid actions */}
          <div className="absolute inset-x-0 top-0 flex items-center justify-end gap-2 p-3">
            <div className="rounded-full bg-white/90 shadow"><LanguageSwitcher /></div>
            <button
              onClick={() => setSheetOpen(true)}
              aria-label="More"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-brand-ink shadow"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
        {/* Logo tile — sits in front of the cover (overlapping it) */}
        <div className="relative z-10 -mt-11 flex justify-center">
          {/* Height-fixed, width-flexible so a wide wordmark logo isn't cropped. */}
          <div className="flex h-[70px] min-w-[70px] items-center justify-center overflow-hidden rounded-2xl bg-white px-3 shadow-lg ring-1 ring-black/5">
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.logoUrl} alt={brand.name} className="max-h-full w-auto max-w-[200px] object-contain" />
            ) : (
              <span className="font-heading text-xl font-extrabold text-brand-primary">{brand.name.charAt(0)}</span>
            )}
          </div>
        </div>
        <div className="px-5 pt-2 text-center">
          <h1 className="font-heading text-xl font-extrabold text-brand-ink">{brand.name}</h1>
          <div className="mt-0.5 flex items-center justify-center gap-2 text-sm">
            {rating?.average != null && (
              <span className="inline-flex items-center gap-1 font-semibold text-brand-ink">
                <span className="text-mango">★</span>
                {rating.average.toFixed(1)}
                <span className="font-normal text-brand-ink/50">({rating.count})</span>
              </span>
            )}
            <span className="rounded-full bg-brand-primary/10 px-2.5 py-0.5 text-xs font-bold text-brand-primary">
              {isCounter ? "🧾 Counter" : `${t("table")} ${tableNumber}`}
            </span>
          </div>
        </div>
      </div>

      {/* Sticky search + tabs */}
      <header className="sticky top-0 z-20 mt-3 border-b border-brand-ink/10 bg-brand-surface/95 backdrop-blur">
        {/* Search */}
        <div className="px-4 pb-3 pt-3">
          <div className="flex items-center gap-2 rounded-full border border-brand-ink/10 bg-white px-3 py-2">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-brand-ink/40">
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" strokeLinecap="round" />
            </svg>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-full bg-transparent text-sm outline-none placeholder:text-brand-ink/40"
            />
          </div>
        </div>

        {/* Category chips */}
        {nonEmpty.length > 1 && !q && (
          <div className="flex gap-2 overflow-x-auto px-4 pb-3">
            <button
              onClick={() => setActiveCat("all")}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold ${
                activeCat === "all" ? "bg-brand-primary text-white" : "bg-white text-brand-ink/70 ring-1 ring-brand-ink/10"
              }`}
            >
              {t("all")}
            </button>
            {nonEmpty.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveCat(c.id)}
                className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-semibold ${
                  activeCat === c.id ? "bg-brand-primary text-white" : "bg-white text-brand-ink/70 ring-1 ring-brand-ink/10"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* Dietary preference filters */}
        {dietChips.length > 0 && !q && (
          <div className="flex gap-2 overflow-x-auto px-4 pb-3">
            {dietChips.map((tag) => {
              const on = dietFilter.has(tag.key);
              return (
                <button
                  key={tag.key}
                  onClick={() =>
                    setDietFilter((prev) => {
                      const next = new Set(prev);
                      next.has(tag.key) ? next.delete(tag.key) : next.add(tag.key);
                      return next;
                    })
                  }
                  className={`flex items-center gap-1 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${
                    on ? "bg-brand-primary text-white" : "bg-white text-brand-ink/70 ring-1 ring-brand-ink/10"
                  }`}
                >
                  <span>{tag.emoji}</span>
                  {tag.label}
                </button>
              );
            })}
          </div>
        )}
      </header>

      {justPaid && (
        <div className="mx-4 mt-3 rounded-lg bg-mango/15 px-3 py-2 text-sm text-brand-ink">
          {t("paymentConfirming")}
        </div>
      )}

      {trackedOrderId && (
        <div className="px-4">
          <OrderStatusTracker
            restaurantId={restaurantId}
            slug={slug}
            tableToken={tableToken}
            orderId={trackedOrderId}
            isCounter={isCounter}
            googleReviewUrl={googleReviewUrl}
            onDismiss={stopTracking}
            onStatus={setOrderStatus}
          />
        </div>
      )}

      {/* Product grid */}
      <main className="px-4 pt-4">
        {shown.length === 0 ? (
          <p className="mt-16 text-center text-sm text-brand-ink/50">
            {q ? t("noResults") : t("menuUnavailable")}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {shown.map(({ it }) => (
              <ProductCard key={it.id} item={it} soldOutLabel={t("soldOut")} onPick={setActiveItem} />
            ))}
          </div>
        )}

        {/* At the foot of the menu, under everything the diner scrolled for.
            New accounts only — anyone already trading before this existed is
            grandfathered, and the white-label unlock removes it. */}
        {branding.showFooter && <PoweredByServd className="mt-6 text-brand-ink/60" />}
      </main>

      {/* Floating "Get the bill" — appears once the food is ready (dine-in only;
          counter/stall customers pay at the counter, so there's no table bill) */}
      {!isCounter && trackedOrderId && orderStatus === "done" && (
        <div className="fixed inset-x-0 bottom-24 z-30 mx-auto flex max-w-md flex-col items-center gap-2 px-4">
          <button
            onClick={() => setBillOpen(true)}
            className="rounded-full px-6 py-3 text-sm font-semibold text-white shadow-lg btn-brand"
          >
            🧾 {t("requestBill")}
          </button>
          {loyaltyEnabled && (
            <button
              onClick={() => setRewardsOpen(true)}
              className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-brand-primary shadow-lg ring-1 ring-brand-primary/20"
            >
              ⭐ Earn loyalty points
            </button>
          )}
        </div>
      )}

      {/* Bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 mx-auto flex max-w-md items-end justify-around border-t border-brand-ink/10 bg-white px-2 pb-1 pt-1 shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
        <NavButton label={t("navHome")} onClick={scrollTop}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V21h14V9.5" />
          </svg>
        </NavButton>
        <NavButton label={t("navMenu")} onClick={scrollTop}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </NavButton>

        {/* Center cart */}
        <button onClick={() => setCartOpen(true)} className="relative -mt-6 flex flex-col items-center">
          <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-brand-primary text-white shadow-lg ring-4 ring-white">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="20" r="1.5" />
              <circle cx="18" cy="20" r="1.5" />
              <path d="M2 3h3l2.4 12.2a1.5 1.5 0 0 0 1.5 1.3h8.2a1.5 1.5 0 0 0 1.5-1.2L22 7H6" />
            </svg>
            {count > 0 && (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-mango px-1 text-[11px] font-bold text-white ring-2 ring-white">
                {count}
              </span>
            )}
          </span>
        </button>

        <NavButton label={t("navPromos")} onClick={() => setPromosOpen(true)}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0l-7-7V4h9.6l7.4 7.4a2 2 0 0 1 0 2.8Z" />
            <circle cx="7.5" cy="7.5" r="1.3" />
          </svg>
        </NavButton>
        <NavButton label={t("navMyOrder")} active={!!trackedOrderId} onClick={() => (trackedOrderId ? scrollTop() : setSheetOpen(true))}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2h12v20l-3-2-3 2-3-2-3 2Z" />
            <path d="M9 7h6M9 11h6" />
          </svg>
        </NavButton>
      </nav>

      {/* Cart drawer (rendered before the item modal so the modal stacks on top
          when adding an upsell drink to the same order) */}
      {cartOpen && (
        <CartDrawer
          lines={cart.lines}
          onSetQty={cart.setQty}
          onRemove={cart.removeLine}
          onEdit={(line) => {
            // Reopen the picker on the item this line came from, pre-filled.
            // Falls back to doing nothing if the item has since left the menu —
            // there's nothing sensible to edit against.
            const item = allItems.find((i) => i.id === line.itemId);
            if (!item) return;
            setEditingLine(line);
            setActiveItem(item);
            setCartOpen(false);
          }}
          onClose={() => setCartOpen(false)}
          onPlaceOrder={submitOrder}
          onPlaced={(orderId) => {
            cart.clear();
            clearCoupon();
            startTracking(orderId);
            setUpsellDone(false); // reset for the next order
          }}
          upsellItems={upsellItems}
          showUpsellFirst={showUpsellFirst}
          onPickUpsell={(it) => setActiveItem(it)}
          onUpsellResolved={() => setUpsellDone(true)}
          couponCode={couponCode}
          onCouponCode={(c) => {
            setCouponCode(c);
            if (appliedPromo) setAppliedPromo(null);
            if (couponError) setCouponError(null);
          }}
          appliedPromo={appliedPromo}
          couponError={couponError}
          couponBusy={couponBusy}
          onApplyCoupon={applyCoupon}
          onClearCoupon={clearCoupon}
        />
      )}

      {/* Item detail / add modal */}
      {activeItem && (
        <ItemModal
          item={activeItem}
          editing={editingLine}
          onAdd={(line) => {
            // Same line id when editing, so it updates in place instead of
            // leaving the original sitting next to its replacement.
            if (editingLine) cart.replaceLine(line);
            else cart.addLine(line);
            setActiveItem(null);
            setEditingLine(null);
            if (editingLine) setCartOpen(true); // straight back to the cart
          }}
          onClose={() => {
            setActiveItem(null);
            if (editingLine) setCartOpen(true);
            setEditingLine(null);
          }}
        />
      )}

      {/* Promotions sheet */}
      {promosOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setPromosOpen(false)}>
          <div
            className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-tile bg-white p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-brand-ink/15" />
            {loyaltyEnabled && (
              <div className="mb-4">
                <RewardsPanel slug={slug} phone={loyaltyPhone} name={loyaltyName} onPhone={saveLoyaltyPhone} />
              </div>
            )}
            <h2 className="font-heading text-lg font-bold text-brand-ink">🎁 {t("navPromos")}</h2>
            {promotions.length === 0 ? (
              <p className="mt-3 text-sm text-brand-ink/55">{t("noPromos")}</p>
            ) : (
              <ul className="mt-4 space-y-3">
                {promotions.map((p) => (
                  <li key={p.id} className="rounded-tile border border-brand-primary/20 bg-brand-primary/5 p-4">
                    <p className="font-heading font-bold text-brand-ink">{p.title}</p>
                    {p.description && (
                      <p className="mt-1 text-sm text-brand-ink/65">{p.description}</p>
                    )}
                    {p.code && (
                      <p className="mt-2 text-sm text-brand-ink/70">
                        Use code{" "}
                        <span className="rounded-md bg-white px-2 py-0.5 font-mono font-bold text-brand-primary">
                          {p.code}
                        </span>{" "}
                        at checkout
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Rewards sheet — prompted after requesting the bill */}
      {rewardsOpen && loyaltyEnabled && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setRewardsOpen(false)}>
          <div className="w-full max-w-md rounded-t-tile bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-brand-ink/15" />
            <RewardsPanel slug={slug} phone={loyaltyPhone} name={loyaltyName} onPhone={saveLoyaltyPhone} />
            <button
              onClick={() => setRewardsOpen(false)}
              className="mt-4 w-full rounded-full border border-brand-ink/15 py-2.5 text-sm font-semibold"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Bill sheet — itemized bill + cash / online payment choice */}
      {billOpen && (
        <BillSheet
          slug={slug}
          tableToken={tableToken}
          onClose={() => setBillOpen(false)}
        />
      )}

      {/* More sheet — pay online, request bill, feedback */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={() => setSheetOpen(false)}>
          <div
            className="w-full max-w-md rounded-t-tile bg-white p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-brand-ink/15" />
            <h2 className="font-heading text-lg font-bold text-brand-ink">{t("moreOptions")}</h2>
            <div className="mt-4 flex flex-col gap-3">
              {loyaltyEnabled && (
                <RewardsPanel
                  slug={slug}
                  phone={loyaltyPhone}
                  name={loyaltyName}
                  onPhone={saveLoyaltyPhone}
                />
              )}
              {!isCounter && <CallWaiterButton slug={slug} tableToken={tableToken} />}
              {!isCounter && (
                <button
                  onClick={() => {
                    setSheetOpen(false);
                    setBillOpen(true);
                  }}
                  className="rounded-full py-3 text-center text-sm font-semibold text-white btn-brand"
                >
                  🧾 {t("requestBill")}
                </button>
              )}
              <a
                href={`/order/${slug}/${tableToken}/feedback`}
                className="rounded-full border border-brand-ink/15 py-3 text-center text-sm font-semibold text-brand-ink"
              >
                {t("leaveFeedback")}
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
