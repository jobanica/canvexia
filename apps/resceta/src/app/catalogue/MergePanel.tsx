"use client";

import { useActionState, useState } from "react";
import { mergeDuplicates, type ToolState } from "./tools-actions";
import { Panel } from "./ImportPanel";
import type { DuplicateGroup } from "@/lib/pharmacy/duplicates";
import { peso } from "@/lib/money";

const IDLE: ToolState = { status: "idle" };

const WHY: Record<DuplicateGroup["reason"], string> = {
  barcode: "same barcode",
  sku: "same SKU",
  name: "same name, strength and form",
};

/**
 * Merging a product that was entered twice.
 *
 * ONE GROUP AT A TIME, AND A HUMAN PICKS THE SURVIVOR. The reference version of
 * this is a single "merge all duplicates" button that runs a database function;
 * that is faster and it is the wrong shape for medicine. A false match here
 * folds two different strengths of the same molecule into one product, and the
 * next person to dispense it reaches for the wrong box. So the app suggests and
 * a person decides.
 *
 * The suggested keeper is the one with stock, then the one with an identifier,
 * then the oldest — keeping the empty one means moving every batch for nothing.
 */
export function MergePanel({
  groups,
  onClose,
}: {
  groups: DuplicateGroup[];
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(mergeDuplicates, IDLE);
  const [openGroup, setOpenGroup] = useState(0);
  const [keepId, setKeepId] = useState<string | null>(null);

  if (state.status === "done") {
    return (
      <Panel title="Merged" onClose={onClose}>
        <p className="text-sm text-emerald-300">{state.message}</p>
        <p className="mt-2 text-xs text-slate-400">
          Reload the page to see the remaining duplicates.
        </p>
      </Panel>
    );
  }

  if (groups.length === 0) {
    return (
      <Panel title="Duplicates" onClose={onClose}>
        <p className="text-sm text-slate-300">
          Nothing looks duplicated. Products are matched on an exact barcode, an
          exact SKU, or the same name, strength and form once spacing and
          punctuation are ignored — never on a fuzzy resemblance, because folding
          two strengths of one molecule together is a dispensing error rather
          than a tidy-up.
        </p>
      </Panel>
    );
  }

  const group = groups[Math.min(openGroup, groups.length - 1)]!;
  const keeper = keepId ?? group.members[0]!.id;

  return (
    <Panel title={`${groups.length} possible duplicate${groups.length === 1 ? "" : "s"}`} onClose={onClose}>
      {groups.length > 1 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {groups.map((g, i) => (
            <button
              key={g.key}
              onClick={() => {
                setOpenGroup(i);
                setKeepId(null);
              }}
              className={`rounded-full px-3 py-1 text-xs ${
                i === openGroup
                  ? "brand-gradient text-white"
                  : "border border-white/15 text-slate-300"
              }`}
            >
              {g.members[0]!.name}
            </button>
          ))}
        </div>
      )}

      <form action={action}>
        <p className="text-sm text-slate-300">
          Matched on <strong className="text-white">{WHY[group.reason]}</strong>. Choose the one to
          keep — everything else moves onto it: batches, the stock ledger, sale
          lines, purchase orders, write-offs and transfers. The others are
          archived, never deleted, so old receipts still read.
        </p>

        <div className="mt-3 overflow-hidden rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.06] text-left text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-3 py-2 font-medium">Keep</th>
                <th className="px-3 py-2 font-medium">Product</th>
                <th className="px-3 py-2 font-medium">SKU / barcode</th>
                <th className="px-3 py-2 text-right font-medium">Price</th>
                <th className="px-3 py-2 text-right font-medium">On hand</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {group.members.map((m) => (
                <tr key={m.id} className={m.id === keeper ? "bg-emerald-500/10" : undefined}>
                  <td className="px-3 py-2">
                    <input
                      type="radio"
                      name="keepId"
                      value={m.id}
                      checked={m.id === keeper}
                      onChange={() => setKeepId(m.id)}
                    />
                    {/* Every non-keeper is submitted as a merge target. */}
                    {m.id !== keeper && <input type="hidden" name="mergeId" value={m.id} />}
                  </td>
                  <td className="px-3 py-2">
                    {m.name}
                    <p className="text-xs text-slate-400">
                      {[m.genericName, m.strength, m.form].filter(Boolean).join(" · ") || "—"}
                      {!m.isActive && " · archived"}
                    </p>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-400">
                    {m.sku ?? "—"} / {m.barcode ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{peso(m.priceCentavos)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{m.onHand}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            disabled={pending}
            className="brand-gradient rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {pending
              ? "Merging…"
              : `Merge ${group.members.length - 1} into this one`}
          </button>
          {state.status === "error" && <span className="text-sm text-red-300">{state.message}</span>}
        </div>
      </form>
    </Panel>
  );
}
