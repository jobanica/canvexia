"use client";

import { useCallback, useEffect, useState } from "react";
import { getShiftSummary, type ShiftSummary } from "@/server/orders/shift-summary";
import { printShiftSummaryTicket } from "@/server/printing/print";
import { endMyShift } from "@/server/orders/shift-actions";
import { signOut } from "@/app/(platform)/login/actions";
import { runReportDispatch } from "@/lib/print/run-dispatch";
import { formatPeso } from "@/lib/money";
import { manilaTime } from "@/lib/time/manila";
import { useOrdersRefresh } from "@/lib/realtime/useOrdersRefresh";

/**
 * End-of-shift review for THIS cashier's shift: what they took, what came out
 * of their drawer, and what should be in it.
 *
 * Scoped to the shift rather than the calendar day, so the second cashier on a
 * double shift doesn't open this and find the first cashier's sales already
 * counted. "End shift" prints the Z-report, closes the shift, and signs them
 * out — the next cashier starts from zero.
 */
export function ShiftSummaryModal({
  restaurantId,
  onClose,
}: {
  restaurantId: string;
  onClose: () => void;
}) {
  const [s, setS] = useState<ShiftSummary | null | "loading">("loading");
  const [stale, setStale] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [printMsg, setPrintMsg] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const load = useCallback(async () => {
    try {
      const next = await getShiftSummary();
      // Flag a figure that moved while this was open, so a cashier who has
      // already started counting the drawer knows to look again rather than
      // silently working from a number that changed under them.
      setS((prev) => {
        if (prev !== "loading" && prev && next && prev.gross !== next.gross) setStale(true);
        return next;
      });
    } catch {
      setS(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Another till settling a bill changes this cashier's day too (the
  // today/all-shifts block), and their own second window changes their drawer.
  useOrdersRefresh(restaurantId, () => void load());

  /**
   * Prints on the RECEIPT PRINTER, through the same dispatch a bill or receipt
   * uses. The old button was a link to a printable page that called
   * window.print() — which does nothing on a network, cloud or Bluetooth
   * printer, i.e. on most tills. The page is still the fallback for the
   * OS-dialog / AirPrint setups where it genuinely is the right answer.
   */
  async function handlePrint() {
    setPrinting(true);
    setPrintMsg(null);
    try {
      // The Z-report is built server-side from a live query, so the paper is
      // right even when the screen has drifted. Refreshing here just stops the
      // two disagreeing in front of the cashier who is about to sign the total.
      await load();
      const res = await printShiftSummaryTicket();
      const m = await runReportDispatch(res, "/cashier/shift-summary");
      if (m) setPrintMsg(m);
    } catch (e) {
      setPrintMsg(e instanceof Error ? e.message : "Print failed.");
    } finally {
      setPrinting(false);
    }
  }

  /**
   * Print → close → sign out, in that order.
   *
   * Printing FIRST matters: once the shift is closed its totals are no longer
   * "current", so a cashier who closed before printing would have to go and ask
   * the owner for their own numbers. A print failure doesn't block the close —
   * the report is still on screen, and the shift has to end either way.
   */
  async function handleEndShift() {
    setEnding(true);
    try {
      await handlePrint();
    } catch {
      /* keep going — see above */
    }
    const res = await endMyShift();
    if (res?.error) {
      setPrintMsg(res.error);
      setEnding(false);
      return;
    }
    await signOut();
  }

  const row = "flex justify-between py-1 text-sm";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-tile bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold">End-of-shift summary</h2>
          <button onClick={onClose} className="text-plum-ink/40 hover:text-plum-ink">✕</button>
        </div>

        {/* A cashier who has already counted the drawer against an older figure
            needs telling, not a number that quietly changes while they look. */}
        {stale && (
          <p className="mb-2 rounded-lg bg-mango/15 px-3 py-2 text-xs font-semibold text-plum-ink">
            ↻ Updated — another payment came in while this was open.
          </p>
        )}

        {s === "loading" ? (
          <p className="py-6 text-center text-sm text-plum-ink/50">Loading…</p>
        ) : s === null ? (
          <p className="py-6 text-center text-sm text-plum-ink/50">Couldn&apos;t load the summary.</p>
        ) : (
          <div className="overflow-y-auto">
            {/* Whose shift, and since when — the two facts that tell a cashier
                these numbers are theirs and not the whole day's. */}
            <div className="rounded-lg bg-cream/70 px-3 py-2">
              <p className="text-sm font-semibold">{s.cashier}</p>
              <p className="text-xs text-plum-ink/55">
                {s.openedAt
                  ? `Shift started ${manilaTime(s.openedAt)}`
                  : "Today's totals for the whole restaurant"}
              </p>
            </div>
            {!s.shiftId && (
              <p className="mt-2 rounded-lg bg-mango/10 px-3 py-2 text-xs text-plum-ink/70">
                Per-cashier shifts aren&apos;t switched on yet, so this shows the whole
                restaurant&apos;s day. Run <span className="font-mono">add-cashier-shifts.sql</span>.
              </p>
            )}

            <div className="mt-3 rounded-lg border border-plum-ink/10 p-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-plum-ink/40">Sales</p>
              <div className={row}><span className="text-plum-ink/60">Orders paid</span><span className="font-semibold">{s.orderCount}</span></div>
              {s.byMethod.map((m) => (
                <div key={m.label} className={row}>
                  <span className="text-plum-ink/60">{m.label} ({m.count})</span>
                  <span>{formatPeso(m.amount)}</span>
                </div>
              ))}
              {s.discounts > 0 && (
                <div className={row}><span className="text-plum-ink/60">Discounts</span><span className="text-guava">−{formatPeso(s.discounts)}</span></div>
              )}
              <div className={`${row} border-t border-plum-ink/10 font-bold`}><span>Gross sales</span><span>{formatPeso(s.gross)}</span></div>
            </div>

            <div className="mt-3 rounded-lg border border-plum-ink/10 p-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-plum-ink/40">Expenses</p>
              {s.expenses.length === 0 ? (
                <p className="py-1 text-sm text-plum-ink/50">None recorded today.</p>
              ) : (
                s.expenses.map((e, i) => (
                  <div key={i} className={row}>
                    <span className="text-plum-ink/60">{e.category}{e.note ? ` · ${e.note}` : ""}</span>
                    <span>{formatPeso(e.amount)}</span>
                  </div>
                ))
              )}
              <div className={`${row} border-t border-plum-ink/10 font-bold`}><span>Total expenses</span><span>{formatPeso(s.expensesTotal)}</span></div>
            </div>

            {(s.cashOutTotal > 0 || s.cashCollected > 0) && (
              <div className="mt-3 rounded-lg border border-plum-ink/10 p-3">
                <p className="text-[11px] font-bold uppercase tracking-widest text-plum-ink/40">Cash drawer</p>
                <div className={row}><span className="text-plum-ink/60">Cash collected</span><span>{formatPeso(s.cashCollected)}</span></div>
                {s.cashOuts.map((c, i) => (
                  <div key={i} className={row}>
                    <span className="text-plum-ink/60">Cash out{c.note ? ` · ${c.note}` : ""}</span>
                    <span className="text-guava">−{formatPeso(c.amount)}</span>
                  </div>
                ))}
                <div className={`${row} border-t border-plum-ink/10 font-bold`}><span>Expected in drawer</span><span>{formatPeso(s.expectedCash)}</span></div>
              </div>
            )}

            <div className="mt-3 flex items-center justify-between rounded-lg bg-brand-primary/5 p-3">
              <span className="font-heading font-bold text-brand-primary">Net</span>
              <span className="font-heading text-lg font-extrabold text-brand-primary">{formatPeso(s.net)}</span>
            </div>

            {/* Today across every shift. Shown when it differs from this
                shift's own figure, so a cashier who opened at 8 PM can see
                that the morning's trade exists and simply wasn't theirs —
                rather than reading ₱0.00 and assuming the report is broken. */}
            {s.dayGross !== s.gross && (
              <div className="mt-2 rounded-lg border border-plum-ink/10 p-3">
                <p className="text-[11px] font-bold uppercase tracking-widest text-plum-ink/40">
                  Today · all shifts
                </p>
                <div className={row}>
                  <span className="text-plum-ink/60">Orders paid</span>
                  <span className="font-semibold">{s.dayOrderCount}</span>
                </div>
                <div className={row}>
                  <span className="text-plum-ink/60">Counter sales</span>
                  <span>{formatPeso(s.dayGross)}</span>
                </div>
                <p className="pt-1 text-xs text-plum-ink/45">
                  For reference — not part of your drawer.
                </p>
              </div>
            )}

            <div className="mt-4 space-y-2">
              <button
                onClick={handlePrint}
                disabled={printing || ending}
                className="w-full rounded-full px-4 py-2.5 text-center text-sm font-semibold btn-brand disabled:opacity-60"
              >
                {printing && !ending ? "Printing…" : "🖨 Print summary"}
              </button>

              {s.shiftId &&
                (confirmEnd ? (
                  <div className="rounded-lg border border-guava/30 bg-guava/5 p-3">
                    <p className="text-xs text-plum-ink/70">
                      This prints your summary, closes your shift and signs you out. The next
                      cashier starts from zero.
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={handleEndShift}
                        disabled={ending}
                        className="flex-1 rounded-full bg-guava px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                      >
                        {ending ? "Ending…" : "Yes, end my shift"}
                      </button>
                      <button
                        onClick={() => setConfirmEnd(false)}
                        disabled={ending}
                        className="rounded-full border border-plum-ink/15 px-4 py-2 text-sm font-semibold"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmEnd(true)}
                    className="w-full rounded-full border border-plum-ink/15 px-4 py-2.5 text-center text-sm font-semibold text-plum-ink/70 hover:border-guava hover:text-guava"
                  >
                    End shift &amp; sign out
                  </button>
                ))}

              {printMsg && (
                <p className="text-center text-xs text-plum-ink/55">{printMsg}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
