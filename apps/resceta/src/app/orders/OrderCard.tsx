"use client";

import { useActionState } from "react";
import { setOrderStatus, type OrderState } from "./actions";
import { peso, manilaDateTime } from "@/lib/money";

const IDLE: OrderState = { status: "idle" };

/** What a given status may become. Mirrors the server, which is authoritative. */
const NEXT: Record<string, { to: string; label: string; tone: string }[]> = {
  placed: [
    { to: "confirmed", label: "Confirm", tone: "bg-slate-900 text-white" },
    { to: "cancelled", label: "Cancel", tone: "border border-slate-300" },
  ],
  confirmed: [
    { to: "ready", label: "Ready for collection", tone: "bg-slate-900 text-white" },
    { to: "cancelled", label: "Cancel", tone: "border border-slate-300" },
  ],
  ready: [
    { to: "completed", label: "Collected and rung up", tone: "bg-emerald-600 text-white" },
    { to: "cancelled", label: "Cancel", tone: "border border-slate-300" },
  ],
  completed: [],
  cancelled: [],
};

export interface OrderView {
  id: string;
  orderNumber: string;
  status: string;
  fulfilment: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string | null;
  notes: string | null;
  totalCentavos: number;
  createdAt: Date;
  items: { id: string; nameAtTime: string; quantity: number; lineTotalCentavos: number }[];
}

export function OrderCard({ order, canHandle }: { order: OrderView; canHandle: boolean }) {
  const [state, action, pending] = useActionState(setOrderStatus, IDLE);
  const next = NEXT[order.status] ?? [];

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-mono font-semibold">{order.orderNumber}</h2>
        <span className="text-xs text-slate-500">{manilaDateTime(order.createdAt)}</span>
      </div>

      <p className="mt-1 text-sm">
        <span className="font-medium">{order.customerName}</span>{" "}
        <a href={`tel:${order.customerPhone}`} className="underline">
          {order.customerPhone}
        </a>
        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs">
          {order.fulfilment === "delivery" ? "delivery" : "pick-up"}
        </span>
        <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs">{order.status}</span>
      </p>
      {order.customerAddress && (
        <p className="mt-1 text-sm text-slate-600">{order.customerAddress}</p>
      )}
      {order.notes && <p className="mt-1 text-sm text-slate-600">{order.notes}</p>}

      <ul className="mt-3 divide-y divide-slate-100 text-sm">
        {order.items.map((i) => (
          <li key={i.id} className="flex justify-between py-1">
            <span>
              {i.quantity} × {i.nameAtTime}
            </span>
            <span className="tabular-nums">{peso(i.lineTotalCentavos)}</span>
          </li>
        ))}
        <li className="flex justify-between py-1 font-semibold">
          <span>Quoted</span>
          <span className="tabular-nums">{peso(order.totalCentavos)}</span>
        </li>
      </ul>

      {/*
        "Collected and rung up" says what actually happened, because nothing
        here moves stock: the sale goes through the counter like any other, and
        that is the only place FEFO allocation, the cost snapshot and the ledger
        entry happen.
      */}
      {canHandle && next.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {next.map((n) => (
            <form key={n.to} action={action}>
              <input type="hidden" name="orderId" value={order.id} />
              <input type="hidden" name="to" value={n.to} />
              <button
                disabled={pending}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold disabled:opacity-40 ${n.tone}`}
              >
                {n.label}
              </button>
            </form>
          ))}
        </div>
      )}

      {state.status === "error" && <p className="mt-2 text-sm text-red-700">{state.message}</p>}
    </article>
  );
}
