"use client";

import { useState } from "react";
import { SupplierForm, SupplierDelete } from "./SupplierForm";
import type { SupplierRow } from "@/server/pharmacy/suppliers";
import { peso, manilaDate } from "@/lib/money";

/**
 * The book: the list, and whichever row is open for editing.
 *
 * WHY THE FORM IS KEYED. Picking a different supplier has to rebuild the
 * inputs — React keeps uncontrolled `defaultValue` fields as they are when a
 * component merely re-renders, so without the key the form would show the
 * previous supplier's phone number under the new supplier's name, and saving
 * would write it.
 *
 * The add form is keyed on the row count, so a successful add clears the
 * fields ready for the next one. That discards its `useActionState` — which is
 * safe HERE and is not a licence to do it elsewhere: nothing one-shot lives in
 * that state, and the new row appearing in the table below is the confirmation
 * the message would have been. (Where a server action returns something that
 * exists nowhere else — a generated password — unmounting it destroys the only
 * copy. That is a real bug this codebase has shipped once already.)
 */
export function SupplierBook({ rows, canEdit }: { rows: SupplierRow[]; canEdit: boolean }) {
  const [editing, setEditing] = useState<SupplierRow | null>(null);

  return (
    <>
      {canEdit && (
        <div className="mb-8">
          <SupplierForm
            key={editing ? `edit-${editing.id}` : `add-${rows.length}`}
            editing={editing}
            onDone={() => setEditing(null)}
          />
        </div>
      )}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 text-sm text-slate-300">
          No suppliers yet. Add the distributor you buy from, and it will be
          offered when you receive a delivery.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl text-sm">
            <thead className="bg-white/[0.06] text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Supplier</th>
                <th className="px-4 py-2 font-medium">Contact</th>
                <th className="px-4 py-2 text-right font-medium">Deliveries</th>
                <th className="px-4 py-2 font-medium">Last delivery</th>
                <th className="px-4 py-2 text-right font-medium">On shelf</th>
                {canEdit && <th className="px-4 py-2" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {rows.map((s) => (
                <tr key={s.id} className={editing?.id === s.id ? "bg-white/[0.06]" : undefined}>
                  <td className="px-4 py-2">
                    <span className="font-medium">{s.name}</span>
                    {s.address && <p className="text-xs text-slate-500">{s.address}</p>}
                    {s.notes && <p className="mt-0.5 text-xs text-slate-500">{s.notes}</p>}
                  </td>
                  <td className="px-4 py-2 text-slate-300">
                    {s.contactPerson ?? "—"}
                    {/*
                      A tel: link, because the whole reason this screen exists
                      is somebody standing in the shop needing to re-order and
                      having only a name.
                    */}
                    {s.phone && (
                      <p>
                        <a href={`tel:${s.phone}`} className="text-xs underline">
                          {s.phone}
                        </a>
                      </p>
                    )}
                    {s.email && <p className="text-xs text-slate-500">{s.email}</p>}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{s.deliveries}</td>
                  <td className="px-4 py-2 text-slate-500">
                    {s.lastDeliveryAt ? manilaDate(s.lastDeliveryAt) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {peso(s.onHandValueCentavos)}
                  </td>
                  {canEdit && (
                    <td className="px-4 py-2 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <button
                          onClick={() => setEditing(s)}
                          className="text-xs text-slate-500 underline"
                        >
                          Edit
                        </button>
                        {/*
                          Only offered where it can succeed. A supplier with
                          deliveries on record cannot be removed — the batch has
                          to keep saying where it came from — and the server
                          refuses it either way.
                        */}
                        {s.deliveries === 0 && <SupplierDelete supplier={s} />}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
