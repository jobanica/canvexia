"use client";

import { useState } from "react";
import { formatPeso } from "@/lib/money";
import { orderTypeLabelWithEmoji } from "@/lib/orders/order-type";
import { methodLabel } from "@/lib/orders/shift-breakdown";
import type { HistoryOrder } from "@/server/orders/history";

/**
 * The order list, as cards.
 *
 * Cards rather than a table because this is read on a phone more often than a
 * desk — standing in the shop with a customer asking about Tuesday's order. A
 * ten-column table at that width is either unreadable or scrolls sideways, and
 * the column you need is always the one off the edge.
 *
 * Tapping a card opens what was actually ordered. That's the question a
 * printed report can't answer and the reason this exists at all.
 */
export function OrderHistoryList({ orders }: { orders: HistoryOrder[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (orders.length === 0) {
    return (
      <p className="rounded-tile border border-plum-ink/10 bg-white p-8 text-center text-sm text-plum-ink/45">
        No orders match. Try a wider date range, or clear the filters.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {orders.map((o) => {
        const open = openId === o.id;
        const cancelled = o.status === "cancelled";
        return (
          <li
            key={o.id}
            className={`min-w-0 rounded-tile border bg-white ${
              cancelled ? "border-guava/30" : "border-plum-ink/10"
            }`}
          >
            <button
              type="button"
              onClick={() => setOpenId(open ? null : o.id)}
              aria-expanded={open}
              className="flex w-full items-center gap-3 p-3 text-left"
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 font-semibold text-plum-ink">
                  <span>{o.label}</span>
                  <span className="text-xs font-normal text-plum-ink/55">
                    {orderTypeLabelWithEmoji(o.orderType)}
                  </span>
                  {cancelled && (
                    <span className="rounded-full bg-guava/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-guava">
                      Voided
                    </span>
                  )}
                  {!cancelled && o.paymentStatus !== "paid" && (
                    <span className="rounded-full bg-mango/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-plum-ink">
                      Unpaid
                    </span>
                  )}
                  {/* Marked settled, but no money was ever recorded against it.
                      Every report — dashboard, accounting, the shift Z-report —
                      counts payments, so an order in this state is a ticket you
                      can see here and nowhere else. Saying so beats leaving the
                      two screens to contradict each other. */}
                  {!cancelled && o.paymentStatus === "paid" && o.paid === 0 && o.total > 0 && (
                    <span className="rounded-full bg-plum-ink/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-plum-ink/70">
                      No payment recorded
                    </span>
                  )}
                </p>
                <p className="truncate text-xs text-plum-ink/50">
                  {o.at} · {o.itemCount} item{o.itemCount === 1 ? "" : "s"}
                  {o.customerName ? ` · ${o.customerName}` : ""}
                  {o.cashier ? ` · ${o.cashier}` : ""}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p
                  className={`font-heading font-extrabold tabular-nums ${
                    cancelled ? "text-plum-ink/35 line-through" : "text-plum-ink"
                  }`}
                >
                  {formatPeso(o.paid || o.total)}
                </p>
                {o.methods.length > 0 && (
                  <p className="text-[11px] text-plum-ink/45">
                    {o.methods.map(methodLabel).join(" + ")}
                  </p>
                )}
              </div>
              <span className="shrink-0 text-plum-ink/30" aria-hidden>
                {open ? "▴" : "▾"}
              </span>
            </button>

            {open && (
              <div className="border-t border-plum-ink/10 bg-cream/40 p-3">
                <ul className="space-y-1.5">
                  {o.items.map((it, i) => (
                    <li key={i} className="flex justify-between gap-2 text-sm">
                      <span className="min-w-0">
                        <span className="font-medium text-plum-ink">
                          {it.quantity}× {it.name}
                        </span>
                        {it.modifiers.length > 0 && (
                          <span className="block text-xs text-plum-ink/50">
                            {it.modifiers.join(", ")}
                          </span>
                        )}
                        {it.note && (
                          <span className="block text-xs italic text-plum-ink/50">“{it.note}”</span>
                        )}
                      </span>
                      <span className="shrink-0 tabular-nums text-plum-ink/70">
                        {formatPeso(it.lineTotal)}
                      </span>
                    </li>
                  ))}
                </ul>

                <dl className="mt-3 space-y-0.5 border-t border-plum-ink/10 pt-2 text-sm">
                  <Row k="Ticket total" v={formatPeso(o.total)} />
                  {o.discount > 0 && <Row k="Discount" v={`−${formatPeso(o.discount)}`} />}
                  <Row k="Collected" v={formatPeso(o.paid)} bold />
                  {o.customerPhone && <Row k="Phone" v={o.customerPhone} />}
                </dl>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Row({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${bold ? "font-bold text-plum-ink" : "text-plum-ink/70"}`}>
      <dt>{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}
