"use client";

import { useActionState, useState } from "react";
import { sendTransfer, type TransferState } from "../actions";

const IDLE: TransferState = { status: "idle" };
const FIELD = "w-full rounded-xl border border-white/10 px-3 py-2 text-sm";

export interface TransferBatch {
  id: string;
  label: string;
  quantity: number;
}

/** Everything in the label, lowercased once, so filtering is a substring test. */
const haystack = (b: TransferBatch) => b.label.toLowerCase();

/**
 * Sending stock to another branch.
 *
 * BATCHES, NOT PRODUCTS. The lot number and expiry travel with the goods, so
 * what is being sent has to be a specific batch — a transfer of "20
 * paracetamol" leaves both branches' expiry profiles wrong, which is the one
 * thing this system exists to keep right.
 */
export function TransferForm({
  branches,
  fromBranchId,
  batches,
}: {
  branches: { id: string; name: string }[];
  fromBranchId: string;
  batches: TransferBatch[];
}) {
  const [state, action, pending] = useActionState(sendTransfer, IDLE);
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  /*
    THE TYPED QUANTITIES LIVE IN STATE, not in the inputs.

    Filtering unmounts rows. If the quantity lived in the DOM, searching for the
    next item would silently discard what had already been typed for the last
    one — a transfer that sends less than the person believes they sent, with
    nothing on screen to say so.

    It also keeps the submitted arrays aligned: the hidden pairs below are
    written from THIS map, so batchId[i] and quantity[i] always describe the
    same batch no matter what is filtered.
  */
  const [qty, setQty] = useState<Record<string, string>>({});

  const needle = query.trim().toLowerCase();
  const shown = needle ? batches.filter((b) => haystack(b).includes(needle)) : batches;
  const chosen = batches.filter((b) => (Number(qty[b.id]) || 0) > 0);
  const sending = chosen.reduce((n, b) => n + (Number(qty[b.id]) || 0), 0);

  const destinations = branches.filter((b) => b.id !== fromBranchId);

  if (destinations.length === 0) {
    return (
      <p className="rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 text-sm text-slate-300">
        There is only one branch, so there is nowhere to transfer to. Open
        another under Branches first.
      </p>
    );
  }

  if (batches.length === 0) {
    return (
      <p className="rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 text-sm text-slate-300">
        Nothing on the shelf at this branch to send.
      </p>
    );
  }

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="fromBranchId" value={fromBranchId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          To branch
          <select
            name="toBranchId"
            required
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className={`mt-1 ${FIELD}`}
          >
            <option value="">Pick a branch…</option>
            {destinations.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Notes
          <input name="notes" maxLength={500} className={`mt-1 ${FIELD}`} />
        </label>
      </div>

      {/*
        WRITTEN FROM THE MAP, NOT FROM THE VISIBLE ROWS. A batch the search is
        currently hiding is still being sent, and the two arrays stay aligned
        because they are generated together.
      */}
      {chosen.map((b) => (
        <div key={b.id}>
          <input type="hidden" name="batchId" value={b.id} />
          <input type="hidden" name="quantity" value={qty[b.id] ?? ""} />
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for an item, lot or expiry…"
          aria-label="Search the stock on this shelf"
          className={`${FIELD} min-w-0 flex-1`}
        />
        {chosen.length > 0 && (
          <p className="text-sm text-violet-300">
            {sending} unit{sending === 1 ? "" : "s"} across {chosen.length} batch
            {chosen.length === 1 ? "" : "es"}
          </p>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl">
        <table className="w-full text-sm">
          <thead className="bg-white/[0.06] text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Batch</th>
              <th className="px-4 py-2 text-right font-medium">On hand</th>
              <th className="px-4 py-2 text-right font-medium">Send</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/10">
            {shown.slice(0, 200).map((b) => (
              <tr key={b.id} className={(Number(qty[b.id]) || 0) > 0 ? "bg-violet-500/10" : ""}>
                <td className="px-4 py-2">{b.label}</td>
                <td className="px-4 py-2 text-right tabular-nums text-slate-500">{b.quantity}</td>
                <td className="px-4 py-2 text-right">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={qty[b.id] ?? ""}
                    onChange={(e) =>
                      setQty((q) => ({ ...q, [b.id]: e.target.value.replace(/[^0-9]/g, "") }))
                    }
                    placeholder="—"
                    aria-label={`Send how many of ${b.label}`}
                    className="w-24 rounded-xl border border-white/10 px-2 py-1 text-right text-sm"
                  />
                  {(Number(qty[b.id]) || 0) > b.quantity && (
                    <span className="mt-0.5 block text-xs text-rose-300">
                      only {b.quantity} on hand
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-slate-400">
            Nothing on this shelf matches &ldquo;{query}&rdquo;.
          </p>
        )}
        {shown.length > 200 && (
          <p className="px-4 py-3 text-center text-xs text-slate-400">
            Showing 200 of {shown.length}. Narrow the search to see the rest —
            anything you have already typed a quantity for is still being sent.
          </p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          disabled={pending || !to}
          className="rounded-lg brand-gradient px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
        >
          {pending ? "Sending…" : "Send the stock"}
        </button>
        <span className="text-xs text-slate-500">
          The stock leaves this branch now and arrives when the other branch
          confirms it.
        </span>
      </div>
      {state.status === "error" && <p className="text-sm text-red-300">{state.message}</p>}
    </form>
  );
}
