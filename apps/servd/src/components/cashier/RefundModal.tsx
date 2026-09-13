"use client";

import { useEffect, useMemo, useState } from "react";
import { formatPeso } from "@/lib/money";
import { planRefund } from "@/lib/orders/refund";
import { getRefundableTicket, refundItems, type RefundableTicket } from "@/server/orders/refunds";

const REASONS = [
  "Item out of stock",
  "Wrong item served",
  "Customer cancelled the item",
  "Quality complaint",
  "Cashier error",
];

/**
 * Handing money back for specific items off a settled ticket.
 *
 * Per item, not the whole total, because that's the situation that actually
 * happens: the customer paid for three things, the kitchen ran out of one, and
 * they should be out of pocket for that one only. Voiding the ticket would
 * erase a sale that really did take place.
 *
 * The amount is worked out on the server from what the ticket actually
 * collected — the figure here is a preview computed by the same pure function,
 * so the cashier can say the number out loud before touching the drawer.
 */
export function RefundModal({
  orderId,
  onClose,
  onDone,
}: {
  orderId: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [ticket, setTicket] = useState<RefundableTicket | null | "loading">("loading");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [pin, setPin] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    getRefundableTicket(orderId)
      .then((t) => live && setTicket(t))
      .catch(() => live && setTicket(null));
    return () => {
      live = false;
    };
  }, [orderId]);

  const t = ticket === "loading" || ticket === null ? null : ticket;

  // Same arithmetic the server will run, so the number shown is the number given.
  const plan = useMemo(() => {
    if (!t) return null;
    const requests = Object.entries(qty)
      .filter(([, n]) => n > 0)
      .map(([lineId, quantity]) => ({ lineId, quantity }));
    if (requests.length === 0) return null;
    return planRefund(
      t.items.map((i) => ({
        id: i.id,
        lineTotal: i.lineTotal,
        quantity: i.quantity,
        refundedQty: i.refundedQty,
      })),
      requests,
      t.collected,
      t.alreadyRefunded,
    );
  }, [t, qty]);

  async function submit() {
    if (!t) return;
    const requests = Object.entries(qty)
      .filter(([, n]) => n > 0)
      .map(([lineId, quantity]) => ({ lineId, quantity }));
    setBusy(true);
    setError(null);
    try {
      const res = await refundItems(orderId, requests, pin, reason);
      if (res.ok) onDone(res.message);
      else setError(res.error);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = !busy && !!plan && !plan.error && plan.amount > 0 && !!pin.trim() && !!reason;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex max-h-[90vh] w-full max-w-md flex-col rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <h3 className="font-heading text-lg font-bold text-plum-ink">Refund items</h3>
            {t && (
              <p className="truncate text-sm text-plum-ink/55">
                {t.label} · {formatPeso(t.collected)} collected
                {t.alreadyRefunded > 0 && ` · ${formatPeso(t.alreadyRefunded)} already refunded`}
              </p>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className="shrink-0 text-2xl leading-none text-plum-ink/40">
            ×
          </button>
        </div>

        {ticket === "loading" ? (
          <p className="py-10 text-center text-sm text-plum-ink/50">Loading…</p>
        ) : !t ? (
          <p className="py-10 text-center text-sm text-guava">Couldn&apos;t load that ticket.</p>
        ) : !t.ready ? (
          <div className="mt-4 rounded-lg border border-mango/40 bg-mango/5 p-4">
            <p className="font-heading font-bold text-plum-ink">One database update needed</p>
            <p className="mt-1 text-sm text-plum-ink/70">
              Refunds need a column this database doesn&apos;t have yet. Run{" "}
              <code className="rounded bg-white px-1.5 py-0.5 text-xs">
                prisma/manual/add-item-prepared-and-refunds.sql
              </code>{" "}
              in the Supabase SQL editor, then reload.
            </p>
          </div>
        ) : t.remaining <= 0 ? (
          <p className="py-10 text-center text-sm text-plum-ink/55">
            Everything collected on this ticket has already been refunded.
          </p>
        ) : (
          <>
            <ul className="-mx-1 mt-3 flex-1 space-y-1 overflow-y-auto px-1">
              {t.items.map((i) => {
                const left = Math.max(0, i.quantity - i.refundedQty);
                const picked = qty[i.id] ?? 0;
                return (
                  <li
                    key={i.id}
                    className={`flex items-center gap-2 rounded-lg border p-2.5 ${
                      picked > 0 ? "border-guava/40 bg-guava/5" : "border-plum-ink/10"
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-semibold ${left === 0 ? "text-plum-ink/35 line-through" : "text-plum-ink"}`}>
                        {i.quantity}× {i.name}
                      </p>
                      <p className="text-xs text-plum-ink/45">
                        {formatPeso(i.lineTotal)}
                        {i.refundedQty > 0 && ` · ${i.refundedQty} already refunded`}
                      </p>
                    </div>
                    {left === 0 ? (
                      <span className="shrink-0 text-xs font-semibold text-plum-ink/35">refunded</span>
                    ) : (
                      <div className="flex shrink-0 items-center rounded-full border border-plum-ink/15">
                        <button
                          type="button"
                          onClick={() => setQty((q) => ({ ...q, [i.id]: Math.max(0, picked - 1) }))}
                          className="px-3 py-1 text-lg leading-none"
                          aria-label={`One fewer ${i.name}`}
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-sm font-bold tabular-nums">{picked}</span>
                        <button
                          type="button"
                          onClick={() => setQty((q) => ({ ...q, [i.id]: Math.min(left, picked + 1) }))}
                          className="px-3 py-1 text-lg leading-none"
                          aria-label={`One more ${i.name}`}
                        >
                          +
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* What actually goes back. A share of what was collected, not the
                menu price — otherwise a discounted ticket hands back more than
                the customer paid for that dish and the drawer comes up short. */}
            <div className="mt-3 rounded-xl bg-cream/60 p-3 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-plum-ink/45">
                Refund amount
              </p>
              <p className="font-heading text-2xl font-extrabold text-plum-ink">
                {formatPeso(plan && !plan.error ? plan.amount : 0)}
              </p>
              {plan?.error && <p className="mt-1 text-xs font-semibold text-guava">{plan.error}</p>}
            </div>

            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-3 w-full rounded-lg border border-plum-ink/15 px-3 py-2 text-sm"
            >
              <option value="">Why is this being refunded?…</option>
              {REASONS.map((r) => (
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

            {error && <p className="mt-2 text-sm text-guava">{error}</p>}

            <div className="mt-4 flex gap-2">
              <button
                onClick={submit}
                disabled={!canSubmit}
                className="flex-1 rounded-full bg-guava px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                {busy
                  ? "Refunding…"
                  : `Refund ${formatPeso(plan && !plan.error ? plan.amount : 0)}`}
              </button>
              <button
                onClick={onClose}
                className="rounded-full border border-plum-ink/15 px-4 py-2.5 text-sm font-semibold"
              >
                Cancel
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
