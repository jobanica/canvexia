"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getWebOrderStatus, cancelWebOrder, customerMarkDelivered } from "@/server/orders/web-order-status";
import { chime } from "@/lib/sound";
import { formatPeso } from "@/lib/money";
import { formatOrderNumber } from "@/lib/orders/order-number";
import { subscribeToPush, pushSupported } from "@/lib/push/subscribe";
import { saveDinerPushSubscription } from "@/server/push/actions";

type Tone = "wait" | "go" | "ready" | "done" | "bad";
type Stage = { label: string; detail: string; tone: Tone };

const TONE_CLASSES: Record<Tone, string> = {
  wait: "border-mango/40 bg-mango/10",
  go: "border-brand-primary/40 bg-brand-primary/10",
  ready: "border-green-500/40 bg-green-500/10",
  done: "border-plum-ink/15 bg-cream",
  bad: "border-guava/40 bg-guava/10",
};

/** The labelled progress steps, which differ for pickup vs delivery. */
function stepsFor(delivery: boolean): string[] {
  return delivery
    ? ["Placed", "Accepted", "Preparing", "Out for delivery", "Delivered"]
    : ["Placed", "Accepted", "Preparing", "Ready"];
}

/** How far along the progress bar we are (index of the last reached step). */
function reachedIndex(status: string, deliveryStatus: string | null, delivery: boolean): number {
  if (deliveryStatus === "delivered" || status === "closed") return delivery ? 4 : 3;
  if (deliveryStatus === "out_for_delivery") return 3;
  switch (status) {
    case "pending":
      return 0;
    case "new":
      return 1;
    case "preparing":
      return 2;
    case "done":
      return delivery ? 2 : 3; // delivery: ready, awaiting dispatch
    default:
      return 0;
  }
}

/** The headline + sub-text for the current state. */
function stageFor(status: string, deliveryStatus: string | null, delivery: boolean): Stage {
  if (status === "cancelled") {
    return {
      label: "Order cancelled",
      detail: "Sorry — this order was cancelled. Please contact the restaurant.",
      tone: "bad",
    };
  }
  if (deliveryStatus === "delivered" || status === "closed") {
    return delivery
      ? { label: "Delivered ✓", detail: "Your order has been delivered. Enjoy your meal!", tone: "done" }
      : { label: "Order completed ✓", detail: "Thanks for your order — enjoy!", tone: "done" };
  }
  if (deliveryStatus === "out_for_delivery") {
    return { label: "Out for delivery 🛵", detail: "Your rider is on the way. Keep your phone nearby.", tone: "go" };
  }
  switch (status) {
    case "pending":
      return { label: "Order placed", detail: "Waiting for the restaurant to accept your order…", tone: "wait" };
    case "new":
      return { label: "Order accepted 🎉", detail: "The restaurant confirmed your order and is starting it.", tone: "go" };
    case "preparing":
      return { label: "Preparing your order 👨‍🍳", detail: "Your food is being prepared right now.", tone: "go" };
    case "done":
      return delivery
        ? { label: "Ready — packing for delivery 📦", detail: "Your order is ready and will be dispatched shortly.", tone: "ready" }
        : { label: "Ready for pickup! 🛍️", detail: "Your order is ready — head over to collect it.", tone: "ready" };
    default:
      return { label: "Order placed", detail: "Waiting for the restaurant to accept your order…", tone: "wait" };
  }
}

/** Best-effort browser push notification (needs the user's permission). */
function notify(title: string, body: string) {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(title, { body });
    }
  } catch {
    /* ignore */
  }
}

/**
 * Live status tracker shown after a customer places an online order. Polls every
 * 10s and listens on the restaurant's realtime channel, so it flips from "Order
 * placed" → "Order accepted" → "Preparing" → "Ready / Out for delivery" →
 * "Completed" the moment the cashier advances it — no refresh needed.
 */
export function WebOrderTracker({
  slug,
  orderId,
  orderType,
  restaurantName,
  phone,
  homeHref,
  selfBookRider = false,
  selfBookRiderNote,
  pickupAddress = null,
}: {
  slug: string;
  orderId: string;
  orderType: "pickup" | "delivery";
  restaurantName: string;
  phone?: string;
  homeHref: string;
  selfBookRider?: boolean;
  selfBookRiderNote?: string;
  pickupAddress?: string | null;
}) {
  const delivery = orderType === "delivery";
  const [copied, setCopied] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [markingDelivered, setMarkingDelivered] = useState(false);
  const [deliverError, setDeliverError] = useState<string | null>(null);
  // The permanent link to THIS order's status — safe to bookmark/share (the id
  // is an unguessable UUID). Built from the home path so it works on custom
  // domains too (homeHref is "/" there, "/r/<slug>" on the platform host).
  const trackPath = `${homeHref === "/" ? "" : homeHref}/order/${orderId}`;

  // Remember this order in the browser so returning to the site can offer a
  // "track your recent order" shortcut even if they closed the tab.
  useEffect(() => {
    try {
      localStorage.setItem(
        `servd:lastOrder:${slug}`,
        JSON.stringify({ orderId, path: trackPath, orderType, at: Date.now() }),
      );
    } catch { /* storage unavailable (private mode) — link + copy still work */ }
  }, [slug, orderId, trackPath, orderType]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${trackPath}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked — the field is selectable as a fallback */ }
  }
  const [status, setStatus] = useState("pending");
  const [deliveryStatus, setDeliveryStatus] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [prepMinutes, setPrepMinutes] = useState<number | null>(null);
  const [restaurantId, setRestaurantId] = useState<string | null>(null);
  const [riderTrackingUrl, setRiderTrackingUrl] = useState<string | null>(null);
  const [riderName, setRiderName] = useState<string | null>(null);
  const [riderArrivedAt, setRiderArrivedAt] = useState<string | null>(null);
  const [riderMessage, setRiderMessage] = useState<string | null>(null);
  const [riderMessageAt, setRiderMessageAt] = useState<string | null>(null);
  const prevStatus = useRef<string>("pending");
  const prevDelivery = useRef<string | null>(null);
  // The first poll is history, not news: re-opening a bookmarked tracker must
  // not announce an arrival that happened twenty minutes ago.
  const prevArrived = useRef<string | null | undefined>(undefined);
  const prevMessageAt = useRef<string | null | undefined>(undefined);

  // Once this order is finished (completed / delivered / cancelled), forget it so
  // the site stops showing the "you have a recent order" banner for it.
  useEffect(() => {
    const finished = status === "closed" || status === "cancelled" || deliveryStatus === "delivered";
    if (!finished) return;
    try {
      const raw = localStorage.getItem(`servd:lastOrder:${slug}`);
      if (raw && JSON.parse(raw)?.orderId === orderId) localStorage.removeItem(`servd:lastOrder:${slug}`);
    } catch { /* storage unavailable */ }
  }, [status, deliveryStatus, slug, orderId]);

  const refresh = useCallback(async () => {
    const res = await getWebOrderStatus(slug, orderId);
    if (!res) return;
    setStatus(res.status);
    setDeliveryStatus(res.deliveryStatus);
    setOrderNumber(res.orderNumber);
    setTotal(res.total);
    setPrepMinutes(res.prepMinutes);
    setRestaurantId(res.restaurantId);
    setRiderTrackingUrl(res.riderTrackingUrl);
    setRiderName(res.riderName);
    setRiderArrivedAt(res.riderArrivedAt);
    setRiderMessage(res.riderMessage);
    setRiderMessageAt(res.riderMessageAt);

    // "I'm outside" is the one moment on this page where somebody is waiting on
    // the diner rather than the other way round, so it gets its own alert.
    if (prevArrived.current === undefined) {
      prevArrived.current = res.riderArrivedAt;
    } else if (res.riderArrivedAt && !prevArrived.current) {
      prevArrived.current = res.riderArrivedAt;
      chime();
      notify("Your rider is outside 🛵", "They are at your address with your order.");
    }

    if (prevMessageAt.current === undefined) {
      prevMessageAt.current = res.riderMessageAt;
    } else if (res.riderMessageAt && res.riderMessageAt !== prevMessageAt.current) {
      prevMessageAt.current = res.riderMessageAt;
      chime();
      notify("Message from your rider 💬", res.riderMessage ?? "Tap to read it.");
    }

    // Chime + notify on the meaningful transitions.
    if (res.status !== prevStatus.current || res.deliveryStatus !== prevDelivery.current) {
      if (res.status === "new" && prevStatus.current === "pending") {
        chime();
        notify("Order accepted 🎉", `${restaurantName} is preparing your order.`);
      } else if (res.deliveryStatus === "out_for_delivery" && prevDelivery.current !== "out_for_delivery") {
        chime();
        notify("Out for delivery 🛵", "Your order is on the way!");
      } else if (res.status === "done" && prevStatus.current !== "done") {
        chime();
        notify(delivery ? "Order ready 📦" : "Ready for pickup! 🛍️", `${restaurantName} has your order ready.`);
      }
      prevStatus.current = res.status;
      prevDelivery.current = res.deliveryStatus;
    }
  }, [slug, orderId, restaurantName, delivery]);

  // Initial fetch + ask for notification permission once.
  useEffect(() => {
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    } catch {
      /* ignore */
    }
    refresh();
    const poll = setInterval(refresh, 10000);
    return () => clearInterval(poll);
  }, [refresh]);

  // Subscribe to the restaurant's realtime channel once we know its id, so
  // updates land instantly (the 10s poll is the fallback).
  useEffect(() => {
    if (!restaurantId) return;
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`orders-${restaurantId}`)
      .on("broadcast", { event: "refresh" }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [restaurantId, refresh]);

  const stage = stageFor(status, deliveryStatus, delivery);
  const steps = stepsFor(delivery);
  const reached = reachedIndex(status, deliveryStatus, delivery);
  const terminal = status === "cancelled" || status === "closed" || deliveryStatus === "delivered";

  // The customer can cancel only while the order is still pending (not accepted).
  async function doCancel() {
    if (!window.confirm("Cancel this order? This can't be undone.")) return;
    setCancelling(true);
    setCancelError(null);
    const res = await cancelWebOrder(slug, orderId);
    setCancelling(false);
    if (res.ok) setStatus("cancelled");
    else { setCancelError(res.error); refresh(); } // it was likely just accepted
  }

  async function doMarkDelivered() {
    if (!window.confirm("Confirm you've received your order?")) return;
    setMarkingDelivered(true);
    setDeliverError(null);
    const res = await customerMarkDelivered(slug, orderId);
    setMarkingDelivered(false);
    if (res.ok) { setStatus("closed"); setDeliveryStatus("delivered"); }
    else { setDeliverError(res.error); refresh(); }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 px-5 py-16">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow">
        <div
          className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl text-white ${
            stage.tone === "bad" ? "bg-guava" : "bg-red-600"
          }`}
        >
          {stage.tone === "bad" ? "✕" : stage.tone === "done" ? "✓" : "🧾"}
        </div>

        <h1 className="mt-4 font-heading text-2xl font-bold text-plum-ink">{stage.label}</h1>
        {orderNumber != null && (
          <p className="mt-1 font-heading text-lg font-extrabold text-brand-primary">
            Order {formatOrderNumber(orderNumber)}
          </p>
        )}
        <p className="mt-2 text-sm text-plum-ink/60">{stage.detail}</p>
        {prepMinutes != null && (status === "new" || status === "preparing") && (
          <p className="mt-1 text-sm font-semibold text-brand-primary">
            Estimated ready in ~{prepMinutes} min
          </p>
        )}

        {/* Live progress steps */}
        {status !== "cancelled" && (
          <div className="mt-5 flex items-center gap-1.5">
            {steps.map((label, i) => (
              <div key={label} className="flex-1">
                <div className={`h-1.5 rounded-full ${i <= reached ? "bg-brand-primary" : "bg-plum-ink/15"}`} />
                <p className="mt-1 text-center text-[10px] leading-tight text-plum-ink/50">{label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Ask the customer to book their own rider (stores with no fleet). */}
        {selfBookRider && !terminal && (
          <div className="mt-5 rounded-xl border border-mango/40 bg-mango/10 p-4 text-left">
            <p className="font-heading font-extrabold text-plum-ink">🛵 Please book your own rider</p>
            <p className="mt-1 text-sm text-plum-ink/70">
              {selfBookRiderNote?.trim()
                ? selfBookRiderNote
                : "This store doesn't have its own riders. Please book a rider (Lalamove, Grab, etc.) to pick up your order."}
            </p>
            {pickupAddress && (
              <p className="mt-2 text-sm text-plum-ink/70">
                <span className="font-semibold text-plum-ink">Pick-up address:</span> {pickupAddress}
              </p>
            )}
          </div>
        )}

        <div className="mt-5 rounded-xl bg-gray-50 p-3 text-sm">
          <div className="flex justify-between text-plum-ink/60">
            <span>Reference</span>
            <span className="font-semibold text-plum-ink">#{orderId.slice(0, 8).toUpperCase()}</span>
          </div>
          {total > 0 && (
            <div className="mt-1 flex justify-between text-plum-ink/60">
              <span>Total</span>
              <span className="font-semibold text-plum-ink">{formatPeso(total)}</span>
            </div>
          )}
        </div>

        {!terminal && (
          <div className="mt-4 rounded-xl border border-plum-ink/10 bg-cream/50 p-3 text-left">
            <p className="text-xs font-semibold text-plum-ink/70">📌 Save this link to check your order later</p>
            <p className="mt-0.5 text-[11px] text-plum-ink/45">
              If you close this tab, open this link anytime to see the latest status.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <input
                readOnly
                value={typeof window !== "undefined" ? `${window.location.origin}${trackPath}` : trackPath}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-lg border border-plum-ink/15 bg-white px-2 py-1.5 text-xs text-plum-ink/70"
              />
              <button
                type="button"
                onClick={copyLink}
                className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white"
              >
                {copied ? "Copied ✓" : "Copy"}
              </button>
            </div>
          </div>
        )}

        {!terminal && (
          <p className="mt-3 text-xs text-plum-ink/45">
            This page updates automatically.{phone ? ` ${restaurantName} may also call ${phone} to confirm.` : ""}
          </p>
        )}

        {/* At the door. Not a stage — the delivery is not over until somebody
            hands the food across — so it sits over the stage rather than in it. */}
        {delivery && riderArrivedAt && !terminal && (
          <p className="mt-5 rounded-2xl bg-plum-ink px-4 py-3 text-sm font-semibold text-white">
            🛵 Your rider is outside with your order.
          </p>
        )}

        {delivery && riderMessage && !terminal && (
          <a
            href={riderTrackingUrl ?? trackPath}
            target={riderTrackingUrl ? "_blank" : undefined}
            rel={riderTrackingUrl ? "noopener noreferrer" : undefined}
            className="mt-3 block rounded-2xl border border-plum-ink/15 bg-cream px-4 py-3 text-left"
          >
            <span className="block text-xs font-semibold uppercase tracking-wide text-plum-ink/45">
              Message from your rider
            </span>
            <span className="block text-sm text-plum-ink">{riderMessage}</span>
          </a>
        )}

        {/* Only where there is a rider to be alerted about. A restaurant that
            arranges delivery by phone has no arrival to announce, and offering
            to alert somebody about one would be a promise nothing keeps. */}
        {delivery && riderTrackingUrl && !terminal && <AlertMe slug={slug} orderId={orderId} />}

        {/* Watch the rider — only when the provider actually gave us a page to
            send them to. A manual booking is a phone call and a deep-link one
            happens in somebody else's app; neither has anything to link. */}
        {delivery && riderTrackingUrl && !terminal && (
          <a
            href={riderTrackingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 flex items-center justify-center gap-2 rounded-full bg-plum-ink px-6 py-3 text-sm font-semibold text-white"
          >
            🛵 Track {riderName ? riderName : "your rider"} on the map
          </a>
        )}

        {/* Confirm arrival — only while the order is out for delivery. */}
        {delivery && deliveryStatus === "out_for_delivery" && !terminal && (
          <div className="mt-5">
            <button
              type="button"
              onClick={doMarkDelivered}
              disabled={markingDelivered}
              className="rounded-full bg-green-600 px-6 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {markingDelivered ? "Confirming…" : "✅ I received my order"}
            </button>
            <p className="mt-1 text-[11px] text-plum-ink/40">Tap once your order arrives — this tells the restaurant it&apos;s delivered.</p>
            {deliverError && <p className="mt-1 text-xs text-guava">{deliverError}</p>}
          </div>
        )}

        {/* Cancel — only while the order is still pending (not yet accepted). */}
        {status === "pending" && (
          <div className="mt-4">
            <button
              type="button"
              onClick={doCancel}
              disabled={cancelling}
              className="rounded-full border border-guava/50 px-5 py-2.5 text-sm font-semibold text-guava disabled:opacity-50"
            >
              {cancelling ? "Cancelling…" : "Cancel order"}
            </button>
            <p className="mt-1 text-[11px] text-plum-ink/40">You can cancel until the restaurant accepts it.</p>
            {cancelError && <p className="mt-1 text-xs text-guava">{cancelError}</p>}
          </div>
        )}

        {/* Plain anchor (hard navigation) — a full reload back to the menu is
            reliable even from this terminal screen, where the client router can
            otherwise stall while the tracker's poll/subscription tears down. */}
        <a
          href={homeHref || "/"}
          className="mt-6 inline-block rounded-full bg-red-600 px-6 py-3 font-semibold text-white"
        >
          Back to menu
        </a>
      </div>
    </div>
  );
}

/**
 * "Tell me on my phone."
 *
 * Without this the tracker can only alert a diner who left the tab open, which
 * is not what anybody does after ordering food. A Web Push subscription tied to
 * this one order survives the tab being closed, and it is scoped to the order —
 * it can never be used to send this person anything else.
 *
 * Hidden once it can no longer change anything: a diner who has already allowed
 * it, or already refused, does not need to be asked again.
 */
function AlertMe({ slug, orderId }: { slug: string; orderId: string }) {
  // Starts hidden and decides on the client. Reading Notification.permission
  // during render would make the server and the browser disagree about what
  // this renders, which is a hydration error rather than a button.
  const [state, setState] = useState<"unknown" | "idle" | "busy" | "on" | "unavailable">("unknown");

  useEffect(() => {
    if (!pushSupported() || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) { setState("unavailable"); return; }
    if (Notification.permission === "denied") { setState("unavailable"); return; }
    if (Notification.permission !== "granted") { setState("idle"); return; }

    // Already allowed on a previous order: the subscription still has to be
    // pointed at this one, and that needs no prompt.
    setState("on");
    void (async () => {
      const keys = await subscribeToPush();
      if (keys) await saveDinerPushSubscription({ slug, orderId, ...keys });
    })();
  }, [slug, orderId]);

  if (state === "unknown" || state === "unavailable" || state === "on") return null;

  return (
    <button
      type="button"
      disabled={state === "busy"}
      onClick={async () => {
        setState("busy");
        const keys = await subscribeToPush();
        if (!keys) { setState("unavailable"); return; }
        const res = await saveDinerPushSubscription({ slug, orderId, ...keys });
        setState(res.ok ? "on" : "unavailable");
      }}
      className="mt-5 w-full rounded-full border border-plum-ink/15 px-6 py-3 text-sm font-semibold text-plum-ink disabled:opacity-50"
    >
      {state === "busy" ? "Setting up…" : "🔔 Alert me when my rider arrives"}
    </button>
  );
}
