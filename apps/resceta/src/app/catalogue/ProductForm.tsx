"use client";

import { useActionState, useEffect } from "react";
import { saveProduct, toggleProduct, type CatalogueState } from "./actions";
import type { CatalogueEditRow, CategoryRow } from "@/server/pharmacy/catalogue";

const idle: CatalogueState = { status: "idle" };
const FIELD = "w-full rounded-lg border border-white/15 px-3 py-2 text-sm";
const LABEL = "mb-1 block text-xs font-medium text-slate-300";

/**
 * One product's fields.
 *
 * Used for both adding and editing — the only difference is a hidden `id` and
 * what the button says, and two forms that must agree about sixteen columns is
 * one form too many.
 *
 * PESOS IN, CENTAVOS STORED. The column is centavos; nobody types centavos.
 * The conversion is in `product-input.ts` so it is tested, and it rounds rather
 * than truncating — 19.99 is 1998.9999… in floating point, and truncation
 * would price it at ₱19.98 for the rest of its life.
 */
export function ProductForm({
  product,
  categories,
  suppliers = [],
  onDone,
}: {
  /** Absent when adding. */
  product?: CatalogueEditRow;
  categories: CategoryRow[];
  /** For the opening-stock section. Empty is fine — the supplier is optional. */
  suppliers?: { id: string; name: string }[];
  onDone?: () => void;
}) {
  const [state, action, pending] = useActionState(saveProduct, idle);

  /*
    THE PARENT CLOSES THE ROW ON SUCCESS, after a beat.

    In an effect, not during render: calling the parent's setState while
    rendering this component is a side effect in a render pass, and React is
    entitled to run that twice.

    The delay is deliberate. Closing the instant the action resolves takes the
    "Saved." away before anybody reads it, and a form that vanishes on success
    reads as a form that crashed.
  */
  useEffect(() => {
    if (state.status !== "done" || !onDone) return;
    const t = setTimeout(onDone, 900);
    return () => clearTimeout(t);
  }, [state, onDone]);

  return (
    <form action={action} className="space-y-4">
      {product && <input type="hidden" name="id" value={product.id} />}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={LABEL}>Name</label>
          <input name="name" required maxLength={200} defaultValue={product?.name ?? ""} className={FIELD} />
        </div>
        <div>
          <label className={LABEL}>Generic name</label>
          <input name="genericName" maxLength={200} defaultValue={product?.genericName ?? ""} className={FIELD} />
        </div>
        <div>
          <label className={LABEL}>Category</label>
          <select name="categoryId" defaultValue={product?.categoryId ?? ""} className={FIELD}>
            <option value="">Uncategorised</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL}>Form</label>
          <input name="form" maxLength={60} placeholder="tablet, syrup, capsule" defaultValue={product?.form ?? ""} className={FIELD} />
        </div>
        <div>
          <label className={LABEL}>Strength</label>
          <input name="strength" maxLength={60} placeholder="500mg" defaultValue={product?.strength ?? ""} className={FIELD} />
        </div>
        <div>
          <label className={LABEL}>Sold by</label>
          <input name="unit" maxLength={30} placeholder="piece" defaultValue={product?.unit ?? "piece"} className={FIELD} />
        </div>
        <div>
          <label className={LABEL}>Price (₱)</label>
          <input
            name="price"
            required
            inputMode="decimal"
            defaultValue={product ? (product.priceCentavos / 100).toFixed(2) : ""}
            className={FIELD}
          />
        </div>
        <div>
          <label className={LABEL}>SKU</label>
          <input name="sku" maxLength={60} defaultValue={product?.sku ?? ""} className={FIELD} />
        </div>
        <div>
          <label className={LABEL}>Barcode</label>
          <input name="barcode" maxLength={60} defaultValue={product?.barcode ?? ""} className={FIELD} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.06] p-3">
          <label className={LABEL}>Warn me at</label>
          <input
            name="reorderPoint"
            required
            inputMode="numeric"
            defaultValue={product ? String(product.reorderPoint) : "0"}
            className={FIELD}
          />
          {/*
            THIS IS WHY LOW STOCK NEVER FIRED. The column defaults to 0 and
            nothing could set it, so `onHand <= reorderPoint` only triggered at
            zero — a post-mortem, not a warning.
          */}
          <p className="mt-1 text-xs text-slate-500">
            The dashboard flags this item once stock falls to this number. 0 means it only warns
            you when you have run out.
          </p>
        </div>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              name="requiresPrescription"
              defaultChecked={product?.requiresPrescription ?? false}
              className="mt-0.5 h-4 w-4"
            />
            <span>
              <span className="block text-sm font-medium text-amber-200">
                Prescription-only
              </span>
              {/*
                Not a preference. The counter refuses a cart containing one of
                these unless a pharmacist is signed in, and asks for the
                prescription reference before it will complete the sale.
              */}
              <span className="mt-1 block text-xs text-amber-300">
                Only a pharmacist or the owner can complete a sale containing this item, and the
                prescription has to be recorded first.
              </span>
            </span>
          </label>
        </div>
      </div>

      {/*
        ── OPENING STOCK, ONLY WHEN ADDING ────────────────────────────────

        REPORTED — "when i added a new product, there really is no expiration
        date."

        There is none ON a product and there should not be. But a product added
        with boxes already on the shelf has a delivery behind it, and that
        delivery has a date, a lot and a cost. Sending somebody to Receive stock
        to find the product they just made is how the date gets skipped — and
        undated stock never appears in the expiry alerts at all.

        NOT SHOWN WHEN EDITING. Changing a price must not be able to conjure a
        batch; an existing product's stock is corrected on the batch panel
        below, where each delivery has its own row.
      */}
      {!product && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <p className="text-sm font-semibold text-white">Opening stock (optional)</p>
          <p className="mt-0.5 text-xs text-slate-400">
            What is already on the shelf. It becomes this product&rsquo;s first batch,
            with a stock movement behind it — exactly like a delivery received
            tomorrow.
          </p>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className={LABEL}>Supplier</label>
              <select name="openingSupplier" defaultValue="" className={FIELD}>
                <option value="">— none —</option>
                {suppliers.map((sup) => (
                  <option key={sup.id} value={sup.id}>
                    {sup.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={LABEL}>Quantity</label>
              <input
                name="openingQuantity"
                inputMode="numeric"
                placeholder="0"
                className={FIELD}
              />
            </div>
            <div>
              <label className={LABEL}>Unit cost (₱)</label>
              {/*
                Required as soon as there is a quantity, and refused if missing:
                a batch at zero cost reads as a 100% margin on every report it
                ever touches, and whoever types an opening quantity is holding
                the delivery note that has the cost on it.
              */}
              <input
                name="openingCost"
                inputMode="decimal"
                placeholder="what it cost you"
                className={FIELD}
              />
            </div>
            <div>
              <label className={LABEL}>Batch / lot number</label>
              <input
                name="openingLot"
                maxLength={60}
                placeholder="optional — as printed on the box"
                className={FIELD}
              />
            </div>
            <div className="sm:col-span-2">
              <label className={LABEL}>Expiry date</label>
              <input type="date" name="openingExpiry" className={FIELD} />
              <p className="mt-1 text-xs text-slate-500">
                Stock with no expiry date never appears in the expiry alerts — there
                is nothing to compare it against.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          disabled={pending}
          className="rounded-lg brand-gradient px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {pending ? "Saving…" : product ? "Save changes" : "Add to catalogue"}
        </button>
        {onDone && (
          <button
            type="button"
            onClick={onDone}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-300"
          >
            Cancel
          </button>
        )}
        {state.status === "error" && <p className="text-sm text-red-300">{state.message}</p>}
        {state.status === "done" && <p className="text-sm text-green-700">{state.message}</p>}
      </div>
    </form>
  );
}

/**
 * Archive, and put back.
 *
 * Never a delete. Batches, stock movements and sale lines point at this row —
 * removing it would orphan a receipt already handed to a customer.
 */
export function ArchiveButton({ product }: { product: CatalogueEditRow }) {
  const [state, action, pending] = useActionState(toggleProduct, idle);

  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={product.id} />
      <input type="hidden" name="active" value={product.isActive ? "false" : "true"} />
      <button
        disabled={pending}
        className="text-xs font-medium text-slate-500 underline hover:text-slate-800 disabled:opacity-50"
        // Said here rather than in a confirm dialog: stock on the shelf is the
        // reason to hesitate, and the number is the argument.
        title={
          product.isActive && product.onHand > 0
            ? `${product.onHand} still on hand — archiving takes it off the counter, not off the shelf.`
            : undefined
        }
      >
        {pending ? "…" : product.isActive ? "Archive" : "Restore"}
      </button>
      {state.status === "error" && <span className="ml-2 text-xs text-red-300">{state.message}</span>}
    </form>
  );
}
