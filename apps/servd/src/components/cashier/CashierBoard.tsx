"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { signOut } from "@/app/(platform)/login/actions";
import {
  getCashierTables,
  getIncomingOrders,
  acceptOrder,
  declineOrder,
  markOrderPaid,
  type CounterMethod,
  markServed,
  closeOrder,
  settleThirdParty,
  type CashierTable,
  type IncomingOrder,
} from "@/server/orders/cashier";
import { formatPeso } from "@/lib/money";
import { chime, unlockAudio } from "@/lib/sound";
import { dueBucket, isForAnotherDay, scheduledLabel } from "@/lib/orders/scheduled";
import { getAdvanceQueue } from "@/server/orders/advance-orders";
import { PrintTicketButton } from "./PrintTicketButton";
import { PayModal } from "./PayModal";
import { NewOrderModal } from "./NewOrderModal";
import { DiscountModal } from "./DiscountModal";
import { LoyaltyRedeemModal } from "./LoyaltyRedeemModal";
import { AddCustomerModal } from "./AddCustomerModal";
import { ClosedOrdersModal } from "./ClosedOrdersModal";
import { AdvanceOrdersModal } from "./AdvanceOrdersModal";
import { ShiftSummaryModal } from "./ShiftSummaryModal";
import { ShiftNotesModal } from "./ShiftNotesModal";
import { VoidPinModal } from "./VoidPinModal";
import { EditOrderModal } from "./EditOrderModal";
import { AddItemsModal } from "./AddItemsModal";
import { GiftCardModal } from "./GiftCardModal";
import { SplitPaymentModal } from "./SplitPaymentModal";
import { removeGiftCard } from "@/server/gift-cards/gift-cards";
import { useOnline } from "@/lib/offline/useOnline";
import { ConnectivityPill } from "@/components/offline/ConnectivityPill";
import { CashOutModal } from "./CashOutModal";
import { PaymentBadge } from "./PaymentBadge";
import { orderTypeLabelWithEmoji } from "@/lib/orders/order-type";
import { BluetoothPrinterButton } from "./BluetoothPrinterButton";
import { WaitBadge } from "./WaitBadge";
import { waitingFrom, waitingLabel, waitTone } from "@/lib/orders/waiting";
import { printPaidTicket, printKitchenTicket, openCashDrawer } from "@/server/printing/print";
import { runPrintDispatch, sendDrawerKick } from "@/lib/print/run-dispatch";
import { printFailureMessage } from "@/lib/print/print-failure";

/** One row inside an order card's "⋯ more" overflow menu. */
function OverflowItem({
  onClick,
  danger,
  accent,
  children,
}: {
  onClick: () => void;
  danger?: boolean;
  accent?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`block w-full rounded-md px-3 py-2 text-left text-xs font-semibold hover:bg-cream ${
        danger ? "text-guava" : accent ? "text-brand-primary" : "text-plum-ink"
      }`}
    >
      {children}
    </button>
  );
}

export function CashierBoard({
  restaurantId,
  initialTables,
  initialIncoming = [],
  isAdmin = false,
  offlineEnabled = false,
  showTutorials = false,
  cardSurchargeBp = 0,
  payFirst = false,
  kitchenBluetooth = false,
  tillBluetooth = false,
}: {
  restaurantId: string;
  initialTables: CashierTable[];
  initialIncoming?: IncomingOrder[];
  isAdmin?: boolean;
  offlineEnabled?: boolean;
  /** False when the tutorials hub has no videos yet. */
  showTutorials?: boolean;
  /** Card fee in basis points, so the till can show it before the tap. */
  cardSurchargeBp?: number;
  /** The shop takes payment before the food is made (Printer settings). */
  payFirst?: boolean;
  /**
   * The kitchen has its own BLUETOOTH printer, so this device pairs two.
   * Only then is the second button worth the space — a network kitchen printer
   * is the server's business and needs nothing here.
   */
  kitchenBluetooth?: boolean;
  /** The receipt printer is Bluetooth, so a device that can't pair one must be told why. */
  tillBluetooth?: boolean;
}) {
  // One clock for the whole board, so every waiting time agrees and the page
  // re-renders once a minute rather than once per card. A minute is enough —
  // the till shows minutes, not seconds.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const [tables, setTables] = useState<CashierTable[]>(initialTables);
  const [incoming, setIncoming] = useState<IncomingOrder[]>(initialIncoming);
  const [live, setLive] = useState(false);
  const online = useOnline();
  const [busy, setBusy] = useState<string | null>(null);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [addCustomerOpen, setAddCustomerOpen] = useState(false);
  const [closedOpen, setClosedOpen] = useState(false);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  // How many bookings are waiting to go to the kitchen and are due today or
  // already past due. Advance orders are kept off the "incoming now" popup on
  // purpose — a booking for next Saturday shouldn't flash mid-service — so
  // without this number nothing on the till says today's are waiting.
  const [advanceDue, setAdvanceDue] = useState(0);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [cashOutOpen, setCashOutOpen] = useState(false);
  const [shiftNotesOpen, setShiftNotesOpen] = useState(false);
  const [voidOrderTarget, setVoidOrderTarget] = useState<{ id: string; label: string } | null>(null);
  const [editOrderTarget, setEditOrderTarget] = useState<{ id: string; label: string } | null>(null);
  const [addItemsTarget, setAddItemsTarget] = useState<{ id: string; label: string } | null>(null);
  const [menuOrderId, setMenuOrderId] = useState<string | null>(null);
  // Order being settled — drives the tendered/change payment modal.
  const [payTarget, setPayTarget] = useState<{ id: string; label: string; due: number; method: CounterMethod } | null>(null);
  const [giftCardTarget, setGiftCardTarget] = useState<{ id: string; label: string } | null>(null);
  const [splitTarget, setSplitTarget] = useState<{ id: string; label: string; remaining: number } | null>(null);
  const [discountOrder, setDiscountOrder] = useState<CashierTable["orders"][number] | null>(null);
  const [loyaltyOrderId, setLoyaltyOrderId] = useState<string | null>(null);
  const [waiterCalls, setWaiterCalls] = useState<{ id: string; tableNumber: string }[]>([]);
  const [billCalls, setBillCalls] = useState<{ id: string; tableNumber: string; method: string }[]>([]);
  const [onlinePaid, setOnlinePaid] = useState<{ id: string; label: string }[]>([]);
  const [popupDismissed, setPopupDismissed] = useState(false);
  const [readyDismissed, setReadyDismissed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Track what we've already seen so we can chime on genuinely new arrivals.
  const seenIncoming = useRef<Set<string>>(new Set(initialIncoming.map((o) => o.id)));
  const seenOnlinePaid = useRef<Set<string>>(new Set());
  const seenReady = useRef<Set<string>>(new Set());
  // Fetch de-duplication + change detection — see refresh() below.
  const refreshing = useRef(false);
  const refreshQueued = useRef(false);
  const lastTables = useRef<string>("");
  const lastIncoming = useRef<string>("");

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 6000);
  }

  /**
   * Refetch the board.
   *
   * Two guards, both about the tablet this runs on. Overlapping fetches are
   * collapsed, because every order change broadcasts and punching ten orders
   * used to fire ten near-simultaneous refreshes. And the state is only
   * replaced when the data actually CHANGED — the 15-second poll otherwise
   * handed React a brand-new object graph every 15 seconds, re-rendering the
   * whole board over and over, which on Chrome for Android is the flicker.
   */
  const refresh = useCallback(async () => {
    if (refreshing.current) {
      refreshQueued.current = true;
      return;
    }
    refreshing.current = true;
    try {
      const [t, inc] = await Promise.all([getCashierTables(), getIncomingOrders()]);

      // New incoming QR orders → chime + reopen the popup.
      const freshIncoming = inc.filter((o) => !seenIncoming.current.has(o.id));
      if (freshIncoming.length > 0) {
        chime();
        setPopupDismissed(false);
        showToast(`New order from Table ${freshIncoming[0].tableNumber}`);
      }
      seenIncoming.current = new Set(inc.map((o) => o.id));

      // New confirmed ONLINE payments → alert the cashier to verify the gateway.
      // Newly READY orders (kitchen pressed "Mark ready") → chime + serve popup.
      let freshReady = false;
      for (const tbl of t) {
        for (const o of tbl.orders) {
          if (o.paidOnline && !seenOnlinePaid.current.has(o.id)) {
            seenOnlinePaid.current.add(o.id);
            chime();
            setOnlinePaid((prev) => [
              ...prev.filter((x) => x.id !== o.id),
              { id: o.id, label: tbl.tableNumber },
            ]);
          }
          if (o.status === "done" && !o.served && !seenReady.current.has(o.id)) {
            seenReady.current.add(o.id);
            freshReady = true;
            chime();
            showToast(`🍽️ Food ready for Table ${tbl.tableNumber}`);
          }
        }
      }
      if (freshReady) setReadyDismissed(false);

      // Bookings still waiting to be sent to the kitchen, and due today or
      // already past their time. Best-effort — a failure here must never stop
      // the board refreshing, which is the part the till actually runs on.
      try {
        const queue = await getAdvanceQueue();
        setAdvanceDue(
          queue.filter((a) => a.status === "pending" && dueBucket(a.scheduledFor) !== "later").length,
        );
      } catch {
        /* leave the badge as it was */
      }

      // Only re-render when something is genuinely different.
      const sigT = JSON.stringify(t);
      if (sigT !== lastTables.current) {
        lastTables.current = sigT;
        setTables(t);
      }
      const sigI = JSON.stringify(inc);
      if (sigI !== lastIncoming.current) {
        lastIncoming.current = sigI;
        setIncoming(inc);
      }
    } catch {
      /* ignore transient */
    } finally {
      refreshing.current = false;
      if (refreshQueued.current) {
        refreshQueued.current = false;
        // One catch-up pass for everything that arrived while we were busy.
        void refresh();
      }
    }
  }, []);

  useEffect(() => {
    // Seed the seen sets from the initial data (don't alert on first load).
    // The signature is seeded too, so the very first poll doesn't count the
    // server-rendered board as a change and repaint it for no reason.
    lastTables.current = JSON.stringify(initialTables);
    for (const tbl of initialTables) {
      for (const o of tbl.orders) {
        if (o.paidOnline) seenOnlinePaid.current.add(o.id);
        if (o.status === "done" && !o.served) seenReady.current.add(o.id);
      }
    }
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`orders-${restaurantId}`)
      .on("broadcast", { event: "refresh" }, () => refresh())
      .on("broadcast", { event: "waiter" }, (msg) => {
        const tableNumber = String(
          (msg as { payload?: { tableNumber?: string } }).payload?.tableNumber ?? "—",
        );
        chime();
        setToast(`🔔 Table ${tableNumber} is calling a waiter`);
        setWaiterCalls((prev) => [
          ...prev,
          { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, tableNumber },
        ]);
      })
      .on("broadcast", { event: "bill" }, (msg) => {
        const p = (msg as { payload?: { tableNumber?: string; method?: string } }).payload ?? {};
        const tableNumber = String(p.tableNumber ?? "—");
        const method = p.method === "online" ? "online" : p.method === "gcash_qr" ? "gcash_qr" : "cash";
        chime();
        refresh();
        setBillCalls((prev) => [
          ...prev,
          { id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, tableNumber, method },
        ]);
      })
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    const poll = setInterval(refresh, 15000);
    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [restaurantId, refresh, initialTables]);

  // Browsers only grant sound from inside a user gesture, and a new AudioContext
  // starts suspended — so the incoming-order chime needs one tap on the page
  // before it will ever play. Any tap counts; the cashier makes dozens.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock);
    document.addEventListener("visibilitychange", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      document.removeEventListener("visibilitychange", unlock);
    };
  }, []);

  // Print a kitchen ticket on the browser when there's no kitchen display
  // (server transports already printed; this handles bluetooth / OS print).
  async function printKitchen(orderId: string) {
    try {
      const res = await printKitchenTicket(orderId);
      await runPrintDispatch(res, orderId, "kitchen");
    } catch (e) {
      // Say WHY. "Couldn't print" on its own sends the counter looking at the
      // printer when the answer is usually the browser or the pairing.
      const msg = printFailureMessage("kitchen", e, navigator.userAgent);
      if (msg) showToast(msg);
    }
  }

  async function accept(orderId: string) {
    setBusy(orderId);
    const res = await acceptOrder(orderId);
    setBusy(null);
    if (res.ok) {
      if (res.incoming) {
        seenIncoming.current = new Set(res.incoming.map((o) => o.id));
        setIncoming(res.incoming);
      }
      if (res.tables) setTables(res.tables);
      if (res.printKitchen && res.printOrderId) await printKitchen(res.printOrderId);
    }
  }

  async function decline(orderId: string) {
    setBusy(orderId);
    const res = await declineOrder(orderId);
    setBusy(null);
    if (res.ok) {
      if (res.incoming) {
        seenIncoming.current = new Set(res.incoming.map((o) => o.id));
        setIncoming(res.incoming);
      }
      if (res.tables) setTables(res.tables);
    }
  }

  // Print the paid RECEIPT — same dispatch runner as the "Print bill" button,
  // so a connected Bluetooth printer prints automatically.
  async function printPaidReceipt(orderId: string) {
    try {
      const res = await printPaidTicket(orderId);
      await runPrintDispatch(res, orderId, "receipt");
    } catch {
      showToast("Couldn't print the receipt.");
    }
  }

  /**
   * Finish what the server couldn't do itself after a payment settles.
   *
   * The server decides BOTH of these from the restaurant's settings; this only
   * carries them out for the transports it can't reach. Deciding here instead
   * is what made "turn off the receipt" impossible: the board printed on every
   * settle regardless of what the setting said.
   */
  async function finishSettle(res: { printTicket?: boolean; drawerKickBase64?: string }, orderId: string) {
    if (res.drawerKickBase64) {
      try {
        await sendDrawerKick(res.drawerKickBase64);
      } catch {
        /* the sale is done; a stuck drawer isn't worth a scary toast */
      }
    }
    if (res.printTicket) await printPaidReceipt(orderId);
  }

  /** The "no sale" button every till has — open the drawer without a sale. */
  async function popDrawer() {
    try {
      const res = await openCashDrawer();
      if (!res.ok) return showToast(res.message || "Couldn't reach the printer.");
      if (res.drawerKickBase64) await sendDrawerKick(res.drawerKickBase64);
      showToast("Drawer opened.");
    } catch {
      showToast("Couldn't open the drawer.");
    }
  }

  async function pay(orderId: string, method: CounterMethod, change = 0, tendered = 0) {
    setBusy(orderId);
    setPayTarget(null);
    try {
      const res = await markOrderPaid(orderId, method, tendered);
      if (res.ok && res.tables) {
        setTables(res.tables);
        showToast(
          change > 0 ? `Paid — give ${formatPeso(change)} change.` : "Payment recorded — order closed.",
        );
        await finishSettle(res, orderId);
      } else if (!res.ok) {
        showToast(res.error ?? "Couldn't record the payment.");
        refresh();
      }
    } catch {
      showToast("Something went wrong. Please try again.");
      refresh();
    } finally {
      setBusy(null);
    }
  }

  /**
   * Close a Grab/Foodpanda ticket after the rider has collected it.
   *
   * Straight through — no tender screen, because there is nothing to tender and
   * no change to count. The receipt still prints on the transports that need
   * the browser to send it, but the drawer deliberately stays shut.
   */
  async function settleForPlatform(orderId: string) {
    setBusy(orderId);
    try {
      const res = await settleThirdParty(orderId);
      if (res.ok && res.tables) {
        setTables(res.tables);
        showToast("Recorded as a third-party sale.");
        if (res.printTicket) await printPaidReceipt(orderId);
      } else if (!res.ok) {
        showToast(res.error ?? "Couldn't record that.");
        refresh();
      }
    } catch {
      showToast("Something went wrong. Please try again.");
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function close(orderId: string) {
    setBusy(orderId);
    try {
      const res = await closeOrder(orderId);
      if (res.ok && res.tables) setTables(res.tables);
      else if (!res.ok) {
        showToast(res.error ?? "Couldn't close the order.");
        refresh();
      }
    } catch {
      showToast("Something went wrong. Please try again.");
      refresh();
    } finally {
      setBusy(null);
    }
  }

  async function serve(orderId: string) {
    setBusy(orderId);
    try {
      const res = await markServed(orderId);
      if (res.ok && res.tables) {
        setTables(res.tables);
        showToast("Marked as served.");
      } else if (!res.ok) {
        showToast(res.error ?? "Couldn't mark as served.");
        refresh();
      }
    } catch {
      showToast("Something went wrong. Please try again.");
      refresh();
    } finally {
      setBusy(null);
    }
  }

  // Orders the kitchen finished that haven't been served yet.
  const readyOrders = tables.flatMap((t) =>
    t.orders
      .filter((o) => o.status === "done" && !o.served)
      .map((o) => ({ ...o, tableNumber: t.tableNumber })),
  );

  // The longest any incoming order has been waiting, for the sidebar button.
  // Advance orders that aren't due yet are excluded — waitingFrom returns null
  // for those, and counting them would show hours of "waiting" for nothing.
  const longestIncomingWait = (() => {
    let oldest: string | null = null;
    for (const o of incoming) {
      const from = waitingFrom(o.createdAt, o.scheduledFor, nowMs);
      if (from && (!oldest || from < oldest)) oldest = from;
    }
    return oldest && waitTone(oldest, nowMs) !== "fresh" ? waitingLabel(oldest, nowMs) : null;
  })();

  const showPopup = incoming.length > 0 && !popupDismissed;
  const showReady = readyOrders.length > 0 && !readyDismissed && !showPopup;

  const sidebarBtn =
    "w-full rounded-full border border-plum-ink/15 bg-white px-4 py-2.5 text-sm font-semibold text-plum-ink hover:bg-cream";

  // The action buttons — shared by the desktop sidebar and the mobile drawer.
  const sidebarInner = (
    <>
      <div className="mb-1 flex flex-wrap items-center gap-2 px-1 text-xs text-plum-ink/50">
        <span className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${live ? "bg-mango" : "bg-muted"}`} />
          {live ? "Live" : "Polling (offline)"}
        </span>
        {offlineEnabled && <ConnectivityPill online={online} pending={0} />}
      </div>

      <button onClick={() => setNewOrderOpen(true)} className="w-full rounded-full px-4 py-2.5 text-sm font-semibold btn-brand">
        + New order
      </button>
      <button onClick={() => setAddCustomerOpen(true)} className={sidebarBtn}>
        + Customer
      </button>
      <BluetoothPrinterButton explainUnsupported={tillBluetooth} />
      {kitchenBluetooth && <BluetoothPrinterButton station="kitchen" explainUnsupported />}
      {/* "No sale" — the drawer without a transaction, for giving change or
          dropping a float in. Every till has one; this one didn't. */}
      <button onClick={popDrawer} className={sidebarBtn}>
        💰 Open drawer
      </button>

      {incoming.length > 0 && (
        <button
          onClick={() => setPopupDismissed(false)}
          className="w-full rounded-full border border-guava bg-guava/10 px-4 py-2.5 text-sm font-semibold text-guava"
        >
          {incoming.length} incoming
          {/* The longest wait in the queue, on the button itself. With the
              popup dismissed this is the only thing on screen saying an order
              has been sitting there — a count alone reads the same at ten
              seconds and ten minutes. */}
          {longestIncomingWait && <span className="font-normal"> · {longestIncomingWait} waiting</span>}
        </button>
      )}
      {readyOrders.length > 0 && (
        <button
          onClick={() => setReadyDismissed(false)}
          className="w-full rounded-full border border-mango bg-mango/10 px-4 py-2.5 text-sm font-semibold text-mango"
        >
          🍽️ {readyOrders.length} ready
        </button>
      )}

      <div className="my-1 border-t border-plum-ink/10" />

      <Link href="/cashier/delivery" className={`${sidebarBtn} text-center`}>
        🛵 Delivery orders
      </Link>
      {isAdmin && (
        <Link href="/admin/printing" className={`${sidebarBtn} text-center`}>
          Printer settings
        </Link>
      )}

      <div className="my-1 border-t border-plum-ink/10" />

      <button onClick={() => setAdvanceOpen(true)} className={sidebarBtn}>
        <span className="inline-flex items-center gap-1.5">
          📅 Advance orders
          {advanceDue > 0 && (
            <span className="rounded-full bg-guava px-1.5 py-0.5 text-[10px] font-bold text-white">
              {advanceDue}
            </span>
          )}
        </span>
      </button>
      <button onClick={() => setClosedOpen(true)} className={sidebarBtn}>Closed orders</button>
      <button onClick={() => setCashOutOpen(true)} className={sidebarBtn}>Cash out</button>
      <button onClick={() => setShiftOpen(true)} className={sidebarBtn}>End-of-shift summary</button>
      <button onClick={() => setShiftNotesOpen(true)} className={sidebarBtn}>📝 Handover notes</button>

      <div className="my-1 border-t border-plum-ink/10" />

      {/* Cashiers are the staff most often learning the system mid-shift, and
          they have no access to the admin sidebar where help usually lives.
          New tab, so an open till stays exactly as they left it. */}
      {showTutorials && (
        <a href="/tutorials" target="_blank" rel="noreferrer" className={`${sidebarBtn} text-center`}>
          🎓 Tutorials
        </a>
      )}

      <form action={signOut}>
        <button className={sidebarBtn}>Sign out</button>
      </form>
    </>
  );

  return (
    <div>
      {/* Mobile top bar: menu toggle + always-visible New order. */}
      <div className="mb-4 flex items-center gap-2 sm:hidden">
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          className="rounded-full border border-plum-ink/15 bg-white p-2.5 text-plum-ink"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
            strokeLinecap="round" className="h-5 w-5">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        {offlineEnabled ? (
          <ConnectivityPill online={online} pending={0} />
        ) : (
          <span className="flex items-center gap-1.5 text-xs text-plum-ink/50">
            <span className={`inline-block h-2 w-2 rounded-full ${live ? "bg-mango" : "bg-muted"}`} />
            {live ? "Live" : "Offline"}
          </span>
        )}
        <button
          onClick={() => setNewOrderOpen(true)}
          className="ml-auto rounded-full px-4 py-2.5 text-sm font-semibold btn-brand"
        >
          + New order
        </button>
      </div>

      <div className="flex flex-col gap-5 sm:flex-row">
        {/* Desktop sidebar */}
        <aside className="hidden shrink-0 flex-col gap-2 sm:sticky sm:top-4 sm:flex sm:w-52 sm:self-start">
          {sidebarInner}
        </aside>

        {/* Mobile drawer */}
        {menuOpen && (
          <div className="fixed inset-0 z-50 sm:hidden">
            <div className="absolute inset-0 bg-black/40" onClick={() => setMenuOpen(false)} />
            <aside
              onClick={() => setMenuOpen(false)}
              className="absolute left-0 top-0 flex h-full w-72 max-w-[80%] flex-col gap-2 overflow-y-auto bg-cream p-4 shadow-xl"
            >
              <div className="mb-1 flex justify-end">
                <button
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close menu"
                  className="rounded-full p-1.5 text-plum-ink/60 hover:bg-plum-ink/5"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                    strokeLinecap="round" className="h-5 w-5">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
              {sidebarInner}
            </aside>
          </div>
        )}

      {/* Main board */}
      <div className="min-w-0 flex-1">
        {tables.length === 0 && incoming.length === 0 && (
          <p className="text-sm text-plum-ink/40">No open tables right now.</p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {tables.map((t) => (
          <section
            key={t.tableId}
            className={`rounded-tile border bg-white p-4 ${
              t.billRequested ? "border-guava" : "border-plum-ink/10"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-heading text-lg font-extrabold">{t.label}</h2>
              <div className="flex shrink-0 items-center gap-2">
                {/* Who rang it up. Any cashier can still settle any table —
                    this says whose sale it was, it doesn't lock the table. */}
                {t.openedByName && (
                  <span
                    title={`Opened by ${t.openedByName}`}
                    className="rounded-full bg-plum-ink/5 px-2 py-0.5 text-[11px] font-semibold text-plum-ink/50"
                  >
                    {t.openedByName}
                  </span>
                )}
                {t.billRequested && (
                  <span className="rounded-full bg-guava/15 px-2 py-0.5 text-xs font-semibold text-guava">
                    Bill requested
                  </span>
                )}
              </div>
            </div>
            {(t.customerPhone || t.customerAddress || t.mapUrl) && (
              <p className="mt-0.5 text-xs text-plum-ink/50">
                {[t.customerPhone, t.customerAddress].filter(Boolean).join(" · ")}
                {t.mapUrl && (
                  <>
                    {(t.customerPhone || t.customerAddress) ? " · " : ""}
                    <a href={t.mapUrl} target="_blank" rel="noopener" className="font-semibold text-brand-primary underline">📍 Map</a>
                  </>
                )}
              </p>
            )}
            <p className="mt-1 text-sm text-plum-ink/60">
              Outstanding: <span className="font-semibold">{formatPeso(t.outstanding)}</span>
            </p>

            <ul className="mt-3 space-y-3">
              {t.orders.map((o) => (
                <li key={o.id} className="rounded-lg bg-cream/60 p-3">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                      <span>
                        {o.itemCount} item{o.itemCount > 1 ? "s" : ""} ·{" "}
                        <span className="text-plum-ink/50">{o.status}</span>
                      </span>
                      {/* Only while the kitchen still has it. Once it's served,
                          how long it took stops being something anyone can act
                          on, and a red badge on a finished order is noise. */}
                      {!o.served && o.status !== "done" && (
                        <WaitBadge createdAt={o.createdAt} scheduledFor={o.scheduledFor} nowMs={nowMs} />
                      )}
                    </span>
                    {o.discountAmount > 0 || o.creditApplied > 0 ? (
                      <span className="text-right">
                        <span className="block text-xs text-plum-ink/40 line-through">{formatPeso(o.total)}</span>
                        <span className="font-semibold">{formatPeso(o.net)}</span>
                      </span>
                    ) : (
                      <span className="font-semibold">{formatPeso(o.total)}</span>
                    )}
                  </div>
                  {o.items.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-plum-ink/70">
                      {o.items.map((it, idx) => (
                        <li key={idx}>
                          <span className="font-semibold">{it.quantity}×</span> {it.name}
                          {it.modifiers.length > 0 && <span className="text-plum-ink/45"> · {it.modifiers.join(", ")}</span>}
                          {it.note && <span className="italic text-plum-ink/45"> · “{it.note}”</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {o.discountAmount > 0 && (
                    <p className="mt-0.5 text-xs font-semibold text-guava">
                      {o.discountLabel ?? "Discount"} · −{formatPeso(o.discountAmount)}
                    </p>
                  )}
                  {o.paid > 0 && o.paid < o.net && (
                    <p className="mt-0.5 text-xs font-semibold text-mango">
                      Part-paid {formatPeso(o.paid)} · {formatPeso(o.net - o.paid)} left
                    </p>
                  )}
                  {o.creditApplied > 0 && (
                    <p className="mt-0.5 flex items-center gap-2 text-xs font-semibold text-brand-primary">
                      🎁 Gift card · −{formatPeso(o.creditApplied)}
                      <button
                        onClick={async () => {
                          const res = await removeGiftCard(o.id);
                          if (res.ok) setTables(res.tables);
                        }}
                        className="font-medium text-plum-ink/45 underline"
                      >
                        remove
                      </button>
                    </p>
                  )}
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                    <span>
                      Payment:{" "}
                      <span className={o.paymentStatus === "paid" ? "text-mango" : "text-plum-ink/60"}>
                        {o.paymentStatus}
                      </span>
                    </span>
                    {o.paidOnline && (
                      <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 font-semibold text-brand-primary">
                        💳 Paid online — verify in gateway
                      </span>
                    )}
                    {o.status === "done" && !o.served && (
                      <span className="rounded-full bg-mango/15 px-2 py-0.5 font-semibold text-mango">
                        🍽️ Ready to serve
                      </span>
                    )}
                    {o.served && (
                      <span className="rounded-full bg-plum-ink/5 px-2 py-0.5 font-semibold text-plum-ink/50">
                        ✓ Served
                      </span>
                    )}
                  </div>

                  {/* When an advance order is wanted for — still here after it
                      was accepted. Accepting only sent it to the kitchen; it
                      didn't make it due, and a card that drops the date is
                      indistinguishable from one to serve now. */}
                  {o.scheduledFor && (
                    <p className="mt-1 rounded-md bg-mango/20 px-2 py-1 text-xs font-bold text-plum-ink">
                      📅 Scheduled for {scheduledLabel(o.scheduledFor)}
                      {isForAnotherDay(o.scheduledFor) && (
                        <span className="ml-1 font-extrabold uppercase text-guava">· not today</span>
                      )}
                    </p>
                  )}

                  {/* The method the customer chose, still here after the order
                      was accepted. "Payment: unpaid" on ten cards says nothing
                      about which of them owes cash and which already sent a
                      transfer with a screenshot attached. */}
                  <PaymentBadge
                    choice={o.paymentChoice}
                    reference={o.paymentRef}
                    receiptUrl={o.paymentReceiptUrl}
                    cashTendered={o.cashTendered}
                    total={o.net}
                    paid={o.paymentStatus === "paid"}
                  />

                  {/* Actions — keep the two most-used inline (Print bill, Paid
                      cash); everything else lives in the "⋯ more" menu but stays
                      one tap away. */}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <PrintTicketButton orderId={o.id} paid={o.paymentStatus === "paid"} />
                    {o.paymentStatus !== "paid" && t.kind === "third_party" && (
                      /* Nothing is tendered on a Grab/Foodpanda ticket — the
                         rider takes the food and the platform remits later. One
                         tap once it's collected, and no cash/card buttons at
                         all: offering them is what got these rung up as money
                         nobody took. */
                      <button
                        onClick={() => settleForPlatform(o.id)}
                        disabled={busy === o.id}
                        className="rounded-lg px-3 py-1.5 text-xs font-bold btn-brand disabled:opacity-60"
                      >
                        {busy === o.id
                          ? "Recording…"
                          : `🏍️ Picked up — settled by ${t.customerName?.trim() || "the app"}`}
                      </button>
                    )}
                    {o.paymentStatus !== "paid" && t.kind !== "third_party" && (
                      <>
                        <button
                          onClick={() => setPayTarget({ id: o.id, label: t.label, due: Math.max(0, o.net - o.paid), method: "cash" })}
                          disabled={busy === o.id}
                          className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                        >
                          💵 Cash
                        </button>
                        <button
                          onClick={() => setPayTarget({ id: o.id, label: t.label, due: Math.max(0, o.net - o.paid), method: "gcash" })}
                          disabled={busy === o.id}
                          className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
                        >
                          📱 GCash / Maya
                        </button>
                      </>
                    )}
                    {o.paymentStatus !== "paid" && (
                        <div className="relative">
                          <button
                            onClick={() => setMenuOrderId(menuOrderId === o.id ? null : o.id)}
                            disabled={busy === o.id}
                            aria-label="More actions"
                            className="rounded-lg border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold leading-none disabled:opacity-60"
                          >
                            ⋯ More
                          </button>
                          {menuOrderId === o.id && (
                            <>
                              {/* Click-away layer closes the menu. */}
                              <div className="fixed inset-0 z-10" onClick={() => setMenuOrderId(null)} />
                              <div className="absolute right-0 z-20 mt-1 w-44 rounded-lg border border-plum-ink/10 bg-white p-1 shadow-lg">
                                {o.status === "done" && !o.served && (
                                  <OverflowItem onClick={() => { setMenuOrderId(null); serve(o.id); }}>
                                    🍽️ Mark served
                                  </OverflowItem>
                                )}
                                <OverflowItem accent onClick={() => { setMenuOrderId(null); setAddItemsTarget({ id: o.id, label: t.label }); }}>
                                  + Add items
                                </OverflowItem>
                                {/* Nothing here applies to a platform order: the
                                    app charged the customer, set the price and
                                    ran its own promo. Serving, editing and
                                    voiding still do, so they stay. */}
                                {t.kind !== "third_party" && (
                                  <>
                                    <OverflowItem onClick={() => { setMenuOrderId(null); pay(o.id, "card_terminal"); }}>
                                      Paid (card)
                                    </OverflowItem>
                                    <OverflowItem onClick={() => { setMenuOrderId(null); setSplitTarget({ id: o.id, label: t.label, remaining: Math.max(0, o.net - o.paid) }); }}>
                                      Split payment
                                    </OverflowItem>
                                    <OverflowItem onClick={() => { setMenuOrderId(null); setDiscountOrder(o); }}>
                                      {o.discountAmount > 0 ? "Edit discount" : "Discount"}
                                    </OverflowItem>
                                    <OverflowItem onClick={() => { setMenuOrderId(null); setLoyaltyOrderId(o.id); }}>
                                      ⭐ Points
                                    </OverflowItem>
                                  </>
                                )}
                                <OverflowItem onClick={() => { setMenuOrderId(null); setEditOrderTarget({ id: o.id, label: t.label }); }}>
                                  Edit items
                                </OverflowItem>
                                {o.creditApplied === 0 && t.kind !== "third_party" && (
                                  <OverflowItem onClick={() => { setMenuOrderId(null); setGiftCardTarget({ id: o.id, label: t.label }); }}>
                                    🎁 Gift card
                                  </OverflowItem>
                                )}
                                <OverflowItem danger onClick={() => { setMenuOrderId(null); setVoidOrderTarget({ id: o.id, label: t.label }); }}>
                                  Void
                                </OverflowItem>
                              </div>
                            </>
                          )}
                        </div>
                    )}
                    {/* Only paid orders can be closed/dismissed — an unpaid open
                        order stays on the board until the customer pays. */}
                    {o.paymentStatus === "paid" && (
                      <>
                        {o.status === "done" && !o.served && (
                          <button
                            onClick={() => serve(o.id)}
                            disabled={busy === o.id}
                            className="rounded-lg bg-mango px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                          >
                            Mark served
                          </button>
                        )}
                        <button
                          onClick={() => close(o.id)}
                          disabled={busy === o.id}
                          className="rounded-lg px-3 py-1.5 text-xs font-semibold btn-brand disabled:opacity-60"
                        >
                          Done
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))}
        </div>
      </div>
      </div>

      {/* Incoming-order popup */}
      {showPopup && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="mt-6 w-full max-w-md rounded-tile bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg font-extrabold">
                {incoming.length === 1
                  ? "Incoming order"
                  : `${incoming.length} incoming orders`}
              </h2>
              <button
                onClick={() => setPopupDismissed(true)}
                className="text-sm font-semibold text-plum-ink/50"
              >
                View board
              </button>
            </div>
            <p className="mt-1 text-sm text-plum-ink/55">
              A customer placed an order via QR. Accept it to send it to the kitchen.
            </p>

            <ul className="mt-4 space-y-3">
              {incoming.map((o) => (
                <li key={o.id} className="rounded-lg border border-guava/40 bg-guava/5 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-heading font-bold">{o.label}</span>
                      {/* How long it's been sitting unaccepted — the number the
                          customer is about to ring up and ask about. */}
                      <WaitBadge createdAt={o.createdAt} scheduledFor={o.scheduledFor} nowMs={nowMs} />
                    </span>
                    <span className="font-semibold">{formatPeso(o.total)}</span>
                  </div>
                  {o.scheduledFor && (
                    <p className="mt-1 rounded-md bg-mango/20 px-2 py-1 text-xs font-bold text-plum-ink">
                      📅 Advance order — wanted for {scheduledLabel(o.scheduledFor)}
                    </p>
                  )}
                  <PaymentBadge
                    choice={o.paymentChoice}
                    reference={o.paymentRef}
                    receiptUrl={o.paymentReceiptUrl}
                    cashTendered={o.cashTendered}
                    total={o.total}
                    paid={o.paymentStatus === "paid"}
                  />
                  {o.channel !== "dine_in" && (
                    <p className="mt-0.5 text-xs text-plum-ink/55">
                      {orderTypeLabelWithEmoji(o.channel)}
                      {o.customerPhone ? ` · ${o.customerPhone}` : ""}
                      {o.customerAddress ? ` · ${o.customerAddress}` : ""}
                      {o.mapUrl && (
                        <>
                          {" · "}
                          <a href={o.mapUrl} target="_blank" rel="noopener" className="font-semibold text-brand-primary underline">📍 Map</a>
                        </>
                      )}
                    </p>
                  )}
                  <ul className="mt-2 space-y-1 text-sm text-plum-ink/75">
                    {o.items.map((it, i) => (
                      <li key={i}>
                        {it.quantity}× {it.name}
                        {it.modifiers.length > 0 && (
                          <span className="text-plum-ink/45"> · {it.modifiers.join(", ")}</span>
                        )}
                        {it.note && <span className="italic text-plum-ink/45"> · “{it.note}”</span>}
                      </li>
                    ))}
                  </ul>
                  {o.paymentStatus === "paid" && (
                    <p className="mt-1 text-xs font-semibold text-mango">Already paid online</p>
                  )}

                  {/* Ingredients, worked out BEFORE accepting. Stock only comes
                      off when the kitchen finishes, so without this the cashier
                      sees a full fridge and keeps saying yes to orders the
                      kitchen can't cook. */}
                  {o.stockWarnings.length > 0 && (
                    <div
                      className={`mt-2 rounded-lg px-3 py-2 text-xs ${
                        o.stockWarnings.some((w) => w.soldOut)
                          ? "bg-guava/10 text-guava"
                          : "bg-mango/15 text-plum-ink"
                      }`}
                    >
                      {o.stockWarnings.map((w) => (
                        <p key={w.name} className="font-semibold">
                          {w.soldOut
                            ? `⛔ ${w.name} — out of stock, can't make any`
                            : w.makeable < w.wanted
                              ? `⚠️ ${w.name} — only ${w.makeable} left, this order wants ${w.wanted}`
                              : `⚠️ ${w.name} — only ${w.makeable} left after this`}
                        </p>
                      ))}
                    </div>
                  )}

                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => accept(o.id)}
                      disabled={busy === o.id}
                      className="flex-1 rounded-full py-2 text-sm font-semibold btn-brand disabled:opacity-60"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => decline(o.id)}
                      disabled={busy === o.id}
                      className="rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold disabled:opacity-60"
                    >
                      Decline
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Food-ready / serve popup */}
      {showReady && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="mt-6 w-full max-w-md rounded-tile bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg font-extrabold">
                🍽️ {readyOrders.length === 1 ? "Food ready" : `${readyOrders.length} orders ready`}
              </h2>
              <button
                onClick={() => setReadyDismissed(true)}
                className="text-sm font-semibold text-plum-ink/50"
              >
                View board
              </button>
            </div>
            <p className="mt-1 text-sm text-plum-ink/55">
              The kitchen finished these orders. Serve them, then confirm.
            </p>

            <ul className="mt-4 space-y-3">
              {readyOrders.map((o) => (
                <li key={o.id} className="rounded-lg border border-mango/40 bg-mango/5 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-heading font-bold">Table {o.tableNumber}</span>
                    <span className="text-sm text-plum-ink/60">
                      {o.itemCount} item{o.itemCount > 1 ? "s" : ""}
                    </span>
                  </div>
                  <button
                    onClick={() => serve(o.id)}
                    disabled={busy === o.id}
                    className="mt-3 w-full rounded-full bg-mango py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Confirm served
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Waiter-call popup */}
      {waiterCalls.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="mt-6 w-full max-w-md rounded-tile bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg font-extrabold">
                🔔 {waiterCalls.length === 1 ? "Waiter requested" : `${waiterCalls.length} waiter calls`}
              </h2>
              <button
                onClick={() => setWaiterCalls([])}
                className="text-sm font-semibold text-plum-ink/50"
              >
                Clear all
              </button>
            </div>
            <ul className="mt-4 space-y-2">
              {waiterCalls.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between rounded-lg border border-mango/40 bg-mango/5 p-3"
                >
                  <span className="font-heading font-bold">Table {c.tableNumber}</span>
                  <button
                    onClick={() => setWaiterCalls((prev) => prev.filter((x) => x.id !== c.id))}
                    className="rounded-full bg-mango px-4 py-1.5 text-sm font-semibold text-white"
                  >
                    Got it
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Online-payment popup — paid via GCash/card; offer to print the receipt */}
      {onlinePaid.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="mt-6 w-full max-w-md rounded-tile bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg font-extrabold">💳 Paid online</h2>
              <button onClick={() => setOnlinePaid([])} className="text-sm font-semibold text-plum-ink/50">
                Clear all
              </button>
            </div>
            <ul className="mt-4 space-y-2">
              {onlinePaid.map((o) => (
                <li key={o.id} className="flex items-center justify-between rounded-lg border border-mango/40 bg-mango/5 p-3">
                  <span>
                    <span className="font-heading font-bold">Table {o.label}</span>
                    <span className="block text-xs text-plum-ink/60">Paid via GCash / card</span>
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => printPaidReceipt(o.id)}
                      className="rounded-full bg-plum-ink px-3 py-1.5 text-sm font-semibold text-white"
                    >
                      🖨 Print receipt
                    </button>
                    <button
                      onClick={() => setOnlinePaid((prev) => prev.filter((x) => x.id !== o.id))}
                      className="rounded-full border border-plum-ink/15 px-3 py-1.5 text-sm font-semibold"
                    >
                      Got it
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Bill-request popup (cash = a waiter must collect payment) */}
      {billCalls.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="mt-6 w-full max-w-md rounded-tile bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="font-heading text-lg font-extrabold">🧾 Bill requested</h2>
              <button onClick={() => setBillCalls([])} className="text-sm font-semibold text-plum-ink/50">
                Clear all
              </button>
            </div>
            <ul className="mt-4 space-y-2">
              {billCalls.map((c) => (
                <li
                  key={c.id}
                  className={`flex items-center justify-between rounded-lg border p-3 ${
                    c.method === "cash"
                      ? "border-guava/40 bg-guava/5"
                      : c.method === "gcash_qr"
                        ? "border-sky-400/50 bg-sky-50"
                        : "border-brand-primary/30 bg-brand-primary/5"
                  }`}
                >
                  <span>
                    <span className="font-heading font-bold">Table {c.tableNumber}</span>
                    <span className="block text-xs text-plum-ink/60">
                      {c.method === "cash"
                        ? "💵 Cash — collect payment at the table"
                        : c.method === "gcash_qr"
                          ? "📱 GCash QR — bring the QR code to the table"
                          : "💳 Paying online…"}
                    </span>
                  </span>
                  <button
                    onClick={() => setBillCalls((prev) => prev.filter((x) => x.id !== c.id))}
                    className="rounded-full bg-plum-ink px-4 py-1.5 text-sm font-semibold text-white"
                  >
                    Got it
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 left-1/2 z-[60] -translate-x-1/2 rounded-full bg-plum-ink px-5 py-3 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      )}

      {newOrderOpen && (
        <NewOrderModal
          onClose={() => setNewOrderOpen(false)}
          onCreated={(t) => setTables(t)}
          onPaymentIssue={(m) => showToast(m)}
          onPrintIssue={(m) => showToast(m)}
          payFirst={payFirst}
          cardSurchargeBp={cardSurchargeBp}
        />
      )}

      {payTarget && (
        <PayModal
          label={payTarget.label}
          due={payTarget.due}
          busy={busy === payTarget.id}
          initialMethod={payTarget.method}
          cardSurchargeBp={cardSurchargeBp}
          onConfirm={(method, change, tendered) => pay(payTarget.id, method, change, tendered)}
          onCancel={() => setPayTarget(null)}
        />
      )}

      {discountOrder && (
        <DiscountModal
          order={discountOrder}
          onClose={() => setDiscountOrder(null)}
          onApplied={(t) => setTables(t)}
        />
      )}

      {loyaltyOrderId && (
        <LoyaltyRedeemModal
          orderId={loyaltyOrderId}
          onClose={() => setLoyaltyOrderId(null)}
          onApplied={(t) => setTables(t)}
        />
      )}

      {addCustomerOpen && <AddCustomerModal onClose={() => setAddCustomerOpen(false)} />}

      {closedOpen && (
        <ClosedOrdersModal restaurantId={restaurantId} onClose={() => setClosedOpen(false)} onReopened={(t) => setTables(t)} />
      )}

      {advanceOpen && (
        <AdvanceOrdersModal restaurantId={restaurantId} onClose={() => setAdvanceOpen(false)} />
      )}

      {shiftOpen && <ShiftSummaryModal restaurantId={restaurantId} onClose={() => setShiftOpen(false)} />}

      {cashOutOpen && <CashOutModal onClose={() => setCashOutOpen(false)} />}

      {shiftNotesOpen && <ShiftNotesModal onClose={() => setShiftNotesOpen(false)} />}

      {voidOrderTarget && (
        <VoidPinModal
          orderId={voidOrderTarget.id}
          label={voidOrderTarget.label}
          onClose={() => setVoidOrderTarget(null)}
          onVoided={(t) => setTables(t)}
        />
      )}

      {editOrderTarget && (
        <EditOrderModal
          orderId={editOrderTarget.id}
          label={editOrderTarget.label}
          onClose={() => setEditOrderTarget(null)}
          onChanged={(t) => setTables(t)}
        />
      )}

      {addItemsTarget && (
        <AddItemsModal
          orderId={addItemsTarget.id}
          label={addItemsTarget.label}
          onClose={() => setAddItemsTarget(null)}
          onChanged={(t) => setTables(t)}
          onPrintIssue={(m: string) => showToast(m)}
        />
      )}

      {giftCardTarget && (
        <GiftCardModal
          orderId={giftCardTarget.id}
          label={giftCardTarget.label}
          onClose={() => setGiftCardTarget(null)}
          onApplied={(t) => setTables(t)}
        />
      )}

      {splitTarget && (
        <SplitPaymentModal
          orderId={splitTarget.id}
          label={splitTarget.label}
          remaining={splitTarget.remaining}
          cardSurchargeBp={cardSurchargeBp}
          onClose={() => setSplitTarget(null)}
          onResult={(t) => setTables(t)}
        />
      )}
    </div>
  );
}
