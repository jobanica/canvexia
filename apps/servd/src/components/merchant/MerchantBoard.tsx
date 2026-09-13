"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { countdownFor, type PrepTone } from "@/lib/orders/prep-countdown";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatPeso } from "@/lib/money";
import { printKitchenTicket } from "@/server/printing/print";
import { runPrintDispatch } from "@/lib/print/run-dispatch";
import { orderTypeLabelWithEmoji } from "@/lib/orders/order-type";
import {
  getMerchantOrders,
  acceptMerchantOrder,
  rejectMerchantOrder,
  advanceMerchantOrder,
  createTestOrder,
  type MerchantData,
  type MerchantOrder,
  type MerchantAdvance,
  type RejectReason,
} from "@/server/orders/merchant";
import { savePushSubscription } from "@/server/push/actions";
import { useOrderAlarm } from "./useOrderAlarm";
import { useWakeLock } from "./useWakeLock";
import { InstallButton } from "./InstallButton";
import { SignOutButton } from "@/components/merchant/SignOutButton";
import { PlanStatusBanner } from "@/components/billing/PlanStatusBanner";
import type { PlanBannerData } from "@/lib/billing/planBanner";
import { DeliveryRiderPanel } from "@/components/delivery/DeliveryRiderPanel";

const PREP_CHOICES = [10, 15, 20, 30, 45];
const REJECT_LABELS: { key: RejectReason; label: string }[] = [
  { key: "out_of_stock", label: "Out of stock" },
  { key: "too_busy", label: "Too busy" },
  { key: "closed", label: "We're closed" },
];

function typeBadge(o: MerchantOrder): string {
  if (o.orderType === "delivery") return "🛵 Delivery";
  if (o.orderType) return orderTypeLabelWithEmoji(o.orderType);
  return "🍽️ Dine-in";
}

/** VAPID key (URL-safe base64) → Uint8Array for pushManager.subscribe. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Subscribes this device to Web Push so new orders alert it in the background.
 * Requests notification permission (needs a user gesture), then stores the
 * subscription server-side. No-ops if push isn't configured/supported.
 */
async function enableBackgroundPush(): Promise<void> {
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapid) return; // push not configured on this deployment
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
  try {
    if (Notification.permission === "denied") return;
    if (Notification.permission !== "granted") {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return;
    }
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub =
      existing ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(vapid) as BufferSource }));
    const json = sub.toJSON();
    if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
      await savePushSubscription({ endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth });
    }
  } catch {
    /* push unavailable — the in-app alarm still works */
  }
}

function minsAgo(iso: string): string {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 1 ? "just now" : `${m} min ago`;
}

const COUNTDOWN_TONE: Record<PrepTone, string> = {
  fresh: "bg-emerald-100 text-emerald-800",
  soon: "bg-amber-100 text-amber-900",
  late: "bg-red-600 text-white",
};

/**
 * How long is left of the time the merchant promised.
 *
 * A static "~20m" told the counter nothing once ten of those minutes had gone.
 * This is the same promise, counted down — and it turns red and keeps counting
 * UP once it's blown, because "how late am I" is the question at that point and
 * a timer that stops at zero stops answering it.
 *
 * Nothing renders on an order with no accepted-at or no promised time: an
 * invented countdown is worse than none.
 */
function PrepCountdownChip({ order, nowMs }: { order: MerchantOrder; nowMs: number }) {
  // Once the food is ready the promise has been kept (or missed) and the number
  // is history — the card says "Ready" instead.
  if (order.status === "done" || order.status === "closed" || order.status === "cancelled") return null;
  const c = countdownFor(order.acceptedAt, order.prepMinutes, nowMs);
  if (!c) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-heading text-sm font-extrabold tabular-nums ${COUNTDOWN_TONE[c.tone]}`}
      title={c.overdue ? "Past the time you promised" : "Time left of the time you promised"}
    >
      {c.overdue ? "⏰" : "⏱"} {c.label}
    </span>
  );
}

/** "Mon, Jul 20 · 6:00 PM" (PH time) for an advance order's requested time. */
function schedLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-PH", {
    timeZone: "Asia/Manila",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The next step a merchant can take on an accepted order, by its current state. */
/** Apply a status advance to local state instantly (mirrors the server rules). */
function optimisticAdvance(d: MerchantData, id: string, to: MerchantAdvance): MerchantData {
  const idx = d.active.findIndex((o) => o.id === id);
  if (idx === -1) return d;
  const o = d.active[idx];
  // Delivered / completed → order closes and leaves the active list.
  if (to === "delivered" || to === "completed") {
    const moved: MerchantOrder = {
      ...o,
      status: "closed",
      paymentStatus: "paid",
      deliveryStatus: to === "delivered" ? "delivered" : o.deliveryStatus,
    };
    return { ...d, active: d.active.filter((x) => x.id !== id), history: [moved, ...d.history] };
  }
  const patch: Partial<MerchantOrder> =
    to === "preparing" ? { status: "preparing" }
    : to === "ready" ? { status: "done" }
    : to === "out_for_delivery" ? { deliveryStatus: "out_for_delivery" }
    : {};
  const active = [...d.active];
  active[idx] = { ...o, ...patch };
  return { ...d, active };
}

function nextAction(o: MerchantOrder): { to: MerchantAdvance; label: string } | null {
  if (o.status === "new") return { to: "preparing", label: "Start preparing" };
  if (o.status === "preparing") return { to: "ready", label: "Mark ready" };
  if (o.status === "done") {
    if (o.orderType === "delivery") {
      if (o.deliveryStatus === "out_for_delivery") return { to: "delivered", label: "Mark delivered" };
      return { to: "out_for_delivery", label: "Out for delivery" };
    }
    return { to: "completed", label: "Handed off / completed" };
  }
  return null;
}

function OrderLines({ o }: { o: MerchantOrder }) {
  return (
    <ul className="space-y-1.5">
      {o.items.map((it, i) => (
        <li key={i} className="text-lg">
          <span className="font-bold">{it.quantity}×</span> {it.name}
          {it.modifiers.length > 0 && (
            <span className="block pl-7 text-base text-plum-ink/60">+ {it.modifiers.join(", ")}</span>
          )}
          {it.note && <span className="block pl-7 text-base font-medium text-guava">“{it.note}”</span>}
        </li>
      ))}
    </ul>
  );
}

export function MerchantBoard({
  restaurantId,
  restaurantName,
  initial,
  bannerData,
}: {
  restaurantId: string;
  restaurantName: string;
  initial: MerchantData;
  bannerData?: PlanBannerData | null;
}) {
  const [data, setData] = useState<MerchantData>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [autoPrint, setAutoPrint] = useState(false);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [live, setLive] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [pulse, setPulse] = useState(0); // bumped on refresh → rider panels re-fetch
  const alarm = useOrderAlarm();
  useWakeLock(true);

  // One clock for every countdown on the screen, ticking each second. A timer
  // per card would drift them apart, and a kitchen reading two cards a second
  // out of step trusts neither.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setData(await getMerchantOrders());
      setPulse((p) => p + 1);
    } catch {
      /* transient — the poll will retry */
    }
  }, []);

  // Realtime + polling fallback (same channel the cashier/kitchen use).
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`orders-${restaurantId}`)
      .on("broadcast", { event: "refresh" }, () => refresh())
      .subscribe((s) => setLive(s === "SUBSCRIBED"));
    const poll = setInterval(refresh, 10000);
    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [restaurantId, refresh]);

  // Phones throttle background timers, drop the realtime socket, AND suspend the
  // audio context while the app is minimized — so a queued order can arrive
  // silently. The moment it's foregrounded (or the network returns), refresh so
  // a queued order shows, and resume the audio context so it actually alarms.
  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState === "visible") {
        refresh();
        void alarm.resume();
      }
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    window.addEventListener("online", onWake);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("online", onWake);
    };
  }, [refresh, alarm]);

  // After an app kill + reload we restore the "started" state (so staff keep
  // their place), but the browser still needs a gesture before it will play
  // sound. Re-arm the alarm on the very first tap anywhere, so they don't have
  // to hunt for the start button.
  const { unlocked: alarmUnlocked, soundOn: alarmSoundOn, unlock: alarmUnlock } = alarm;
  useEffect(() => {
    if (!alarmUnlocked || alarmSoundOn) return;
    const rearm = () => { void alarmUnlock(); };
    window.addEventListener("pointerdown", rearm, { once: true });
    return () => window.removeEventListener("pointerdown", rearm);
  }, [alarmUnlocked, alarmSoundOn, alarmUnlock]);

  // Register the service worker so the screen is installable as a PWA, and keep
  // this device's push subscription fresh if notifications were already allowed.
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      void enableBackgroundPush();
    }
  }, []);

  // Ring while any order is waiting to be accepted; stop once the queue clears.
  const waiting = data.incoming.length;
  useEffect(() => {
    if (alarm.unlocked && waiting > 0) alarm.start();
    else alarm.stop();
  }, [alarm, waiting]);

  async function accept(orderId: string, prepMinutes: number | null) {
    setBusy(orderId);
    const res = await acceptMerchantOrder(orderId, prepMinutes);
    if (res.data) setData(res.data);
    // Optional auto-print: covers every transport via runPrintDispatch.
    if (autoPrint && res.ok) {
      try {
        const p = await printKitchenTicket(orderId);
        await runPrintDispatch(p, orderId, "kitchen");
      } catch {
        /* printing must never block service */
      }
    }
    setBusy(null);
  }

  async function reject(orderId: string, reason: RejectReason) {
    setBusy(orderId);
    const res = await rejectMerchantOrder(orderId, reason);
    if (res.data) setData(res.data);
    setRejecting(null);
    setBusy(null);
  }

  async function advance(orderId: string, to: MerchantAdvance) {
    // Optimistic: reflect the new status immediately so the button feels instant
    // even with many orders, then reconcile with the server in the background
    // (the full reload no longer blocks the tap).
    setData((d) => optimisticAdvance(d, orderId, to));
    advanceMerchantOrder(orderId, to)
      .then((res) => { if (res.data) setData(res.data); })
      .catch(() => refresh());
  }

  async function sendTest() {
    setTestMsg(null);
    const res = await createTestOrder();
    if (res.data) setData(res.data);
    if (!res.ok) setTestMsg(res.error ?? "Couldn't send a test order.");
  }

  // ---- Audio-unlock gate (browsers block sound until a user gesture) --------
  if (!alarm.unlocked) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-plum-ink px-6 text-center text-white">
        {bannerData && (
          <div className="w-full max-w-md text-left">
            <PlanStatusBanner surface="start" data={bannerData} />
          </div>
        )}
        <h1 className="font-heading text-3xl font-extrabold">{restaurantName} — Incoming Orders</h1>
        <p className="max-w-md text-white/70">
          Tap below to turn on the new-order alarm. When you tap, <strong>allow notifications</strong> —
          that&apos;s what alerts you if the app is minimized or closed. For the loud in-app alarm, keep
          this screen open (install it and leave it running on an always-on, plugged-in device).
        </p>
        <button
          onClick={() => { alarm.unlock(); void enableBackgroundPush(); }}
          className="rounded-2xl bg-red-600 px-10 py-6 text-2xl font-extrabold text-white shadow-lg"
        >
          🔔 Tap to start
        </button>
        <InstallButton subtle />
        <SignOutButton dark />
      </div>
    );
  }

  const topIncoming = data.incoming[0] ?? null;

  return (
    <div className="min-h-screen bg-cream pb-24">
      {/* Header */}
      <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-plum-ink/10 bg-white px-4 py-3">
        <div className="min-w-0">
          <h1 className="truncate font-heading text-lg font-extrabold leading-none">{restaurantName}</h1>
          <p className="text-xs text-plum-ink/50">Incoming online orders</p>
        </div>
        {/* Wraps rather than overflowing: a long shop name on a phone must not
            push the sign-out or the Live indicator off the edge of the screen. */}
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-sm">
          <InstallButton />
          <label className="flex items-center gap-2 font-semibold text-plum-ink/70">
            <input type="checkbox" checked={autoPrint} onChange={(e) => setAutoPrint(e.target.checked)} />
            Auto-print
          </label>
          <span className={`flex items-center gap-1.5 ${live ? "text-green-600" : "text-plum-ink/40"}`}>
            <span className={`h-2 w-2 rounded-full ${live ? "bg-green-500" : "bg-plum-ink/30"}`} />
            {live ? "Live" : "Reconnecting"}
          </span>
          <SignOutButton />
        </div>
      </header>

      {/* Audio got suspended (app was minimized/closed and reopened). Sound
          needs a fresh tap to come back — make that obvious and one-tap. */}
      {!alarm.soundOn && (
        <button
          type="button"
          onClick={() => { void alarm.unlock(); }}
          className="flex w-full items-center justify-center gap-2 bg-red-600 px-4 py-2.5 text-sm font-bold text-white"
        >
          🔔 Alarm sound is OFF — tap to turn it back on
        </button>
      )}

      {/* Booked for later — advance orders and table reservations don't join the
          live queue, so surface them here or staff never learn they came in. */}
      {(data.upcoming?.advanceOrders ?? 0) + (data.upcoming?.bookings ?? 0) > 0 && (
        <a
          href="/admin/advance-orders"
          className="flex items-center justify-between gap-3 border-b border-mango/30 bg-mango/10 px-4 py-3"
        >
          <span className="min-w-0">
            <span className="font-heading text-sm font-extrabold text-plum-ink">
              📅 {[
                data.upcoming.advanceOrders > 0
                  ? `${data.upcoming.advanceOrders} advance order${data.upcoming.advanceOrders === 1 ? "" : "s"}`
                  : null,
                data.upcoming.bookings > 0
                  ? `${data.upcoming.bookings} booking${data.upcoming.bookings === 1 ? "" : "s"}`
                  : null,
              ].filter(Boolean).join(" · ")}
            </span>
            {data.upcoming.nextAt && (
              <span className="block text-xs text-plum-ink/60">Next: {schedLabel(data.upcoming.nextAt)}</span>
            )}
          </span>
          <span className="shrink-0 rounded-full bg-plum-ink px-4 py-2 text-xs font-bold text-white">
            View →
          </span>
        </a>
      )}

      {/* FULL-SCREEN incoming-order alert (the loud one) */}
      {topIncoming && (
        <div
          className="fixed inset-0 z-40 flex flex-col p-5 text-white"
          style={{ background: "linear-gradient(160deg, #EF4444 0%, #B91C1C 100%)" }}
        >
          <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col">
            <div className="flex items-center justify-between">
              <p className="animate-pulse font-heading text-2xl font-extrabold">🔔 NEW ORDER</p>
              <p className="text-sm text-white/90">
                {data.incoming.length > 1 ? `${data.incoming.length} waiting · ` : ""}
                {minsAgo(topIncoming.createdAt)}
              </p>
            </div>

            <div className="mt-3 flex-1 overflow-y-auto rounded-2xl bg-white p-5 text-plum-ink">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-heading text-xl font-extrabold">{typeBadge(topIncoming)}</p>
                  <p className="text-sm text-plum-ink/60">
                    {topIncoming.customerName ?? "Customer"}
                    {topIncoming.customerPhone ? ` · ${topIncoming.customerPhone}` : ""}
                  </p>
                  {topIncoming.orderType === "delivery" && topIncoming.customerAddress && (
                    <p className="mt-0.5 text-sm text-plum-ink/60">📍 {topIncoming.customerAddress}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-heading text-2xl font-extrabold">{formatPeso(topIncoming.total)}</p>
                  <p className="text-xs text-plum-ink/40">{topIncoming.ref}</p>
                </div>
              </div>

              {topIncoming.scheduledFor && (
                <div className="mt-3 rounded-xl bg-mango/15 px-4 py-3 text-center">
                  <p className="font-heading text-lg font-extrabold text-mango">📅 Advance order</p>
                  <p className="text-sm font-semibold text-plum-ink/70">Wanted for {schedLabel(topIncoming.scheduledFor)}</p>
                </div>
              )}
              {topIncoming.paymentChoice && topIncoming.paymentChoice !== "cod" && (
                <div className="mt-3 rounded-xl bg-blue-50 px-4 py-2.5 text-center">
                  <p className="font-heading font-extrabold text-blue-600">
                    {topIncoming.paymentChoice === "maya" ? "🟢 Paid via Maya"
                      : topIncoming.paymentChoice === "bank" ? "🏦 Paid via bank"
                      : "📱 Paid via GCash"}
                  </p>
                  {topIncoming.paymentRef && <p className="text-sm font-semibold text-plum-ink/70">Ref: {topIncoming.paymentRef}</p>}
                  {topIncoming.paymentReceiptUrl && (
                    <a href={topIncoming.paymentReceiptUrl} target="_blank" rel="noopener" className="mt-1 inline-block text-sm font-semibold text-blue-600 underline">
                      🧾 View payment receipt
                    </a>
                  )}
                  <p className="text-[11px] text-plum-ink/50">Verify the payment before accepting.</p>
                </div>
              )}
              {topIncoming.customerNote && (
                <div className="mt-3 rounded-xl bg-mango/10 px-4 py-2.5">
                  <p className="text-xs font-bold uppercase tracking-wide text-plum-ink/50">📝 Note to rider</p>
                  <p className="text-sm font-semibold text-plum-ink/80">{topIncoming.customerNote}</p>
                </div>
              )}

              <div className="mt-4 border-t border-plum-ink/10 pt-4">
                <OrderLines o={topIncoming} />
              </div>
            </div>

            {/* Accept (with prep-time) / Reject (with reason) */}
            {rejecting === topIncoming.id ? (
              <div className="mt-4">
                <p className="mb-2 text-center font-semibold">Why are you rejecting this order?</p>
                <div className="grid grid-cols-3 gap-2">
                  {REJECT_LABELS.map((r) => (
                    <button
                      key={r.key}
                      disabled={busy === topIncoming.id}
                      onClick={() => reject(topIncoming.id, r.key)}
                      className="rounded-2xl bg-white py-5 text-lg font-bold text-plum-ink shadow disabled:opacity-50"
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
                <button onClick={() => setRejecting(null)} className="mt-3 w-full py-2 text-sm font-semibold text-white">
                  ← Back
                </button>
              </div>
            ) : (
              <div className="mt-4">
                <p className="mb-2 text-center text-sm font-semibold text-white">
                  Accept &amp; set how long it&apos;ll take:
                </p>
                <div className="grid grid-cols-5 gap-2">
                  {PREP_CHOICES.map((m) => (
                    <button
                      key={m}
                      disabled={busy === topIncoming.id}
                      onClick={() => accept(topIncoming.id, m)}
                      className="rounded-2xl bg-white py-5 text-xl font-extrabold text-red-600 shadow disabled:opacity-50"
                    >
                      {m}m
                    </button>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    disabled={busy === topIncoming.id}
                    onClick={() => accept(topIncoming.id, null)}
                    className="rounded-2xl bg-green-600 py-5 text-lg font-bold text-white shadow disabled:opacity-50"
                  >
                    ✓ Accept (no ETA)
                  </button>
                  <button
                    disabled={busy === topIncoming.id}
                    onClick={() => setRejecting(topIncoming.id)}
                    className="rounded-2xl bg-guava py-5 text-lg font-bold text-white shadow disabled:opacity-50"
                  >
                    ✕ Reject
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Active orders */}
      <section className="mx-auto max-w-2xl px-4 py-4">
        <h2 className="mb-2 font-heading text-sm font-bold uppercase tracking-wide text-plum-ink/50">
          In progress ({data.active.length})
        </h2>
        {data.active.length === 0 ? (
          <p className="rounded-tile border border-dashed border-plum-ink/15 bg-white px-4 py-8 text-center text-sm text-plum-ink/40">
            No active orders. New orders will alarm here.
          </p>
        ) : (
          <ul className="space-y-3">
            {data.active.map((o) => {
              const action = nextAction(o);
              return (
                <li key={o.id} className="rounded-tile border border-plum-ink/10 bg-white p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-heading font-bold">
                        {typeBadge(o)}
                        {o.orderNumber ? ` · ${o.orderNumber}` : ""}
                      </p>
                      <p className="text-sm text-plum-ink/55">
                        {o.customerName ?? "Customer"}
                        {o.customerPhone ? ` · ${o.customerPhone}` : ""} · {o.ref}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <PrepCountdownChip order={o} nowMs={nowMs} />
                      <p className="font-semibold">{formatPeso(o.total)}</p>
                      <p className="text-xs text-plum-ink/40">
                        {o.status === "done" && o.deliveryStatus === "out_for_delivery"
                          ? "Out for delivery"
                          : o.status === "done"
                            ? "Ready"
                            : o.status === "preparing"
                              ? "Preparing"
                              : "Accepted"}
                        {o.prepMinutes != null ? ` · promised ${o.prepMinutes}m` : ""}
                      </p>
                    </div>
                  </div>
                  {o.orderType === "delivery" && o.customerAddress && (
                    <p className="mt-1 text-sm text-plum-ink/60">📍 {o.customerAddress}</p>
                  )}
                  {o.customerNote && (
                    <p className="mt-1 rounded-lg bg-mango/10 px-2 py-1 text-sm font-semibold text-plum-ink/80">
                      📝 {o.customerNote}
                    </p>
                  )}
                  {o.paymentReceiptUrl && (
                    <a href={o.paymentReceiptUrl} target="_blank" rel="noopener" className="mt-1 inline-block text-xs font-semibold text-blue-600 underline">
                      🧾 View payment receipt
                    </a>
                  )}
                  <div className="mt-3 border-t border-plum-ink/5 pt-3">
                    <OrderLines o={o} />
                  </div>
                  <div className="mt-3 flex gap-2">
                    {action && (
                      <button
                        disabled={busy === o.id}
                        onClick={() => advance(o.id, action.to)}
                        className="flex-1 rounded-xl bg-red-600 py-4 text-lg font-bold text-white disabled:opacity-50"
                      >
                        {action.label}
                      </button>
                    )}
                    <button
                      disabled={busy === o.id}
                      onClick={() => {
                        printKitchenTicket(o.id).then((p) => runPrintDispatch(p, o.id, "kitchen")).catch(() => {});
                      }}
                      className="rounded-xl border border-plum-ink/15 px-4 py-4 text-lg font-bold"
                      title="Print kitchen ticket"
                    >
                      🖨️
                    </button>
                  </div>
                  {o.orderType === "delivery" && <DeliveryRiderPanel orderId={o.id} pulse={pulse} />}
                </li>
              );
            })}
          </ul>
        )}

        {/* Test order — verify the alarm + customer tracker end-to-end */}
        <div className="mt-6 rounded-tile border border-dashed border-plum-ink/15 bg-white p-3 text-center">
          <button
            onClick={sendTest}
            className="rounded-full border border-red-600 px-4 py-2 text-sm font-semibold text-red-600"
          >
            🧪 Send test order
          </button>
          <p className="mt-1.5 text-xs text-plum-ink/45">
            Rings the alarm with a sample order. Reject it after to clear it.
          </p>
          {testMsg && <p className="mt-1 text-xs font-semibold text-guava">{testMsg}</p>}
        </div>

        {/* History */}
        <button
          onClick={() => setShowHistory((s) => !s)}
          className="mt-6 text-sm font-semibold text-plum-ink/50"
        >
          {showHistory ? "▾" : "▸"} Recent ({data.history.length})
        </button>
        {showHistory && (
          <ul className="mt-2 space-y-1.5">
            {data.history.map((o) => (
              <li key={o.id} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm">
                <span className="text-plum-ink/70">
                  {typeBadge(o)} · {o.ref}
                  {o.status === "cancelled" && (
                    <span className="ml-1 text-guava">
                      rejected{o.cancelReason ? ` (${o.cancelReason.replace(/_/g, " ")})` : ""}
                    </span>
                  )}
                </span>
                <span className="text-plum-ink/50">{formatPeso(o.total)}</span>
              </li>
            ))}
            {data.history.length === 0 && <li className="text-sm text-plum-ink/40">Nothing yet.</li>}
          </ul>
        )}
      </section>
    </div>
  );
}
