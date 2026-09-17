"use client";

import Link from "next/link";
import { useState } from "react";
import { CustomerForm } from "./CustomerForm";
import type { CustomerRow } from "@/server/pharmacy/customers";
import { peso, manilaDate } from "@/lib/money";

/**
 * The customer list, with an add form and a client-side filter.
 *
 * FILTERED IN THE BROWSER, not by round-tripping the server. Two hundred rows
 * is the cap on the query and a trivial amount of markup; making the cashier
 * wait for a network call to narrow a list they can already see is worse on
 * every connection, and unusable on a bad one.
 */
export function CustomerBook({ rows, loyaltyOn }: { rows: CustomerRow[]; loyaltyOn: boolean }) {
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);

  const needle = q.trim().toLowerCase();
  const shown = needle
    ? rows.filter(
        (c) =>
          c.name.toLowerCase().includes(needle) ||
          (c.phone ?? "").includes(needle) ||
          (c.email ?? "").toLowerCase().includes(needle),
      )
    : rows;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name, mobile or email"
          className="w-full max-w-sm rounded-xl border border-white/10 px-3 py-2 text-sm"
        />
        <button
          onClick={() => setAdding((v) => !v)}
          className="rounded-lg brand-gradient px-4 py-2 text-sm font-semibold text-white"
        >
          {adding ? "Close" : "Add a customer"}
        </button>
      </div>

      {adding && (
        <div className="mb-6">
          {/* Keyed on the row count so a successful add clears the fields for
              the next one — the new row appearing below is the confirmation. */}
          <CustomerForm key={`add-${rows.length}`} onDone={() => setAdding(false)} />
        </div>
      )}

      {shown.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-4 text-sm text-slate-300">
          {rows.length === 0
            ? "No customers yet. Add one at the counter, or from here."
            : "Nobody matches that search."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl text-sm">
            <thead className="bg-white/[0.06] text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Customer</th>
                <th className="px-4 py-2 font-medium">Mobile</th>
                <th className="px-4 py-2 text-right font-medium">Purchases</th>
                <th className="px-4 py-2 text-right font-medium">Spent</th>
                <th className="px-4 py-2 font-medium">Last seen</th>
                {loyaltyOn && <th className="px-4 py-2 text-right font-medium">Points</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {shown.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2">
                    <Link href={`/customers/${c.id}`} className="font-medium underline">
                      {c.name}
                    </Link>
                    {c.notes && <p className="text-xs text-slate-500">{c.notes}</p>}
                  </td>
                  <td className="px-4 py-2 text-slate-300">
                    {c.phone ? (
                      <a href={`tel:${c.phone}`} className="underline">
                        {c.phone}
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{c.purchases}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{peso(c.spentCentavos)}</td>
                  <td className="px-4 py-2 text-slate-500">
                    {c.lastPurchaseAt ? manilaDate(c.lastPurchaseAt) : "—"}
                  </td>
                  {loyaltyOn && (
                    <td className="px-4 py-2 text-right tabular-nums">{c.pointsBalance}</td>
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
