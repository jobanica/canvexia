"use client";

import { useActionState } from "react";
import { receiveDelivery, sendPurchaseOrder, cancelPo, type PoState } from "../actions";
import { outstanding } from "@/lib/pharmacy/po-input";

const IDLE: PoState = { status: "idle" };
const FIELD = "w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm";

export interface PoItemView {
  id: string;
  name: string;
  genericName: string | null;
  unit: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitCostCentavos: number;
}

/**
 * Receiving the boxes against the order.
 *
 * QUANTITIES DEFAULT TO WHAT IS STILL OWED and the cost to what was ordered at,
 * so a complete delivery is one button. Both are editable, because a short
 * delivery and a price change are the two things that actually happen.
 *
 * EXPIRY AND LOT ARE PER LINE, not per delivery. One box of amoxicillin and one
 * of paracetamol in the same carton have different dates, and a single field
 * for the delivery would stamp one of them wrong — which is the number the
 * whole expiry report rests on.
 */
export function ReceivePanel({ poId, items }: { poId: string; items: PoItemView[] }) {
  const [state, action, pending] = useActionState(receiveDelivery, IDLE);

  const open = items.filter((i) => outstanding(i) > 0);
  if (open.length === 0) {
    return (
      <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        Everything on this order has arrived.
      </p>
    );
  }

  return (
    <form action={action} className="rounded-xl border border-slate-200 bg-white p-5">
      <input type="hidden" name="poId" value={poId} />
      <p className="text-sm font-semibold">Receive a delivery</p>
      <p className="mt-1 text-sm text-slate-500">
        Leave a line blank if none of it came. Each line becomes its own batch,
        with its own lot number and expiry.
      </p>

      <div className="mt-4 space-y-3">
        {open.map((item) => (
          <div key={item.id} className="rounded-lg border border-slate-100 p-3">
            <input type="hidden" name="itemId" value={item.id} />
            <p className="text-sm font-medium">
              {item.name}
              <span className="ml-2 text-xs text-slate-500">
                {outstanding(item)} {item.unit} still owed
              </span>
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-4">
              <label className="text-xs text-slate-500">
                Quantity
                <input
                  name="receiveQty"
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={outstanding(item)}
                  className={`mt-1 ${FIELD}`}
                />
              </label>
              <label className="text-xs text-slate-500">
                Unit cost ₱
                <input
                  name="receiveCost"
                  type="number"
                  min={0}
                  step="0.01"
                  defaultValue={(item.unitCostCentavos / 100).toFixed(2)}
                  className={`mt-1 ${FIELD}`}
                />
              </label>
              <label className="text-xs text-slate-500">
                Lot number
                <input name="lotNumber" maxLength={100} className={`mt-1 ${FIELD}`} />
              </label>
              <label className="text-xs text-slate-500">
                Expiry
                <input name="expiryDate" type="date" className={`mt-1 ${FIELD}`} />
              </label>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          disabled={pending}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {pending ? "Recording…" : "Record the delivery"}
        </button>
        {state.status === "error" && <span className="text-sm text-red-700">{state.message}</span>}
        {state.status === "done" && (
          <span className="text-sm text-emerald-700">{state.message}</span>
        )}
      </div>
    </form>
  );
}

/** Send and cancel. Separate verbs, separate buttons, separate outcomes. */
export function PoControls({
  poId,
  status,
  anythingArrived,
}: {
  poId: string;
  status: string;
  anythingArrived: boolean;
}) {
  const [sent, sendAction, sending] = useActionState(sendPurchaseOrder, IDLE);
  const [cancelled, cancelAction, cancelling] = useActionState(cancelPo, IDLE);

  return (
    <div className="flex flex-wrap items-center gap-3">
      {status === "draft" && (
        <form action={sendAction}>
          <input type="hidden" name="poId" value={poId} />
          <button
            disabled={sending}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-40"
          >
            {sending ? "Marking…" : "Mark as sent"}
          </button>
        </form>
      )}

      {/*
        Cancelling is only offered while nothing has arrived. Goods on the shelf
        against a cancelled order is a stock record nobody can explain, and the
        server refuses it either way.
      */}
      {status !== "cancelled" && status !== "received" && !anythingArrived && (
        <form action={cancelAction}>
          <input type="hidden" name="poId" value={poId} />
          <button
            disabled={cancelling}
            className="text-sm text-slate-500 underline hover:text-red-700 disabled:opacity-40"
          >
            {cancelling ? "Cancelling…" : "Cancel this order"}
          </button>
        </form>
      )}

      {sent.status === "error" && <span className="text-sm text-red-700">{sent.message}</span>}
      {cancelled.status === "error" && (
        <span className="text-sm text-red-700">{cancelled.message}</span>
      )}
    </div>
  );
}
