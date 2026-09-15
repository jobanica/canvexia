"use client";

import { useActionState, useId } from "react";
import { SOURCES, SOURCE_LABELS } from "@/lib/partners/prospect-input";
import { addProspectAction, type ProspectState } from "@/server/partners/prospect-actions";

const initial: ProspectState = { status: "idle" };

/** Add a business a partner just walked into. */
export function ProspectForm({
  products,
  seats,
}: {
  products: { id: string; name: string }[];
  seats: { id: string; name: string | null; email: string }[];
}) {
  const [state, action, pending] = useActionState(addProspectAction, initial);
  const uid = useId();
  const field =
    "min-h-[44px] w-full rounded-lg border border-brand-ink/15 bg-white px-3 text-sm outline-none focus:border-brand-ink";

  return (
    <form action={action} className="rounded-tile border border-brand-ink/10 bg-white p-5">
      <p className="text-sm font-semibold">Add a prospect</p>
      <p className="mt-0.5 text-xs text-brand-ink/50">
        A name and a product is enough. Everything else can wait until you have it.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2">
          <span className="text-xs font-semibold text-brand-ink/60">Business name</span>
          <input name="businessName" required maxLength={160} className={`${field} mt-1`} />
        </label>

        <label>
          <span className="text-xs font-semibold text-brand-ink/60">Product</span>
          <select name="productId" required defaultValue="" className={`${field} mt-1`}>
            <option value="" disabled>
              Choose one
            </option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="text-xs font-semibold text-brand-ink/60">Owner</span>
          <input name="ownerName" maxLength={120} className={`${field} mt-1`} />
        </label>

        <label>
          <span className="text-xs font-semibold text-brand-ink/60">Mobile</span>
          <input
            name="mobile"
            type="tel"
            inputMode="tel"
            placeholder="0917 123 4567"
            className={`${field} mt-1`}
          />
        </label>

        <label>
          <span className="text-xs font-semibold text-brand-ink/60">Address</span>
          <input name="address" maxLength={300} className={`${field} mt-1`} />
        </label>

        <label>
          <span className="text-xs font-semibold text-brand-ink/60">How you found them</span>
          <select name="source" defaultValue="walk_in" className={`${field} mt-1`}>
            {SOURCES.filter((s) => s !== "lead_form").map((s) => (
              <option key={s} value={s}>
                {SOURCE_LABELS[s]}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span className="text-xs font-semibold text-brand-ink/60">Follow up on</span>
          <input name="nextFollowUpAt" type="date" className={`${field} mt-1`} />
        </label>

        {seats.length > 1 && (
          <label>
            <span className="text-xs font-semibold text-brand-ink/60">Assign to</span>
            <select name="assignedToId" defaultValue="" className={`${field} mt-1`}>
              <option value="">Nobody yet</option>
              {seats.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name ?? s.email}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="sm:col-span-2">
          <span className="text-xs font-semibold text-brand-ink/60">Notes</span>
          <textarea
            name="notes"
            rows={2}
            maxLength={2000}
            id={`${uid}-notes`}
            className="mt-1 w-full rounded-lg border border-brand-ink/15 bg-white p-3 text-sm outline-none focus:border-brand-ink"
          />
        </label>
      </div>

      {state.status === "error" && (
        <p role="alert" className="mt-3 rounded-lg bg-guava/10 px-3 py-2 text-sm text-guava">
          {state.message}
        </p>
      )}
      {state.status === "done" && (
        <p className="mt-3 text-sm text-brand-primary">{state.message}</p>
      )}

      <button
        disabled={pending}
        className="mt-4 min-h-[44px] rounded-full bg-brand-ink px-6 text-sm font-semibold text-white disabled:opacity-60"
      >
        {pending ? "Adding…" : "Add prospect"}
      </button>
    </form>
  );
}
