"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  getKitchenOrders,
  advanceOrderStatus,
  getKitchenHistory,
  reopenKitchenOrder,
  toggleItemPrepared,
} from "@/server/orders/kitchen";
import type { KitchenOrder } from "@/lib/orders/types";
import { useOnline } from "@/lib/offline/useOnline";
import { kvGet, kvSet, outboxAdd, outboxAll, outboxRemove, type OutboxOp } from "@/lib/offline/idb";
import { ConnectivityPill } from "@/components/offline/ConnectivityPill";
import { alertChime, audioBlocked, chime, unlockAudio } from "@/lib/sound";
import { waitingClock, waitTone, type WaitTone } from "@/lib/orders/waiting";
import { isForAnotherDay, scheduledLabel } from "@/lib/orders/scheduled";

/**
 * Urgency from how long the order has been waiting. Green while it's fresh,
 * amber once it's dragging, red when it's genuinely late — readable across the
 * kitchen at a glance.
 *
 * The thresholds live in lib/orders/waiting so the till agrees with the
 * kitchen: a ticket the cook sees as late shouldn't read as fine at the
 * counter, which is where the customer is standing.
 */
const URGENCY: Record<WaitTone, { head: string; text: string }> = {
  late: { head: "bg-red-500", text: "text-white" },
  warn: { head: "bg-amber-400", text: "text-plum-ink" },
  fresh: { head: "bg-green-500", text: "text-white" },
};
function urgency(iso: string, nowMs: number): { head: string; text: string } {
  return URGENCY[waitTone(iso, nowMs)];
}

function OrderCard({
  order,
  onAdvance,
  onToggleItem,
  busy,
  nowMs,
}: {
  order: KitchenOrder;
  onAdvance: (id: string, to: "preparing" | "done") => void;
  onToggleItem: (itemId: string, prepared: boolean) => void;
  busy: boolean;
  nowMs: number;
}) {
  const next = order.status === "new" ? "preparing" : "done";
  const label = order.status === "new" ? "Start preparing" : "Mark ready 🔔";
  const tone = urgency(order.createdAt, nowMs);

  return (
    <div className="flex flex-col overflow-hidden rounded-xl bg-white shadow-md ring-1 ring-plum-ink/10">
      {/* Colour-coded header: who it's for + how long it's been waiting. */}
      <div className={`${tone.head} ${tone.text} px-3 py-2`}>
        <p className="font-heading text-2xl font-extrabold leading-none">{order.tableNumber}</p>
        <p className="mt-1 text-xs font-semibold tabular-nums opacity-90">
          {waitingClock(order.createdAt, nowMs)}
        </p>
      </div>

      <p className="border-b border-plum-ink/10 px-3 py-2 text-sm italic text-plum-ink/70">
        {order.typeLabel ?? "Dine in"}
      </p>

      {/* A second round on a bill the kitchen may already have finished.
          Without this the ticket comes back with most of its lines struck
          through and reads as a mistake, when what it actually means is "cook
          the ones that aren't ticked". */}
      {order.addedItemsAt && (
        <p className="border-b border-brand-primary/40 bg-brand-primary/10 px-3 py-2 text-sm font-extrabold uppercase tracking-wide leading-snug text-brand-primary">
          ➕ Extra order — cook the unticked items
        </p>
      )}

      {/* An advance order, and when it's actually wanted. Stays on the card for
          as long as the ticket is up: accepting it told the kitchen the order
          exists, it didn't make it due now, and a card with no date on it looks
          exactly like one to start cooking. */}
      {order.scheduledFor && (
        <p className="border-b border-mango/40 bg-mango/20 px-3 py-2 text-sm font-bold leading-snug text-plum-ink">
          📅 Scheduled for {scheduledLabel(order.scheduledFor)}
          {isForAnotherDay(order.scheduledFor) && (
            <span className="mt-0.5 block text-xs font-extrabold uppercase tracking-wide text-guava">
              Not for today
            </span>
          )}
        </p>
      )}

      {/* Where it's going, for a kitchen that batches by zone: everything for
          the same area gets cooked and bagged together instead of one ticket at
          a time. Only present when the setting is on. */}
      {order.customerAddress && (
        <p className="border-b border-plum-ink/10 bg-cream/50 px-3 py-2 text-sm font-semibold leading-snug text-plum-ink/75">
          📍 {order.customerAddress}
        </p>
      )}

      <ul className="flex-1 px-1 py-1">
        {order.items.map((it) => {
          const done = !!it.preparedAt;
          return (
            <li key={it.id}>
              {/* The whole line is the target. A cook wearing gloves on a
                  splattered tablet is not going to hit a checkbox, so the tap
                  area is the entire row. */}
              <button
                type="button"
                onClick={() => onToggleItem(it.id, !done)}
                aria-pressed={done}
                className={`flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition active:scale-[0.99] ${
                  done ? "bg-plum-ink/5" : "hover:bg-cream/60"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 text-sm font-bold ${
                    done
                      ? "border-green-600 bg-green-600 text-white"
                      : "border-plum-ink/25 text-transparent"
                  }`}
                  aria-hidden
                >
                  ✓
                </span>
                <span className="min-w-0 flex-1">
                  <span
                    className={`block text-base font-semibold leading-snug ${
                      done ? "text-plum-ink/35 line-through" : "text-plum-ink"
                    }`}
                  >
                    {it.quantity} x {it.name}
                  </span>
                  {it.modifiers.length > 0 && (
                    <span
                      className={`block text-sm leading-snug ${
                        done ? "text-plum-ink/25 line-through" : "text-plum-ink/45"
                      }`}
                    >
                      {it.modifiers.join(", ")}
                    </span>
                  )}
                  {it.note && (
                    <span
                      className={`block text-sm font-medium leading-snug ${
                        done ? "text-plum-ink/25 line-through" : "text-guava"
                      }`}
                    >
                      “{it.note}”
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {/* How much is left, so the pass doesn't have to count struck-through
          lines to find out. */}
      {order.items.length > 1 && (
        <p className="px-3 pb-1 text-xs font-semibold text-plum-ink/45">
          {(() => {
            const left = order.items.filter((i) => !i.preparedAt).length;
            return left === 0 ? "All plated ✓" : `${left} of ${order.items.length} still to plate`;
          })()}
        </p>
      )}

      <button
        onClick={() => onAdvance(order.id, next)}
        disabled={busy}
        className="m-3 mt-0 rounded-lg py-2.5 text-sm font-bold btn-brand disabled:opacity-60"
      >
        {label}
      </button>
    </div>
  );
}

const CACHE_KEY = "kitchen:orders";

const SOUND_KEY = "kitchen:sound";

export function KitchenBoard({
  restaurantId,
  initialOrders,
  offlineEnabled = false,
}: {
  restaurantId: string;
  initialOrders: KitchenOrder[];
  offlineEnabled?: boolean;
}) {
  const [orders, setOrders] = useState<KitchenOrder[]>(initialOrders);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const online = useOnline();
  const syncing = useRef(false);
  // Tickets already announced, so a refresh/poll never re-rings the same order.
  const seenOrders = useRef<Set<string>>(new Set(initialOrders.map((o) => o.id)));
  const seeded = useRef(false);
  const soundOn = useRef(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  // Whether the browser is still refusing to play anything. A kitchen screen is
  // often opened and then never touched, so this has to be visible — a silent
  // failure here means nobody knows an order arrived.
  const [blocked, setBlocked] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const fresh = await getKitchenOrders();
      // Ring for tickets the kitchen hasn't seen yet. The first load only seeds
      // the seen-set, so opening the screen mid-service doesn't set it off.
      const unseen = fresh.filter((o) => !seenOrders.current.has(o.id));
      // Forget tickets that have left the board. A table that has been served
      // and orders more puts its ticket BACK, and the cook needs the same alert
      // they'd get for any other order they haven't seen — a set that only ever
      // grew meant the second round arrived in silence.
      const live = new Set(fresh.map((o) => o.id));
      for (const id of seenOrders.current) if (!live.has(id)) seenOrders.current.delete(id);
      for (const o of fresh) seenOrders.current.add(o.id);
      if (unseen.length > 0 && seeded.current && soundOn.current) {
        alertChime();
        // If the browser swallowed it, say so — a kitchen has nobody watching.
        setBlocked(audioBlocked());
      }
      seeded.current = true;
      setOrders(fresh);
      if (offlineEnabled) kvSet(CACHE_KEY, fresh); // keep the offline read-cache warm
    } catch {
      /* ignore transient errors; next tick retries */
    }
  }, [offlineEnabled]);

  // Replay any queued status changes once we're back online (idempotent server-side).
  const drainOutbox = useCallback(async () => {
    if (!offlineEnabled || syncing.current) return;
    syncing.current = true;
    try {
      const ops = await outboxAll();
      for (const op of ops) {
        try {
          await advanceOrderStatus(op.orderId, op.toStatus);
          await outboxRemove(op.opId);
        } catch {
          break; // still offline / transient — try again next tick
        }
      }
      setPending((await outboxAll()).length);
    } finally {
      syncing.current = false;
    }
    await refresh();
  }, [offlineEnabled, refresh]);

  // Remember whether the kitchen muted the chime.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(SOUND_KEY);
      if (saved === "off") {
        soundOn.current = false;
        setSoundEnabled(false);
      }
    } catch { /* storage unavailable */ }
  }, []);

  /**
   * Unlock audio on the first touch anywhere on the screen.
   *
   * A browser only grants sound from inside a user gesture, and nobody in a
   * kitchen thinks to press a speaker button before service — they open the
   * board and walk away. Any tap at all now counts: bumping a ticket, scrolling
   * the list. Until one happens the banner below asks for it outright.
   */
  useEffect(() => {
    const unlock = () => {
      unlockAudio();
      setBlocked(audioBlocked());
    };
    setBlocked(audioBlocked());
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    // Tablets suspend audio when the screen sleeps; re-arm on the way back.
    document.addEventListener("visibilitychange", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      document.removeEventListener("visibilitychange", unlock);
    };
  }, []);

  function toggleSound() {
    const next = !soundOn.current;
    soundOn.current = next;
    setSoundEnabled(next);
    try {
      localStorage.setItem(SOUND_KEY, next ? "on" : "off");
    } catch { /* ignore */ }
    if (next) {
      unlockAudio();
      chime(); // doubles as a way to hear what the alert sounds like
      setBlocked(audioBlocked());
    }
  }

  // On mount: hydrate from the cache if we loaded offline, and show the queue size.
  useEffect(() => {
    if (!offlineEnabled) return;
    (async () => {
      setPending((await outboxAll()).length);
      if (!navigator.onLine) {
        const cached = await kvGet<KitchenOrder[]>(CACHE_KEY);
        if (cached) setOrders(cached);
      }
    })();
  }, [offlineEnabled]);

  // When connectivity returns, drain the queue.
  useEffect(() => {
    if (offlineEnabled && online) drainOutbox();
  }, [offlineEnabled, online, drainOutbox]);

  // Realtime ping + polling fallback.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`orders-${restaurantId}`)
      .on("broadcast", { event: "refresh" }, () => refresh())
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    // Fallback so the board still updates if realtime isn't configured.
    const poll = setInterval(refresh, 15000);

    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [restaurantId, refresh]);

  // Optimistically move an order locally (and refresh the offline cache).
  function applyLocal(id: string, to: "preparing" | "done") {
    setOrders((prev) => {
      const next = prev.map((o) => (o.id === id ? { ...o, status: to } : o));
      if (offlineEnabled) kvSet(CACHE_KEY, next);
      return next;
    });
  }

  async function queueOffline(id: string, to: "preparing" | "done") {
    const op: OutboxOp = {
      opId: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `${id}-${Date.now()}`,
      type: "advance",
      orderId: id,
      toStatus: to,
      createdAt: Date.now(),
    };
    await outboxAdd(op);
    applyLocal(id, to);
    setPending((await outboxAll()).length);
  }

  async function handleAdvance(id: string, to: "preparing" | "done") {
    // Offline: queue the change and update the board optimistically.
    if (offlineEnabled && !online) {
      await queueOffline(id, to);
      return;
    }
    setBusyId(id);
    setError(null);
    try {
      const res = await advanceOrderStatus(id, to);
      if (res.ok && res.orders) {
        setOrders(res.orders);
        if (offlineEnabled) kvSet(CACHE_KEY, res.orders);
      } else if (!res.ok) {
        setError(res.error ?? "Couldn't update the order.");
        refresh(); // resync in case another tablet already moved it
      }
    } catch {
      // Network died mid-request — fall back to the offline queue if enabled.
      if (offlineEnabled) {
        await queueOffline(id, to);
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setBusyId(null); // never leave the button stuck
    }
  }

  /**
   * Tick a line off, or put it back.
   *
   * Painted before the server answers. On a pass this gets tapped between
   * plating two dishes, and a checkbox that waits for a round trip is a
   * checkbox that gets tapped twice. If the write fails, the resync puts the
   * board straight and the error says why.
   */
  async function handleToggleItem(itemId: string, prepared: boolean) {
    const at = prepared ? new Date().toISOString() : null;
    setOrders((prev) =>
      prev.map((o) => ({
        ...o,
        items: o.items.map((i) => (i.id === itemId ? { ...i, preparedAt: at } : i)),
      })),
    );
    setError(null);
    try {
      const res = await toggleItemPrepared(itemId, prepared);
      if (res.ok && res.orders) {
        setOrders(res.orders);
        if (offlineEnabled) kvSet(CACHE_KEY, res.orders);
      } else if (!res.ok) {
        setError(res.error ?? "Couldn't update that item.");
        refresh();
      }
    } catch {
      // Offline: the optimistic tick stands until the next successful refresh.
      // Nothing is queued for it on purpose — it's a working aid, and replaying
      // stale ticks onto a ticket that has since moved on would mislead.
      setError("Couldn't reach the server — that tick may not have saved.");
    }
  }

  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<KitchenOrder[] | null>(null);

  // One clock for the whole board — each card derives its own elapsed time,
  // so the timers stay in sync and we only re-render once a second.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const incoming = orders.filter((o) => o.status === "new");
  const preparing = orders.filter((o) => o.status === "preparing");

  /**
   * Today's finished tickets, with a way back.
   *
   * A stray tap on a busy screen used to send a ticket away for good and the
   * food never got made. Loaded on demand rather than kept live: it's a
   * recovery tool, not part of the queue, and it must never compete for
   * attention with the orders still to cook.
   */
  async function openHistory() {
    setHistoryOpen(true);
    setHistory(null);
    try {
      setHistory(await getKitchenHistory());
    } catch {
      setHistory([]);
    }
  }

  async function bringBack(id: string) {
    setBusyId(id);
    try {
      const res = await reopenKitchenOrder(id);
      if (res.ok && res.orders) {
        setOrders(res.orders);
        if (offlineEnabled) kvSet(CACHE_KEY, res.orders);
        setHistory((h) => h?.filter((o) => o.id !== id) ?? null);
      } else if (res.error) {
        setError(res.error);
      }
    } catch {
      setError("Couldn't bring that ticket back.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      {/* Sound is blocked until someone touches the screen. Saying so is the
          whole fix from the kitchen's point of view — a chime that silently
          never plays is indistinguishable from no orders coming in. */}
      {soundEnabled && blocked && (
        <button
          type="button"
          onClick={() => {
            unlockAudio();
            chime();
            setBlocked(audioBlocked());
          }}
          className="mb-3 flex w-full items-center justify-center gap-2 rounded-tile bg-mango px-4 py-3 text-sm font-bold text-plum-ink"
        >
          🔇 Tap here to turn on the new-order sound
        </button>
      )}

      <div className="mb-4 flex items-center gap-3 text-xs text-plum-ink/50">
        <span className="flex items-center gap-2">
          <span className={`inline-block h-2 w-2 rounded-full ${live ? "bg-mango" : "bg-muted"}`} />
          {live ? "Live" : "Polling (realtime offline)"}
        </span>
        {offlineEnabled && <ConnectivityPill online={online} pending={pending} />}
        <button
          type="button"
          onClick={openHistory}
          className="ml-auto rounded-full border border-plum-ink/15 px-3 py-1 text-xs font-semibold text-plum-ink/70"
          title="Tickets finished today — bring one back if it was tapped by mistake"
        >
          🕘 History
        </button>
        <button
          type="button"
          onClick={toggleSound}
          className="rounded-full border border-plum-ink/15 px-3 py-1 text-xs font-semibold text-plum-ink/70"
          title={soundEnabled ? "Mute the new-order chime" : "Turn the new-order chime on"}
        >
          {soundEnabled ? "🔔 Sound on" : "🔕 Sound off"}
        </button>
      </div>

      {historyOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4"
          onClick={() => setHistoryOpen(false)}
        >
          <div
            className="mt-10 flex max-h-[80vh] w-full max-w-2xl flex-col rounded-tile bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="font-heading text-lg font-bold">Finished today</h2>
                <p className="text-xs text-plum-ink/50">
                  Tapped one by mistake? Bring it back and it returns to Preparing.
                </p>
              </div>
              <button
                onClick={() => setHistoryOpen(false)}
                className="text-plum-ink/40 hover:text-plum-ink"
              >
                ✕
              </button>
            </div>

            {history === null ? (
              <p className="py-6 text-center text-sm text-plum-ink/50">Loading…</p>
            ) : history.length === 0 ? (
              <p className="py-6 text-center text-sm text-plum-ink/50">
                Nothing finished yet today.
              </p>
            ) : (
              <ul className="divide-y divide-plum-ink/5 overflow-y-auto">
                {history.map((o) => (
                  <li key={o.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-heading text-sm font-bold">
                        {o.tableNumber}
                        <span className="ml-2 text-xs font-medium text-plum-ink/45">
                          {o.typeLabel}
                        </span>
                      </p>
                      <p className="truncate text-xs text-plum-ink/55">
                        {o.items.map((i) => `${i.quantity}× ${i.name}`).join(", ")}
                      </p>
                    </div>
                    <button
                      onClick={() => bringBack(o.id)}
                      disabled={busyId === o.id}
                      className="shrink-0 rounded-full border border-plum-ink/15 px-3 py-1.5 text-xs font-bold hover:border-brand-primary disabled:opacity-60"
                    >
                      {busyId === o.id ? "…" : "↩ Bring back"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-guava/40 bg-guava/10 px-4 py-2 text-sm text-guava">
          {error}
        </div>
      )}

      <div className="space-y-6">
        <section>
          <h2 className="mb-3 font-heading text-lg font-bold">
            New <span className="text-plum-ink/40">({incoming.length})</span>
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {incoming.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                onAdvance={handleAdvance}
                onToggleItem={handleToggleItem}
                busy={busyId === o.id}
                nowMs={nowMs}
              />
            ))}
            {incoming.length === 0 && (
              <p className="col-span-full text-sm text-plum-ink/40">No new orders.</p>
            )}
          </div>
        </section>

        <section>
          <h2 className="mb-3 font-heading text-lg font-bold">
            Preparing{" "}
            <span className="text-plum-ink/40">({preparing.length})</span>
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {preparing.map((o) => (
              <OrderCard
                key={o.id}
                order={o}
                onAdvance={handleAdvance}
                onToggleItem={handleToggleItem}
                busy={busyId === o.id}
                nowMs={nowMs}
              />
            ))}
            {preparing.length === 0 && (
              <p className="col-span-full text-sm text-plum-ink/40">Nothing in progress.</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
