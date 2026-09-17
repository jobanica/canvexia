"use client";

import { useActionState } from "react";
import { recordCounts, approveCount, abandonCount, type StocktakeState } from "../actions";
import { peso } from "@/lib/money";

const IDLE: StocktakeState = { status: "idle" };

export interface SheetLine {
  id: string;
  name: string;
  genericName: string | null;
  unit: string;
  systemQty: number;
  countedQty: number | null;
  unitCostCentavos: number;
}

/**
 * The count sheet.
 *
 * A BLANK BOX MEANS NOT COUNTED and is submitted as null. Not zero — approving
 * a half-finished sheet must not write every untouched product down to nothing,
 * which is the single most destructive thing this screen could do. The server
 * enforces the same rule; this is just the half the counter can see.
 *
 * The variance is shown live as it is typed, because the moment somebody wants
 * it is the moment they have just counted the shelf and want to know whether to
 * count it again.
 */
export function CountSheet({
  stocktakeId,
  lines,
  canApprove,
  closed,
}: {
  stocktakeId: string;
  lines: SheetLine[];
  canApprove: boolean;
  closed: boolean;
}) {
  const [saved, saveAction, saving] = useActionState(recordCounts, IDLE);
  const [approved, approveAction, approving] = useActionState(approveCount, IDLE);
  const [abandoned, abandonAction, abandoning] = useActionState(abandonCount, IDLE);

  const counted = lines.filter((l) => l.countedQty !== null);
  const variance = counted.reduce((t, l) => t + (l.countedQty! - l.systemQty) * l.unitCostCentavos, 0);
  const short = counted.filter((l) => l.countedQty! < l.systemQty).length;
  const over = counted.filter((l) => l.countedQty! > l.systemQty).length;

  return (
    <>
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Stat label="Lines" value={`${counted.length} / ${lines.length}`} />
        <Stat label="Short" value={String(short)} tone={short > 0 ? "red" : undefined} />
        <Stat label="Over" value={String(over)} tone={over > 0 ? "amber" : undefined} />
        <Stat
          label="Variance at cost"
          value={peso(variance)}
          tone={variance < 0 ? "red" : variance > 0 ? "amber" : undefined}
        />
      </div>

      <form action={saveAction}>
        <input type="hidden" name="stocktakeId" value={stocktakeId} />
        <div className="overflow-x-auto">
          <table className="w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl text-sm">
            <thead className="bg-white/[0.06] text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Item</th>
                <th className="px-4 py-2 text-right font-medium">System says</th>
                <th className="px-4 py-2 text-right font-medium">Counted</th>
                <th className="px-4 py-2 text-right font-medium">Difference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {lines.map((l) => {
                const diff = l.countedQty === null ? null : l.countedQty - l.systemQty;
                return (
                  <tr key={l.id}>
                    <td className="px-4 py-2">
                      <input type="hidden" name="itemId" value={l.id} />
                      {l.name}
                      {l.genericName && (
                        <span className="ml-2 text-xs text-slate-500">{l.genericName}</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-slate-500">
                      {l.systemQty} {l.unit}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input
                        name="countedQty"
                        type="number"
                        min={0}
                        step={1}
                        disabled={closed}
                        defaultValue={l.countedQty ?? ""}
                        placeholder="—"
                        className="w-24 rounded-xl border border-white/10 px-2 py-1 text-right text-sm disabled:bg-white/[0.06]"
                      />
                    </td>
                    <td
                      className={`px-4 py-2 text-right tabular-nums ${
                        diff === null
                          ? "text-slate-300"
                          : diff < 0
                            ? "font-semibold text-red-300"
                            : diff > 0
                              ? "font-semibold text-amber-300"
                              : "text-slate-500"
                      }`}
                    >
                      {diff === null ? "not counted" : diff > 0 ? `+${diff}` : diff}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {!closed && (
          <div className="mt-4 flex items-center gap-3">
            <button
              disabled={saving}
              className="rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save counts"}
            </button>
            {saved.status === "error" && <span className="text-sm text-red-300">{saved.message}</span>}
            {saved.status === "done" && (
              <span className="text-sm text-emerald-300">{saved.message}</span>
            )}
          </div>
        )}
      </form>

      {!closed && (
        <div className="mt-8 rounded-xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-5">
          <p className="text-sm font-semibold">Approve this count</p>
          <p className="mt-1 text-sm text-slate-500">
            This is where stock moves. Lines you have not counted are left alone.
            A shortfall comes off the soonest-expiring batches; anything found
            goes into a new undated batch, which is dispensed last.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-4">
            {canApprove ? (
              <form action={approveAction}>
                <input type="hidden" name="stocktakeId" value={stocktakeId} />
                <button
                  disabled={approving || counted.length === 0}
                  className="rounded-lg brand-gradient px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
                >
                  {approving ? "Approving…" : `Approve and adjust ${short + over} products`}
                </button>
              </form>
            ) : (
              <p className="text-sm text-slate-500">
                A manager or the owner approves the count. Save your numbers and
                ask them to sign it off.
              </p>
            )}

            <form action={abandonAction}>
              <input type="hidden" name="stocktakeId" value={stocktakeId} />
              <button
                disabled={abandoning}
                className="text-sm text-slate-500 underline hover:text-red-300 disabled:opacity-40"
              >
                {abandoning ? "Cancelling…" : "Cancel this count"}
              </button>
            </form>
          </div>

          {approved.status === "error" && (
            <p className="mt-2 text-sm text-red-300">{approved.message}</p>
          )}
          {approved.status === "done" && (
            <p className="mt-2 text-sm text-emerald-300">{approved.message}</p>
          )}
          {abandoned.status === "error" && (
            <p className="mt-2 text-sm text-red-300">{abandoned.message}</p>
          )}
        </div>
      )}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "red" | "amber" }) {
  const cls =
    tone === "red"
      ? "border-red-500/30 bg-red-500/10 text-red-200"
      : tone === "amber"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
        : "border-white/10 bg-white/[0.04] backdrop-blur-xl text-white";
  return (
    <div className={`rounded-xl border p-4 ${cls}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
