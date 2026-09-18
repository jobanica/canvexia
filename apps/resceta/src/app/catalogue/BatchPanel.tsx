"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { correctBatch, type BatchState } from "./batch-actions";
import { peso, manilaExpiry, manilaDate } from "@/lib/money";
import { expiryBucket, daysUntil } from "@/lib/pharmacy/alerts";
import type { ProductBatchRow } from "@/server/pharmacy/catalogue";

const IDLE: BatchState = { status: "idle" };
const FIELD =
  "w-full rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1.5 text-sm text-white";

/**
 * THE EXPIRY DATES, ON THE SCREEN SOMEBODY LOOKED FOR THEM.
 *
 * REPORTED — "when i check the details of the item, there is no expiration
 * date."
 *
 * There is no expiry on a product and there should not be: a product does not
 * expire, a DELIVERY does. Two boxes of the same drug bought a month apart
 * expire on different days and cost different money — which is why stock is
 * held in batches, why FEFO can pick the right box, and why a recall can name
 * a lot instead of condemning everything with that name on it.
 *
 * Putting one date on the product would mean either overwriting it on every
 * delivery (so the oldest box on the shelf is invisible) or picking one and
 * calling it the truth. Both end with expired stock being dispensed.
 *
 * So this shows what actually exists, in FEFO order — and lets a mistyped date
 * be corrected, which until now needed SQL.
 */
export function BatchPanel({
  batches,
  productName,
  priceCentavos,
  showCost,
  canEdit,
}: {
  batches: ProductBatchRow[];
  productName: string;
  /** To sit the cost figures next to, because one without the other is half an answer. */
  priceCentavos: number;
  showCost: boolean;
  canEdit: boolean;
}) {
  const now = new Date();
  const undated = batches.filter((b) => b.expiryDate === null).length;
  const uncosted = batches.filter((b) => b.costCentavos === 0).length;

  /*
    THE UNIT COST OF THIS ITEM — which, like the expiry, is a property of the
    DELIVERY and not the product. Two deliveries of the same drug cost different
    money, and the sale line snapshots the cost of the batch it came out of so
    margin stays correct when the next delivery costs something else.

    So there is no single "unit cost" to print. There are two honest figures,
    and both are shown: what the stock ON THE SHELF averaged, weighted by how
    many of each batch remain, and what the LAST delivery cost — which is the
    number a buyer wants when deciding what to pay next time.
  */
  const units = batches.reduce((n, b) => n + b.quantity, 0);
  const value = batches.reduce((n, b) => n + b.quantity * b.costCentavos, 0);
  const averageCost = units > 0 ? Math.round(value / units) : 0;
  const lastDelivery = batches.reduce<ProductBatchRow | null>(
    (latest, b) => (!latest || b.receivedAt > latest.receivedAt ? b : latest),
    null,
  );
  const margin =
    priceCentavos > 0 && averageCost > 0
      ? Math.round(((priceCentavos - averageCost) / priceCentavos) * 100)
      : null;

  return (
    <div className="mt-5 border-t border-white/10 pt-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-white">Stock on hand, by batch</h3>
        <p className="text-xs text-slate-400">
          Expiry and cost belong to the delivery, not the product — two
          deliveries expire on different days and cost different money.
        </p>
      </div>

      {showCost && batches.length > 0 && (
        <dl className="mb-3 grid gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:grid-cols-4">
          <Figure label="Average unit cost" value={averageCost > 0 ? peso(averageCost) : "not set"} />
          <Figure
            label="Last delivery cost"
            value={
              lastDelivery && lastDelivery.costCentavos > 0
                ? peso(lastDelivery.costCentavos)
                : "not set"
            }
          />
          <Figure label="Selling price" value={peso(priceCentavos)} />
          <Figure
            label="Margin"
            value={margin === null ? "—" : `${margin}%`}
            tone={margin !== null && margin < 0 ? "bad" : "plain"}
          />
        </dl>
      )}

      {showCost && uncosted > 0 && (
        /*
          A cost of zero is "nobody said", not "free" — and it shows up as a
          100% margin on every report this stock touches, which is the kind of
          wrong number somebody makes a pricing decision on.
        */
        <p className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          {uncosted} batch{uncosted === 1 ? " has" : "es have"} no unit cost, so{" "}
          {uncosted === 1 ? "it counts" : "they count"} as a 100% margin on every report.
        </p>
      )}

      {batches.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-300">
          Nothing on the shelf. A batch and its expiry are created when you{" "}
          <Link href="/receiving" className="underline">
            receive stock
          </Link>
          .
        </p>
      ) : (
        <>
          {undated > 0 && (
            /*
              A CSV import with no expiry column creates real stock with no
              date, and undated stock never appears in the expiry alerts — it
              cannot, there is nothing to compare. Said out loud here, because
              this is the one screen where it can be fixed.
            */
            <p className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              {undated} batch{undated === 1 ? " has" : "es have"} no expiry date, so{" "}
              {undated === 1 ? "it" : "they"} will never appear in the expiry alerts.
              {canEdit && " Add the date from the box below."}
            </p>
          )}

          <ul className="space-y-2">
            {batches.map((b) => (
              <BatchRow
                key={b.id}
                batch={b}
                productName={productName}
                showCost={showCost}
                canEdit={canEdit}
                now={now}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  tone = "plain",
}: {
  label: string;
  value: string;
  tone?: "plain" | "bad";
}) {
  return (
    <div>
      <dt className="text-[0.7rem] uppercase tracking-wide text-slate-400">{label}</dt>
      <dd
        className={`mt-0.5 text-sm font-semibold tabular-nums ${
          tone === "bad" ? "text-rose-300" : "text-white"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function BatchRow({
  batch,
  productName,
  showCost,
  canEdit,
  now,
}: {
  batch: ProductBatchRow;
  productName: string;
  showCost: boolean;
  canEdit: boolean;
  now: Date;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(correctBatch, IDLE);

  const bucket = batch.expiryDate ? expiryBucket(batch.expiryDate, now) : null;
  const days = batch.expiryDate ? daysUntil(batch.expiryDate, now) : null;

  const tone =
    bucket === "expired"
      ? "border-rose-500/40 bg-rose-500/10"
      : bucket === "d30"
        ? "border-orange-500/40 bg-orange-500/10"
        : bucket === "d60"
          ? "border-amber-500/30 bg-amber-500/[0.07]"
          : "border-white/10 bg-white/[0.03]";

  return (
    <li className={`rounded-xl border p-3 ${tone}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <span className="font-mono text-xs text-slate-300">
          {batch.lotNumber ?? "no lot"}
        </span>

        {batch.expiryDate ? (
          <span className="tabular-nums text-white">
            exp {manilaExpiry(batch.expiryDate)}
            <span
              className={`ml-2 text-xs ${
                bucket === "expired" ? "text-rose-300" : "text-slate-400"
              }`}
            >
              {bucket === "expired"
                ? days === 0
                  ? "(expires today — not sellable)"
                  : `(expired ${Math.abs(days ?? 0)}d ago)`
                : `(in ${days}d)`}
            </span>
          </span>
        ) : (
          <span className="text-amber-300">no expiry date</span>
        )}

        <span className="tabular-nums text-slate-200">{batch.quantity} on hand</span>
        {showCost && (
          <span className="tabular-nums text-slate-400">@ {peso(batch.costCentavos)}</span>
        )}
        {batch.branchName && <span className="text-xs text-slate-400">{batch.branchName}</span>}
        <span className="text-xs text-slate-500">received {manilaDate(batch.receivedAt)}</span>

        {canEdit && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="ml-auto text-xs text-slate-300 underline hover:text-white"
          >
            {open ? "Close" : batch.expiryDate ? "Correct" : "Add expiry"}
          </button>
        )}
      </div>

      {open && canEdit && (
        <form action={action} className="mt-3 grid gap-2 sm:grid-cols-[10rem_1fr_9rem_auto]">
          <input type="hidden" name="batchId" value={batch.id} />
          <label className="block text-xs text-slate-400">
            Expiry
            <input
              type="date"
              name="expiryDate"
              defaultValue={
                batch.expiryDate ? batch.expiryDate.toISOString().slice(0, 10) : ""
              }
              className={`mt-1 ${FIELD}`}
            />
          </label>
          <label className="block text-xs text-slate-400">
            Lot number
            <input
              name="lotNumber"
              maxLength={60}
              defaultValue={batch.lotNumber ?? ""}
              placeholder="as printed on the box"
              className={`mt-1 ${FIELD}`}
            />
          </label>
          {showCost && (
            <label className="block text-xs text-slate-400">
              Unit cost ₱
              <input
                name="unitCost"
                type="text"
                inputMode="decimal"
                defaultValue={
                  batch.costCentavos > 0 ? (batch.costCentavos / 100).toFixed(2) : ""
                }
                placeholder="what this delivery cost"
                className={`mt-1 ${FIELD} text-right tabular-nums`}
              />
            </label>
          )}
          <button
            disabled={pending}
            className="self-end rounded-lg brand-gradient px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {pending ? "Saving…" : "Save"}
          </button>

          <p className="text-xs text-slate-500 sm:col-span-4">
            {/*
              Said on the form, not just in the code: somebody who came here to
              fix a count needs to be sent to the screen that keeps the ledger
              honest, not left looking for a quantity field.
            */}
            Dates and cost only. To change how many are on the shelf, use{" "}
            <Link href="/inventory" className="underline">
              an adjustment
            </Link>{" "}
            or{" "}
            <Link href="/stocktake" className="underline">
              a stocktake
            </Link>{" "}
            — those leave a record of why {productName} moved.
          </p>

          {state.status === "error" && (
            <p className="text-xs text-rose-300 sm:col-span-4">{state.message}</p>
          )}
          {state.status === "done" && (
            <p className="text-xs text-emerald-300 sm:col-span-4">{state.message}</p>
          )}
        </form>
      )}
    </li>
  );
}
