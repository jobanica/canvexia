"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatPeso, formatDelta } from "@/lib/money";
import {
  unitPrice,
  validateSelection,
  selectionToLineModifiers,
  cartTotal,
} from "@/lib/cart/pricing";
import type { CartLine, DinerCategory, DinerItem, Selection } from "@/lib/cart/types";
import {
  getPosMenu,
  getPosTables,
  createCashierOrder,
  searchPosCustomers,
  type CashierTable,
  type CounterMethod,
  type PosCustomer,
} from "@/server/orders/cashier";
import { printKitchenTicket, printPaidTicket } from "@/server/printing/print";
import { PayModal } from "./PayModal";
import { shouldPayFirst } from "@/lib/orders/pay-first";
import { runPrintDispatch, sendDrawerKick } from "@/lib/print/run-dispatch";
import { printFailureMessage } from "@/lib/print/print-failure";
import { CategoryTabs, categorySectionId } from "@/components/menu/CategoryTabs";
import {
  ORDER_TYPES,
  ORDER_TYPE_LABEL,
  ORDER_TYPE_HINT,
  needsAddress,
  type OrderTypeKey,
} from "@/lib/orders/order-type";
import { PosItemTile } from "./PosItemTile";
import { useStockMode } from "./useStockMode";
import { StockModeButton, StockModeBanner } from "./StockModeBar";

export function lineId(): string {
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
 * size, note and modifiers) by bumping its quantity — so tapping an item four
 * times shows one "4×" row instead of four separate rows.
 */
export function addCartLine(prev: CartLine[], line: CartLine): CartLine[] {
  const key = lineSig(line);
  const idx = prev.findIndex((l) => lineSig(l) === key);
  if (idx === -1) return [...prev, line];
  const next = [...prev];
  next[idx] = { ...next[idx], quantity: next[idx].quantity + line.quantity };
  return next;
}

/** Change a cart line's quantity by delta; removes it when it drops to zero. */
export function changeLineQty(prev: CartLine[], id: string, delta: number): CartLine[] {
  return prev.flatMap((l) => {
    if (l.lineId !== id) return [l];
    const q = l.quantity + delta;
    return q <= 0 ? [] : [{ ...l, quantity: q }];
  });
}

/** Inline modifier/quantity picker for one menu item (no i18n dependency). */
export function ItemConfig({
  item,
  onAdd,
  onCancel,
}: {
  item: DinerItem;
  onAdd: (line: CartLine) => void;
  onCancel: () => void;
}) {
  const variants = item.variants ?? [];
  const inStock = (v: { stock?: number | null }) => v.stock == null || v.stock > 0;
  const [variantId, setVariantId] = useState<string>((variants.find(inStock) ?? variants[0])?.id ?? "");
  const [selection, setSelection] = useState<Selection>({});
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [showError, setShowError] = useState(false);

  const chosenVariant = variants.find((v) => v.id === variantId) ?? null;
  const variantOut = !!chosenVariant && !inStock(chosenVariant);
  const effItem = useMemo(() => (chosenVariant ? { ...item, price: chosenVariant.price } : item), [item, chosenVariant]);
  const price = useMemo(() => unitPrice(effItem, selection), [effItem, selection]);
  const error = useMemo(() => validateSelection(effItem, selection), [effItem, selection]);

  function toggle(groupId: string, modId: string, single: boolean, max: number) {
    setSelection((prev) => {
      const current = prev[groupId] ?? [];
      if (single) return { ...prev, [groupId]: [modId] };
      if (current.includes(modId)) return { ...prev, [groupId]: current.filter((m) => m !== modId) };
      if (current.length >= max) return prev;
      return { ...prev, [groupId]: [...current, modId] };
    });
  }

  function add() {
    if (error || variantOut) {
      setShowError(true);
      return;
    }
    onAdd({
      lineId: lineId(),
      itemId: item.id,
      name: chosenVariant ? `${item.name} (${chosenVariant.name})` : item.name,
      basePrice: effItem.price,
      unitPrice: price,
      quantity,
      modifiers: selectionToLineModifiers(effItem, selection),
      note: note.trim() || undefined,
      variantId: chosenVariant?.id,
    });
  }

  return (
    <div className="rounded-lg border border-plum-ink/15 bg-cream/40 p-3">
      <div className="flex items-start justify-between">
        <span className="font-semibold text-plum-ink">{item.name}</span>
        <button onClick={onCancel} className="text-sm text-plum-ink/40">
          ×
        </button>
      </div>

      {variants.length > 0 && (
        <fieldset className="mt-3">
          <legend className="text-xs font-semibold uppercase tracking-wide text-plum-ink/50">
            Size <span className="text-guava">*</span>
          </legend>
          <div className="mt-1 space-y-1">
            {variants.map((v) => {
              const out = !inStock(v);
              return (
                <label
                  key={v.id}
                  className={`flex items-center justify-between rounded-md border border-plum-ink/10 bg-white px-2 py-1 text-sm ${out ? "opacity-50" : ""}`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`${item.id}-variant`}
                      disabled={out}
                      checked={variantId === v.id}
                      onChange={() => setVariantId(v.id)}
                    />
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
          <fieldset key={group.id} className="mt-3">
            <legend className="text-xs font-semibold uppercase tracking-wide text-plum-ink/50">
              {group.name} {group.required && <span className="text-guava">*</span>}
            </legend>
            <div className="mt-1 space-y-1">
              {group.modifiers.map((mod) => (
                <label
                  key={mod.id}
                  className="flex items-center justify-between rounded-md border border-plum-ink/10 bg-white px-2 py-1 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <input
                      type={single ? "radio" : "checkbox"}
                      name={`${item.id}-${group.id}`}
                      checked={chosen.includes(mod.id)}
                      onChange={() => toggle(group.id, mod.id, single, group.maxSelect)}
                    />
                    {mod.name}
                  </span>
                  {mod.priceDelta !== 0 && (
                    <span className="text-brand-primary">{formatDelta(mod.priceDelta)}</span>
                  )}
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (optional)"
        className="mt-3 w-full rounded-md border border-plum-ink/15 px-2 py-1 text-sm"
      />

      {showError && error && <p className="mt-2 text-xs text-guava">{error}</p>}

      <div className="mt-3 flex items-center gap-2">
        <div className="flex items-center rounded-full border border-plum-ink/15">
          <button onClick={() => setQuantity((q) => Math.max(1, q - 1))} className="px-2 py-1">
            −
          </button>
          <span className="w-7 text-center text-sm font-semibold">{quantity}</span>
          <button onClick={() => setQuantity((q) => q + 1)} className="px-2 py-1">
            +
          </button>
        </div>
        <button
          onClick={add}
          disabled={!!error || variantOut}
          className="flex-1 rounded-full py-2 text-sm font-semibold btn-brand disabled:opacity-50"
        >
          {variantOut ? "Sold out" : `Add · ${formatPeso(price * quantity)}`}
        </button>
      </div>
    </div>
  );
}

export function NewOrderModal({
  onClose,
  onCreated,
  onPaymentIssue,
  onPrintIssue,
  payFirst = false,
  cardSurchargeBp = 0,
}: {
  onClose: () => void;
  onCreated: (tables: CashierTable[]) => void;
  /** Surfaced when the order was created but its payment didn't record. */
  onPaymentIssue?: (message: string) => void;
  /** Surfaced when a ticket couldn't be printed. The order still went through. */
  onPrintIssue?: (message: string) => void;
  /** The shop takes payment before the food is made (Printer settings). */
  payFirst?: boolean;
  cardSurchargeBp?: number;
}) {
  const [menu, setMenu] = useState<DinerCategory[] | null>(null);
  const [tables, setTables] = useState<{ id: string; tableNumber: string }[]>([]);
  const [tableId, setTableId] = useState("");
  const [orderType, setOrderType] = useState<OrderTypeKey>("dine_in");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  // Saved-customer search (auto-fills name/phone/address from past orders).
  const [custQuery, setCustQuery] = useState("");
  const [custResults, setCustResults] = useState<PosCustomer[]>([]);
  const [custOpen, setCustOpen] = useState(false);
  // Menu search + the scrolling column the category tabs observe.
  const [itemQuery, setItemQuery] = useState("");
  const menuScrollRef = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<CartLine[]>([]);
  const [configItem, setConfigItem] = useState<DinerItem | null>(null);
  // The pay-before-you-sit-down step. Open, the till is taking the money as
  // part of ringing the order up rather than settling it later off the board.
  const [payOpen, setPayOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // "86 it" — the cashier taking a dish off the menu when it runs out and the
  // owner isn't around to do it from the office.
  const { stockMode, busyId, note, toggleMode, toggleStock } = useStockMode(setMenu);

  useEffect(() => {
    (async () => {
      try {
        const [m, t] = await Promise.all([getPosMenu(), getPosTables()]);
        setMenu(m);
        setTables(t);
        if (t.length === 1) setTableId(t[0].id);
      } catch {
        setLoadError("Couldn't load the menu. Please try again.");
      }
    })();
  }, []);

  // Debounced saved-customer search.
  useEffect(() => {
    const q = custQuery.trim();
    if (q.length < 2) {
      setCustResults([]);
      return;
    }
    const id = setTimeout(() => {
      searchPosCustomers(q).then(setCustResults).catch(() => setCustResults([]));
    }, 300);
    return () => clearTimeout(id);
  }, [custQuery]);

  function pickCustomer(c: PosCustomer) {
    setCustomerName(c.name);
    setCustomerPhone(c.phone);
    if (c.address) setCustomerAddress(c.address);
    setCustQuery("");
    setCustResults([]);
    setCustOpen(false);
  }

  const total = cartTotal(lines);
  const nonEmpty = (menu ?? []).filter((c) => c.items.length > 0);

  /**
   * Search across the whole menu, then category tabs over what's left.
   *
   * A till with hundreds of items was one long scroll — the cashier had to
   * remember roughly where a dish lived and hunt for it with a customer
   * waiting. Typing beats scrolling when you know the name, and the tabs beat
   * both when you don't; the strip is hidden while searching because the
   * results are already a filtered list.
   */
  const q = itemQuery.trim().toLowerCase();
  const shownCats = q
    ? nonEmpty
        .map((c) => ({ ...c, items: c.items.filter((i) => i.name.toLowerCase().includes(q)) }))
        .filter((c) => c.items.length > 0)
    : nonEmpty;

  function pickItem(item: DinerItem) {
    // While the sold-out switch is on, a tap flips the dish rather than
    // ordering it — including the sold-out ones, which is how they come back.
    if (stockMode) {
      void toggleStock(item);
      return;
    }
    if (!item.isAvailable) return;
    // No modifiers AND no sizes → add straight away; otherwise open the panel.
    if (item.groups.length === 0 && !(item.variants && item.variants.length > 0)) {
      setLines((prev) =>
        addCartLine(prev, {
          lineId: lineId(),
          itemId: item.id,
          name: item.name,
          basePrice: item.price,
          unitPrice: item.price,
          quantity: 1,
          modifiers: [],
        }),
      );
    } else {
      setConfigItem(item);
    }
  }

  async function submit(payNow?: { method: CounterMethod; tenderedCentavos?: number }) {
    setSubmitError(null);
    setSubmitting(true);
    const res = await createCashierOrder({
      orderType,
      // Blank means no table — the server gives the ticket a number instead.
      tableId: orderType === "dine_in" ? tableId || undefined : undefined,
      customerName: orderType === "dine_in" ? undefined : customerName,
      customerPhone: orderType === "dine_in" ? undefined : customerPhone,
      customerAddress: needsAddress(orderType) ? customerAddress : undefined,
      payNow,
      lines: lines.map((l) => ({
        itemId: l.itemId,
        quantity: l.quantity,
        note: l.note,
        modifierIds: l.modifiers.map((m) => m.modifierId),
        variantId: l.variantId,
      })),
    });
    setSubmitting(false);
    setPayOpen(false);
    if (res.ok && res.tables) {
      onCreated(res.tables);
      // The order went through but the money didn't. Said plainly, and the
      // modal stays shut — the ticket is on the board waiting to be settled,
      // and re-punching it would be a duplicate.
      if (res.paymentError) {
        onPaymentIssue?.(
          `Order created, but the payment didn't record — settle it from the board. (${res.paymentError})`,
        );
      }
      // No kitchen display → print the kitchen ticket from the browser.
      //
      // Non-blocking, but NOT silent. The order is already on the board either
      // way; what changed is that a docket which didn't come out now says so,
      // instead of leaving the counter to work it out when the food never
      // arrives at the pass.
      if (res.printKitchen && res.printOrderId) {
        try {
          const k = await printKitchenTicket(res.printOrderId);
          await runPrintDispatch(k, res.printOrderId, "kitchen");
        } catch (e) {
          const msg = printFailureMessage("kitchen", e, navigator.userAgent);
          if (msg) onPrintIssue?.(msg);
        }
      }
      // Browser print transports: the receipt and the drawer pulse come back
      // for the client to send, the same as settling from the board.
      if (res.printReceipt && res.printOrderId) {
        try {
          const t = await printPaidTicket(res.printOrderId);
          await runPrintDispatch(t, res.printOrderId, "receipt");
        } catch (e) {
          const msg = printFailureMessage("receipt", e, navigator.userAgent);
          if (msg) onPrintIssue?.(msg);
        }
      }
      if (res.drawerKickBase64) {
        try {
          await sendDrawerKick(res.drawerKickBase64);
        } catch {
          // The drawer is the one thing worth staying quiet about: the money
          // was taken, the receipt printed, and a drawer that didn't pop is
          // opened with the No sale button in two seconds.
        }
      }
      onClose();
    } else {
      setSubmitError(res.error ?? "Could not create the order.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/40 sm:items-center">
      <div className="flex h-[100dvh] max-h-[100dvh] w-full max-w-5xl flex-col bg-white sm:h-auto sm:max-h-[90vh] sm:rounded-tile">
        <div className="flex items-center justify-between border-b border-plum-ink/10 p-4">
          <h2 className="font-heading text-xl font-bold">New order (POS)</h2>
          <button onClick={onClose} className="text-2xl leading-none text-plum-ink/40" aria-label="Close">
            ×
          </button>
        </div>

        {loadError ? (
          <p className="p-6 text-sm text-guava">{loadError}</p>
        ) : !menu ? (
          <p className="p-6 text-sm text-plum-ink/50">Loading menu…</p>
        ) : (
          <div className={`grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden ${lines.length > 0 ? "md:grid-cols-[1fr_320px]" : ""}`}>
            {/* Menu */}
            <div ref={menuScrollRef} className="min-h-0 overflow-y-auto">
              {/* Search + tabs stay put while the items scroll under them. */}
              <div className="sticky top-0 z-30 bg-white px-4 pt-3">
                <div className="flex items-center gap-2">
                  <input
                    value={itemQuery}
                    onChange={(e) => setItemQuery(e.target.value)}
                    placeholder="🔍 Search the menu…"
                    className="min-w-0 flex-1 rounded-lg border border-plum-ink/15 bg-cream/40 px-3 py-2 text-sm"
                  />
                  {/* Close any half-finished size/modifier panel on the way in:
                      it belongs to the order pad, and in stock mode there is
                      no order pad. */}
                  <StockModeButton
                    on={stockMode}
                    onClick={() => {
                      setConfigItem(null);
                      toggleMode();
                    }}
                  />
                </div>
                {stockMode && <StockModeBanner note={note} />}
              </div>
              {!q && !stockMode && (
                <CategoryTabs
                  categories={nonEmpty.map((c) => ({ id: c.id, name: c.name }))}
                  scrollRef={menuScrollRef}
                  stickyOffset={104}
                  className="top-[52px] px-4"
                />
              )}

              <div className="p-4">
              {nonEmpty.length === 0 && (
                <p className="text-sm text-plum-ink/50">No menu items yet.</p>
              )}
              {q && shownCats.length === 0 && (
                <p className="py-6 text-center text-sm text-plum-ink/50">
                  Nothing matches &ldquo;{itemQuery.trim()}&rdquo;.
                </p>
              )}
              {shownCats.map((cat) => (
                <section
                  key={cat.id}
                  id={categorySectionId(cat.id)}
                  className="mb-5 scroll-mt-[104px]"
                >
                  <h3 className="mb-2 font-heading text-sm font-bold uppercase tracking-wide text-plum-ink/55">
                    {cat.name}
                  </h3>
                  <div className="grid grid-cols-3 gap-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                    {cat.items.map((item) =>
                      configItem?.id === item.id ? (
                        <div key={item.id} className="col-span-full">
                          <ItemConfig
                            item={item}
                            onAdd={(line) => {
                              setLines((prev) => addCartLine(prev, line));
                              setConfigItem(null);
                            }}
                            onCancel={() => setConfigItem(null)}
                          />
                        </div>
                      ) : (
                        <PosItemTile
                          key={item.id}
                          item={item}
                          onPick={pickItem}
                          stockMode={stockMode}
                          busy={busyId === item.id}
                        />
                      ),
                    )}
                  </div>
                </section>
              ))}
              </div>
            </div>

            {/* Order summary — hidden until the first item is added, so the
                cashier browses the menu first.

                min-h-0 throughout: without it a flex child won't shrink below
                its content, so a long order pushes the footer past the bottom
                of the overflow-hidden grid and Send to kitchen becomes
                unreachable — exactly when the order is big enough to matter. */}
            {lines.length > 0 && (
            <div className="flex min-h-0 flex-col border-t border-plum-ink/10 md:border-l md:border-t-0">
              {/* ONE scroll region for everything above the footer.

                  The order-type picker and the customer fields used to sit
                  outside it as a shrink-0 block. Pick Delivery on a short phone
                  and those three inputs alone are taller than the panel, so
                  they pushed Send to kitchen off the bottom — and nothing could
                  scroll to reach it, because the only scrollable region was the
                  cart list underneath. */}
              <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="space-y-3 border-b border-plum-ink/10 p-4">
                {/* Order type */}
                <div className="grid grid-cols-3 gap-1 rounded-lg bg-cream/60 p-1">
                  {/* All five types, named exactly as the kitchen display and
                      the receipt will name them. */}
                  {ORDER_TYPES.map((k) => (
                    <button
                      key={k}
                      onClick={() => setOrderType(k)}
                      title={ORDER_TYPE_HINT[k]}
                      className={`rounded-md py-1.5 text-[11px] font-semibold ${
                        orderType === k ? "bg-white text-brand-primary shadow-sm" : "text-plum-ink/60"
                      }`}
                    >
                      {ORDER_TYPE_LABEL[k]}
                    </button>
                  ))}
                </div>

                {orderType === "dine_in" ? (
                  <div>
                    <select
                      value={tableId}
                      onChange={(e) => setTableId(e.target.value)}
                      className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
                    >
                      {/* Optional. Plenty of shops take the order at the
                          counter and seat people afterwards, or have no floor
                          plan at all — requiring a table stopped them ringing
                          up an order they were standing in front of. */}
                      <option value="">No table — use an order number</option>
                      {tables.map((t) => (
                        <option key={t.id} value={t.id}>
                          Table {t.tableNumber}
                        </option>
                      ))}
                    </select>
                    {!tableId && (
                      <p className="mt-1 text-xs text-plum-ink/50">
                        This ticket gets today&apos;s next order number, and the customer is
                        called by it.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Search a saved customer → auto-fills the details below. */}
                    <div className="relative">
                      <input
                        value={custQuery}
                        onChange={(e) => { setCustQuery(e.target.value); setCustOpen(true); }}
                        onFocus={() => setCustOpen(true)}
                        placeholder="🔍 Search saved customer (name or phone)"
                        className="w-full rounded-lg border border-plum-ink/15 bg-cream/40 px-3 py-2 text-sm"
                      />
                      {custOpen && custResults.length > 0 && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setCustOpen(false)} />
                          <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-plum-ink/15 bg-white shadow-lg">
                            {custResults.map((c) => (
                              <li key={c.phone}>
                                <button
                                  type="button"
                                  onClick={() => pickCustomer(c)}
                                  className="block w-full px-3 py-2 text-left text-sm hover:bg-cream"
                                >
                                  <span className="font-semibold text-plum-ink">{c.name || "(no name)"}</span>
                                  <span className="text-plum-ink/50"> · {c.phone}</span>
                                  {c.address && <span className="block truncate text-xs text-plum-ink/45">📍 {c.address}</span>}
                                </button>
                              </li>
                            ))}
                          </ul>
                        </>
                      )}
                    </div>
                    <input
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Customer name"
                      className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
                    />
                    <input
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="Phone (optional)"
                      className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
                    />
                    {needsAddress(orderType) && (
                      <textarea
                        value={customerAddress}
                        onChange={(e) => setCustomerAddress(e.target.value)}
                        rows={2}
                        placeholder="Delivery address"
                        className="w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
                      />
                    )}
                  </div>
                )}
              </div>

              <div className="p-4">
                {lines.length === 0 ? (
                  <p className="text-sm text-plum-ink/40">No items yet. Tap menu items to add.</p>
                ) : (
                  <ul className="space-y-2">
                    {lines.map((l) => (
                      <li key={l.lineId} className="flex items-start justify-between gap-2 text-sm">
                        <div className="min-w-0">
                          <span className="font-medium">{l.name}</span>
                          {l.modifiers.length > 0 && (
                            <p className="text-xs text-plum-ink/50">
                              {l.modifiers.map((m) => m.name).join(", ")}
                            </p>
                          )}
                          {l.note && <p className="text-xs italic text-plum-ink/50">“{l.note}”</p>}
                          <div className="mt-1 flex items-center gap-2">
                            <div className="flex items-center rounded-full border border-plum-ink/15">
                              <button
                                onClick={() => setLines((prev) => changeLineQty(prev, l.lineId, -1))}
                                className="px-2 py-0.5 text-plum-ink/70"
                                aria-label="Decrease quantity"
                              >
                                −
                              </button>
                              <span className="w-6 text-center text-xs font-semibold">{l.quantity}</span>
                              <button
                                onClick={() => setLines((prev) => changeLineQty(prev, l.lineId, 1))}
                                className="px-2 py-0.5 text-plum-ink/70"
                                aria-label="Increase quantity"
                              >
                                +
                              </button>
                            </div>
                            <button
                              onClick={() => setLines((prev) => prev.filter((x) => x.lineId !== l.lineId))}
                              className="text-xs text-muted hover:text-guava"
                            >
                              remove
                            </button>
                          </div>
                        </div>
                        <span className="whitespace-nowrap font-semibold">{formatPeso(l.unitPrice * l.quantity)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              </div>

              {/* Always visible. shrink-0 keeps it out of the scroll, and the
                  safe-area padding keeps it clear of an iPhone's home
                  indicator — the button being reachable is the whole point. */}
              <div className="shrink-0 border-t border-plum-ink/10 bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {submitError && <p className="mb-2 text-sm text-guava">{submitError}</p>}
                <div className="mb-3 flex justify-between font-heading text-lg font-bold">
                  <span>Total</span>
                  <span>{formatPeso(total)}</span>
                </div>
                {/* Which button is the big one, and nothing more. A pay-first
                    shop leads with the money; everyone else leads with the
                    kitchen. Either way both routes are one tap away, because a
                    till that can only do it one way is a till someone has to
                    work around. */}
                {(() => {
                  const blocked =
                    submitting ||
                    lines.length === 0 ||
                    (orderType !== "dine_in" && !customerName.trim()) ||
                    (needsAddress(orderType) && !customerAddress.trim());
                  const takesPaymentFirst = shouldPayFirst(orderType, payFirst);

                  return (
                    <>
                      <button
                        onClick={() => (takesPaymentFirst ? setPayOpen(true) : void submit())}
                        disabled={blocked}
                        className="w-full rounded-full py-3 font-semibold btn-brand disabled:opacity-50"
                      >
                        {submitting
                          ? takesPaymentFirst
                            ? "Recording…"
                            : "Sending to kitchen…"
                          : takesPaymentFirst
                            ? `Take payment · ${formatPeso(total)}`
                            : "Send to kitchen"}
                      </button>
                      <button
                        onClick={() => (takesPaymentFirst ? void submit() : setPayOpen(true))}
                        disabled={blocked}
                        className="mt-2 w-full rounded-full py-2 text-xs font-semibold text-plum-ink/55 disabled:opacity-50"
                      >
                        {takesPaymentFirst
                          ? "Send to kitchen without paying"
                          : "Take payment now instead"}
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>
            )}
          </div>
        )}
      </div>

      {payOpen && (
        <PayModal
          label={
            orderType === "dine_in"
              ? tableId
                ? `Table ${tables.find((t) => t.id === tableId)?.tableNumber ?? ""}`.trim()
                : "New order"
              : `${ORDER_TYPE_LABEL[orderType]}${customerName.trim() ? ` — ${customerName.trim()}` : ""}`
          }
          due={total}
          busy={submitting}
          cardSurchargeBp={cardSurchargeBp}
          onConfirm={(method, _change, tendered) =>
            void submit({ method, tenderedCentavos: tendered })
          }
          onCancel={() => setPayOpen(false)}
        />
      )}
    </div>
  );
}
