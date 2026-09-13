"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getClosedOrders,
  getVoidedOrders,
  reopenOrder,
  voidClosedOrder,
  type ClosedOrder,
  type VoidedOrder,
  type CashierTable,
} from "@/server/orders/cashier";
import { formatPeso } from "@/lib/money";
import { VOID_REASONS } from "@/lib/orders/void-reasons";
import { useOrdersRefresh } from "@/lib/realtime/useOrdersRefresh";
import { RefundModal } from "./RefundModal";

/** Lists today's closed orders and lets the cashier re-open any of them. */
export function ClosedOrdersModal({
  restaurantId,
  onClose,
  onReopened,
}: {
  restaurantId: string;
  onClose: () => void;
  onReopened: (tables: CashierTable[]) => void;
}) {
  const [orders, setOrders] = useState<ClosedOrder[] | null>(null);
  const [voided, setVoided] = useState<VoidedOrder[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  // Voiding a settled order needs the PIN and a reason, same as voiding a live
  // one — this is reversing money that was already taken.
  const [voidTarget, setVoidTarget] = useState<ClosedOrder | null>(null);
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [voidError, setVoidError] = useState<string | null>(null);
  // Refunding specific items, for when only part of a paid ticket went wrong.
  const [refundTarget, setRefundTarget] = useState<ClosedOrder | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function confirmVoid() {
    if (!voidTarget) return;
    setBusy(voidTarget.id);
    setVoidError(null);
    try {
      const res = await voidClosedOrder(voidTarget.id, pin, reason);
      if (res.ok) {
        setOrders(res.closed ?? null);
        setVoided(await getVoidedOrders());
        setVoidTarget(null);
        setPin("");
        setReason("");
      } else {
        setVoidError(res.error ?? "Could not void that order.");
      }
    } catch {
      setVoidError("Something went wrong. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  const load = useCallback(async () => {
    const [closed, voidedRows] = await Promise.all([
      getClosedOrders().catch(() => [] as ClosedOrder[]),
      getVoidedOrders().catch(() => [] as VoidedOrder[]),
    ]);
    setOrders(closed);
    setVoided(voidedRows);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // This list used to load once and then sit there: a ticket settled on the
  // other till, or voided by a manager, simply never appeared. It's the list a
  // cashier checks the day's takings against, so being one sale behind is the
  // difference between the drawer balancing and not.
  useOrdersRefresh(restaurantId, () => void load());

  async function reopen(id: string) {
    setBusy(id);
    try {
      const res = await reopenOrder(id);
      if (res.ok) {
        if (res.tables) onReopened(res.tables);
        setOrders(res.closed ?? orders?.filter((o) => o.id !== id) ?? null);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-md flex-col rounded-tile bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold">Closed &amp; voided — today</h2>
          <button onClick={onClose} className="text-plum-ink/40 hover:text-plum-ink">✕</button>
        </div>

        <div className="-mx-1 space-y-4 overflow-y-auto px-1">
          {/* Closed orders */}
          <div className="space-y-2">
            {orders === null ? (
              <p className="py-6 text-center text-sm text-plum-ink/50">Loading…</p>
            ) : orders.length === 0 ? (
              <p className="py-4 text-center text-sm text-plum-ink/50">No closed orders today.</p>
            ) : (
              orders.map((o) => (
                <div key={o.id} className="flex items-center justify-between rounded-lg border border-plum-ink/10 p-3">
                  <div>
                    <p className="font-medium">{o.label}</p>
                    <p className="text-xs text-plum-ink/50">
                      {formatPeso(o.total)} · {o.paymentStatus === "paid" ? "paid" : "unpaid"} ·{" "}
                      {new Date(o.closedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      onClick={() => reopen(o.id)}
                      disabled={busy === o.id}
                      className="rounded-full border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold hover:bg-cream disabled:opacity-60"
                    >
                      {busy === o.id ? "…" : "Re-open"}
                    </button>
                    {/* Refund is for when part of a real sale went wrong — the
                        dish that never came out. Void is for a sale that
                        shouldn't have been recorded at all. Different things,
                        so both are offered. */}
                    {o.paymentStatus === "paid" && (
                      <button
                        onClick={() => setRefundTarget(o)}
                        disabled={busy === o.id}
                        className="rounded-full border border-plum-ink/15 px-3 py-1.5 text-xs font-semibold hover:bg-cream disabled:opacity-60"
                      >
                        Refund
                      </button>
                    )}
                    <button
                      onClick={() => { setVoidTarget(o); setVoidError(null); }}
                      disabled={busy === o.id}
                      className="rounded-full border border-guava/40 px-3 py-1.5 text-xs font-semibold text-guava hover:bg-guava/5 disabled:opacity-60"
                    >
                      Void
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Voided today */}
          {voided.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-guava">
                Voided today ({voided.length})
              </p>
              <div className="space-y-2">
                {voided.map((v) => (
                  <div key={v.id} className="flex items-center justify-between rounded-lg border border-guava/30 bg-guava/5 p-3">
                    <div>
                      <p className="font-medium">{v.label}</p>
                      <p className="text-xs text-plum-ink/50">
                        {formatPeso(v.total)} ·{" "}
                        {new Date(v.voidedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                    <span className="rounded-full bg-guava/15 px-2 py-0.5 text-xs font-semibold text-guava">
                      voided
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed inset-x-0 bottom-6 z-[70] flex justify-center px-4" onClick={(e) => e.stopPropagation()}>
          <p className="rounded-full bg-plum-ink px-4 py-2 text-sm font-semibold text-white shadow-lg">
            {toast}
          </p>
        </div>
      )}

      {refundTarget && (
        <RefundModal
          orderId={refundTarget.id}
          onClose={() => setRefundTarget(null)}
          onDone={(message) => {
            setRefundTarget(null);
            setToast(message);
            setTimeout(() => setToast(null), 4000);
            void load();
          }}
        />
      )}

      {voidTarget && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-full max-w-sm rounded-tile bg-white p-5 shadow-xl">
            <h3 className="font-heading text-lg font-bold">Void {voidTarget.label}?</h3>
            <p className="mt-1 text-sm text-plum-ink/60">
              This reverses {formatPeso(voidTarget.total)} that was already recorded as paid. It
              stops counting as a sale and stays in the audit log.
            </p>

            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-4 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
            >
              <option value="">Reason for the void…</option>
              {VOID_REASONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>

            <input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Void PIN"
              className="mt-2 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
            />

            {voidError && <p className="mt-2 text-sm text-guava">{voidError}</p>}

            <div className="mt-4 flex gap-2">
              <button
                onClick={confirmVoid}
                disabled={!!busy || !pin.trim() || !reason}
                className="flex-1 rounded-full bg-guava px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                {busy ? "Voiding…" : "Void order"}
              </button>
              <button
                onClick={() => { setVoidTarget(null); setVoidError(null); }}
                className="rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
