"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getOrderStatus } from "@/server/orders/order-status";
import { chime } from "@/lib/sound";
import { formatPeso } from "@/lib/money";
import { formatOrderNumber } from "@/lib/orders/order-number";
import { FeedbackForm } from "./FeedbackForm";

type Stage = {
  label: string;
  detail: string;
  tone: "wait" | "go" | "ready" | "done" | "bad";
};

function stageFor(status: string, paymentStatus: string): Stage {
  switch (status) {
    case "pending":
      return {
        label: "Order sent",
        detail: "Waiting for the restaurant to confirm…",
        tone: "wait",
      };
    case "new":
    case "preparing":
      return {
        label: "Order accepted 🎉",
        detail: "The kitchen is preparing your order. Keep this page open!",
        tone: "go",
      };
    case "done":
      return {
        label: "Your order is ready! 🍽️",
        detail: "Enjoy your meal!",
        tone: "ready",
      };
    case "closed":
      return { label: "Order completed", detail: "Thanks for dining with us!", tone: "done" };
    case "cancelled":
      return {
        label: "Order cancelled",
        detail: "This order was cancelled. Please ask a staff member.",
        tone: "bad",
      };
    default:
      return { label: "Order placed", detail: "", tone: "wait" };
  }
}

const TONE_CLASSES: Record<Stage["tone"], string> = {
  wait: "border-mango/40 bg-mango/10",
  go: "border-brand-primary/40 bg-brand-primary/10",
  ready: "border-green-500/40 bg-green-500/10",
  done: "border-plum-ink/15 bg-cream",
  bad: "border-guava/40 bg-guava/10",
};

/** Browser push notification (best-effort; requires the user's permission). */
function notify(title: string, body: string) {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      new Notification(title, { body });
    }
  } catch {
    /* ignore */
  }
}

export function OrderStatusTracker({
  restaurantId,
  slug,
  tableToken,
  orderId,
  isCounter = false,
  googleReviewUrl = null,
  onDismiss,
  onStatus,
}: {
  restaurantId: string;
  slug: string;
  tableToken: string;
  orderId: string;
  isCounter?: boolean;
  googleReviewUrl?: string | null;
  onDismiss: () => void;
  onStatus?: (status: string) => void;
}) {
  const t = useTranslations("feedback");
  const [status, setStatus] = useState<string>("pending");
  const [paymentStatus, setPaymentStatus] = useState<string>("unpaid");
  const [orderNumber, setOrderNumber] = useState<number | null>(null);
  const [bill, setBill] = useState<{ total: number; discountAmount: number; discountLabel: string | null; net: number }>({
    total: 0,
    discountAmount: 0,
    discountLabel: null,
    net: 0,
  });
  const [showFeedback, setShowFeedback] = useState(false);
  const prevStatus = useRef<string>("pending");
  const promptedRef = useRef(false);

  // Whether this order has already been rated/prompted (don't nag on reload).
  const ratedKey = `servd:rated:${orderId}`;

  const refresh = useCallback(async () => {
    const res = await getOrderStatus(slug, tableToken, orderId);
    if (!res) return;
    setStatus(res.status);
    setPaymentStatus(res.paymentStatus);
    setOrderNumber(res.orderNumber);
    setBill({
      total: res.total,
      discountAmount: res.discountAmount,
      discountLabel: res.discountLabel,
      net: res.net,
    });
    onStatus?.(res.status);

    // Fire a phone notification + chime on the important transitions.
    if (res.status !== prevStatus.current) {
      if ((res.status === "new" || res.status === "preparing") && prevStatus.current === "pending") {
        chime();
        notify("Order accepted 🎉", "The kitchen is preparing your order.");
      } else if (res.status === "done") {
        chime();
        notify("Your order is ready! 🍽️", "Enjoy your meal!");
      }
      prevStatus.current = res.status;
    }

    // Order completed → automatically ask for feedback (once).
    if (res.status === "closed" && !promptedRef.current) {
      promptedRef.current = true;
      let rated = false;
      try {
        rated = localStorage.getItem(ratedKey) === "1";
      } catch {
        /* ignore */
      }
      if (!rated) setShowFeedback(true);
    }
  }, [slug, tableToken, orderId, ratedKey, onStatus]);

  useEffect(() => {
    // Ask for notification permission so we can ping the phone when ready.
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    } catch {
      /* ignore */
    }

    refresh();
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel(`orders-${restaurantId}`)
      .on("broadcast", { event: "refresh" }, () => refresh())
      .subscribe();
    const poll = setInterval(refresh, 10000);
    return () => {
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [restaurantId, refresh]);

  const stage = stageFor(status, paymentStatus);
  const terminal = status === "closed" || status === "cancelled";

  function markRated() {
    try {
      localStorage.setItem(ratedKey, "1");
    } catch {
      /* ignore */
    }
  }

  return (
    <>
      <div className={`mt-3 rounded-tile border p-4 ${TONE_CLASSES[stage.tone]}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {orderNumber != null && (
              <p className="font-heading text-2xl font-extrabold leading-none text-brand-primary">
                Order {formatOrderNumber(orderNumber)}
              </p>
            )}
            <p className={`font-heading text-base font-bold text-brand-ink ${orderNumber != null ? "mt-1" : ""}`}>
              {stage.label}
            </p>
            {stage.detail && <p className="mt-0.5 text-sm text-brand-ink/70">{stage.detail}</p>}
            {(isCounter || orderNumber != null) && !terminal && paymentStatus !== "paid" && (
              <p className="mt-1 text-xs font-semibold text-brand-ink/70">
                💳 Pay at the counter — show this number.
              </p>
            )}
            <p className="mt-1 text-xs text-brand-ink/40">Ref #{orderId.slice(0, 8)}</p>
          </div>
          {terminal && (
            <button onClick={onDismiss} className="text-sm font-semibold text-brand-ink/50">
              Dismiss
            </button>
          )}
        </div>

        {/* Progress steps */}
        {!terminal && (
          <div className="mt-3 flex items-center gap-1">
            {["Sent", "Preparing", "Ready"].map((label, i) => {
              const reached =
                (i === 0) ||
                (i === 1 && (status === "new" || status === "preparing" || status === "done")) ||
                (i === 2 && status === "done");
              return (
                <div key={label} className="flex-1">
                  <div
                    className={`h-1.5 rounded-full ${reached ? "bg-brand-primary" : "bg-brand-ink/15"}`}
                  />
                  <p className="mt-1 text-center text-[10px] text-brand-ink/50">{label}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Bill summary — reflects any discount the cashier applied. */}
        {bill.total > 0 && status !== "cancelled" && (
          <div className="mt-3 border-t border-brand-ink/10 pt-2 text-sm">
            {bill.discountAmount > 0 ? (
              <>
                <div className="flex justify-between text-brand-ink/60">
                  <span>Subtotal</span>
                  <span>{formatPeso(bill.total)}</span>
                </div>
                <div className="flex justify-between text-brand-primary">
                  <span>{bill.discountLabel ?? "Discount"}</span>
                  <span>−{formatPeso(bill.discountAmount)}</span>
                </div>
                <div className="mt-1 flex justify-between font-heading font-bold text-brand-ink">
                  <span>Total due</span>
                  <span>{formatPeso(bill.net)}</span>
                </div>
              </>
            ) : (
              <div className="flex justify-between font-heading font-bold text-brand-ink">
                <span>Total</span>
                <span>{formatPeso(bill.total)}</span>
              </div>
            )}
          </div>
        )}

        {/* Completed → invite to rate (in case the auto popup was dismissed). */}
        {status === "closed" && (
          <button
            onClick={() => setShowFeedback(true)}
            className="mt-3 w-full rounded-full py-2.5 text-sm font-semibold btn-brand"
          >
            ⭐ {t("rateExperience")}
          </button>
        )}
      </div>

      {/* Auto feedback popup on completion */}
      {showFeedback && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-tile bg-white p-6 sm:rounded-tile">
            <div className="mb-2 flex justify-end">
              <button
                onClick={() => {
                  setShowFeedback(false);
                  markRated();
                }}
                aria-label="Close"
                className="text-2xl leading-none text-plum-ink/40"
              >
                ×
              </button>
            </div>
            <FeedbackForm
              slug={slug}
              tableToken={tableToken}
              googleReviewUrl={googleReviewUrl}
              onDone={markRated}
            />
          </div>
        </div>
      )}
    </>
  );
}
