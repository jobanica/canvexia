"use client";

import { useState } from "react";
import { formatPeso } from "@/lib/money";

/**
 * How the customer said they'd pay, with their proof one tap away.
 *
 * Two things this fixes. The cashier could see "verify before accepting" but
 * had no way to actually LOOK at the screenshot the customer uploaded — an
 * instruction to verify, with nothing to verify against. And once an order was
 * accepted the method vanished entirely, leaving "Payment: unpaid" on ten open
 * cards with no way to tell which of them owes cash and which already
 * transferred.
 *
 * The screenshot opens in place rather than a new tab: on a till tablet,
 * bouncing out to another tab and back loses the cashier's position on a busy
 * board.
 */

const CHOICE: Record<string, { label: string; tone: string }> = {
  cod: { label: "💵 Cash on delivery", tone: "bg-amber-100 text-amber-800" },
  cash: { label: "💵 Cash", tone: "bg-amber-100 text-amber-800" },
  gcash: { label: "📱 GCash", tone: "bg-blue-100 text-blue-700" },
  maya: { label: "🟢 Maya", tone: "bg-green-100 text-green-700" },
  bank: { label: "🏦 Bank transfer", tone: "bg-slate-200 text-slate-700" },
};

export function PaymentBadge({
  choice,
  reference,
  receiptUrl,
  cashTendered,
  total,
  paid,
}: {
  choice: string | null;
  reference: string | null;
  receiptUrl: string | null;
  cashTendered: number | null;
  total: number;
  paid: boolean;
}) {
  const [viewing, setViewing] = useState(false);
  if (!choice) return null;

  const meta = CHOICE[choice] ?? { label: choice, tone: "bg-plum-ink/5 text-plum-ink/70" };
  const isCash = choice === "cod" || choice === "cash";
  // Change to prepare, so the drawer is counted before the customer arrives.
  const change = cashTendered != null ? cashTendered - total : null;

  return (
    <>
      <div className={`mt-1 rounded-md px-2 py-1 text-xs font-bold ${meta.tone}`}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span>{meta.label}</span>
          {reference && <span className="font-mono font-semibold">Ref: {reference}</span>}
          {!paid && !isCash && <span className="font-normal opacity-80">· verify first</span>}

          {receiptUrl ? (
            <button
              type="button"
              onClick={() => setViewing(true)}
              className="rounded-full bg-white/70 px-2 py-0.5 font-bold underline decoration-dotted"
            >
              🧾 View proof
            </button>
          ) : (
            // Say it rather than showing nothing. "Verify first" beside an
            // empty space reads as a missing button, and a cashier hunts for
            // it instead of doing the one thing that works: asking the
            // customer to show the payment on their phone.
            !isCash && (
              <span className="font-normal opacity-70">
                · {reference ? "reference only, no screenshot" : "no proof attached"}
              </span>
            )
          )}
        </div>

        {isCash && cashTendered != null && (
          <p className="mt-0.5 font-normal">
            Paying with {formatPeso(cashTendered)}
            {change != null && change >= 0 && (
              <span className="font-bold"> · change {formatPeso(change)}</span>
            )}
            {change != null && change < 0 && (
              <span className="font-bold"> · short {formatPeso(-change)}</span>
            )}
          </p>
        )}
      </div>

      {viewing && receiptUrl && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setViewing(false)}
        >
          <div className="flex max-h-full flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={receiptUrl}
              alt="Payment screenshot the customer uploaded"
              className="max-h-[80vh] max-w-full rounded-lg object-contain"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="flex items-center gap-2">
              <a
                href={receiptUrl}
                target="_blank"
                rel="noopener"
                onClick={(e) => e.stopPropagation()}
                className="rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-plum-ink"
              >
                Open full size
              </a>
              <button
                onClick={() => setViewing(false)}
                className="rounded-full bg-white/90 px-4 py-2 text-sm font-semibold text-plum-ink"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
