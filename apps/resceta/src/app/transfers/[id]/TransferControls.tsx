"use client";

import { useActionState } from "react";
import { acceptTransfer, abandonTransfer, type TransferState } from "../actions";

const IDLE: TransferState = { status: "idle" };

/**
 * Receiving or cancelling one that is still in the van.
 *
 * Both are offered only while `in_transit`. Receiving a received transfer would
 * double the stock; cancelling one that has arrived would delete stock that
 * exists. The server refuses both either way — this is so the button is not
 * there to press.
 */
export function TransferControls({ transferId, status }: { transferId: string; status: string }) {
  const [received, receiveAction, receiving] = useActionState(acceptTransfer, IDLE);
  const [cancelled, cancelAction, cancelling] = useActionState(abandonTransfer, IDLE);

  if (status !== "in_transit") {
    return received.status === "done" ? (
      <p className="text-sm text-emerald-700">{received.message}</p>
    ) : null;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-sm font-semibold">These boxes are in transit</p>
      <p className="mt-1 text-sm text-slate-500">
        They have left the sending branch and are not on any shelf yet. Confirm
        when they arrive — each line becomes a batch at the destination, keeping
        its lot number and expiry.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <form action={receiveAction}>
          <input type="hidden" name="transferId" value={transferId} />
          <button
            disabled={receiving}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {receiving ? "Receiving…" : "They arrived"}
          </button>
        </form>

        <form action={cancelAction}>
          <input type="hidden" name="transferId" value={transferId} />
          <button
            disabled={cancelling}
            className="text-sm text-slate-500 underline hover:text-red-700 disabled:opacity-40"
          >
            {cancelling ? "Cancelling…" : "Cancel and put the stock back"}
          </button>
        </form>
      </div>

      {received.status === "error" && <p className="mt-2 text-sm text-red-700">{received.message}</p>}
      {received.status === "done" && (
        <p className="mt-2 text-sm text-emerald-700">{received.message}</p>
      )}
      {cancelled.status === "error" && (
        <p className="mt-2 text-sm text-red-700">{cancelled.message}</p>
      )}
      {cancelled.status === "done" && (
        <p className="mt-2 text-sm text-emerald-700">{cancelled.message}</p>
      )}
    </div>
  );
}
