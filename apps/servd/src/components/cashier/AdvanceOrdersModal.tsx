"use client";

import { useCallback, useEffect, useState } from "react";
import { formatPeso } from "@/lib/money";
import { dueBucket, dueLabel, scheduledLabel, type DueBucket } from "@/lib/orders/scheduled";
import { orderTypeLabelWithEmoji } from "@/lib/orders/order-type";
import { useOrdersRefresh } from "@/lib/realtime/useOrdersRefresh";
import {
  getAdvanceQueue,
  sendAdvanceToKitchenNow,
  type AdvanceOrder,
} from "@/server/orders/advance-orders";

/**
 * The advance-order queue, at the till.
 *
 * Advance orders are deliberately kept off the "incoming now" popup — a booking
 * for next Saturday has no business flashing at a cashier mid-service. But that
 * left the till with no way to see them at all, so on the day itself nobody
 * could put one through to the kitchen without an owner logging in.
 *
 * Ordered by what the cashier is actually deciding: what needs to go to the
 * kitchen now. Overdue first, then today, then the rest.
 */

const BUCKET_LABEL: Record<DueBucket, string> = {
  overdue: "Due now",
  today: "Later today",
  later: "Coming up",
};

const BUCKET_ORDER: DueBucket[] = ["overdue", "today", "later"];

export function AdvanceOrdersModal({
  restaurantId,
  onClose,
}: {
  restaurantId: string;
  onClose: () => void;
}) {
  const [orders, setOrders] = useState<AdvanceOrder[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setOrders(await getAdvanceQueue());
    } catch {
      setOrders([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The other till sending one through, or the owner declining one, has to show
  // up here — two cashiers each sending the same booking is a double order.
  useOrdersRefresh(restaurantId, () => void load());

  async function send(o: AdvanceOrder) {
    setBusy(o.id);
    setError(null);
    try {
      const res = await sendAdvanceToKitchenNow(o.id);
      if (res.ok) {
        setOrders(res.orders);
        setToast(res.message);
        setTimeout(() => setToast(null), 3000);
      } else {
        setError(res.error);
        void load();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  // Cancelled bookings are gone; everything else is still worth seeing, because
  // "did that Saturday order already go through" is a question the till gets.
  const live = (orders ?? []).filter((o) => o.status !== "cancelled");
  const grouped = BUCKET_ORDER.map((bucket) => ({
    bucket,
    rows: live.filter((o) => dueBucket(o.scheduledFor) === bucket),
  })).filter((g) => g.rows.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-lg flex-col rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-tile"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="font-heading text-lg font-bold">📅 Advance orders</h2>
            <p className="text-sm text-plum-ink/55">
              Booked ahead. Send one to the kitchen when it&apos;s time to cook it.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 text-2xl leading-none text-plum-ink/40">
            ×
          </button>
        </div>

        {error && <p className="mb-2 rounded-lg bg-guava/10 px-3 py-2 text-sm text-guava">{error}</p>}

        <div className="-mx-1 flex-1 space-y-4 overflow-y-auto px-1">
          {orders === null ? (
            <p className="py-10 text-center text-sm text-plum-ink/50">Loading…</p>
          ) : grouped.length === 0 ? (
            <p className="py-10 text-center text-sm text-plum-ink/50">No advance orders booked.</p>
          ) : (
            grouped.map(({ bucket, rows }) => (
              <div key={bucket}>
                <p
                  className={`mb-2 text-[11px] font-bold uppercase tracking-widest ${
                    bucket === "overdue" ? "text-guava" : "text-plum-ink/40"
                  }`}
                >
                  {BUCKET_LABEL[bucket]} ({rows.length})
                </p>
                <div className="space-y-2">
                  {rows.map((o) => (
                    <Row
                      key={o.id}
                      order={o}
                      bucket={bucket}
                      busy={busy === o.id}
                      open={expanded === o.id}
                      onToggle={() => setExpanded(expanded === o.id ? null : o.id)}
                      onSend={() => send(o)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {toast && (
          <p className="mt-3 rounded-full bg-plum-ink px-4 py-2 text-center text-sm font-semibold text-white">
            {toast}
          </p>
        )}
      </div>
    </div>
  );
}

function Row({
  order: o,
  bucket,
  busy,
  open,
  onToggle,
  onSend,
}: {
  order: AdvanceOrder;
  bucket: DueBucket;
  busy: boolean;
  open: boolean;
  onToggle: () => void;
  onSend: () => void;
}) {
  const waiting = o.status === "pending";
  // A downpayment that was asked for and never ticked off. Shown, not blocked:
  // the owner may well have taken it in person, and a cashier stuck in front of
  // a customer whose food can't be started is the worse failure.
  const owesDownpayment = o.downpaymentAmount > 0 && !o.downpaymentPaid;

  return (
    <div
      className={`rounded-lg border p-3 ${
        bucket === "overdue" && waiting ? "border-guava/40 bg-guava/5" : "border-plum-ink/10"
      }`}
    >
      <button type="button" onClick={onToggle} className="flex w-full items-start gap-2 text-left">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 font-semibold text-plum-ink">
            <span className="truncate">{o.customerName || o.ref}</span>
            <span className="text-xs font-normal text-plum-ink/55">
              {orderTypeLabelWithEmoji(o.orderType)}
            </span>
            {!waiting && (
              <span className="rounded-full bg-plum-ink/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-plum-ink/60">
                {o.status === "closed" ? "Done" : "With the kitchen"}
              </span>
            )}
          </p>
          <p className="text-xs text-plum-ink/55">
            {scheduledLabel(o.scheduledFor)}
            {waiting && <span className="font-semibold"> · {dueLabel(o.scheduledFor)}</span>}
          </p>
          <p className="text-xs text-plum-ink/45">
            {formatPeso(o.total)} · {o.items.reduce((s, i) => s + i.quantity, 0)} item
            {o.items.reduce((s, i) => s + i.quantity, 0) === 1 ? "" : "s"}
            {o.customerPhone ? ` · ${o.customerPhone}` : ""}
          </p>
          {owesDownpayment && waiting && (
            <p className="mt-1 text-xs font-bold text-guava">
              ⚠️ Downpayment {formatPeso(o.downpaymentAmount)} not marked paid
              {o.downpaymentRef ? ` · ref ${o.downpaymentRef}` : ""}
            </p>
          )}
        </div>
        <span className="shrink-0 text-plum-ink/30" aria-hidden>
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <ul className="mt-2 space-y-1 border-t border-plum-ink/10 pt-2 text-sm">
          {o.items.map((i, n) => (
            <li key={n}>
              <span className="font-medium text-plum-ink">
                {i.quantity}× {i.name}
              </span>
              {i.modifiers.length > 0 && (
                <span className="text-plum-ink/45"> · {i.modifiers.join(", ")}</span>
              )}
              {i.note && <span className="text-guava"> · “{i.note}”</span>}
            </li>
          ))}
          {o.customerAddress && (
            <li className="pt-1 text-xs text-plum-ink/55">📍 {o.customerAddress}</li>
          )}
        </ul>
      )}

      {waiting && (
        <button
          onClick={onSend}
          disabled={busy}
          className="mt-2 w-full rounded-full py-2 text-sm font-bold btn-brand disabled:opacity-60"
        >
          {busy ? "Sending…" : "🍳 Send to kitchen"}
        </button>
      )}
    </div>
  );
}
