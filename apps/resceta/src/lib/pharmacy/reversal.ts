/**
 * Undoing a sale: the two ways, and when each one applies.
 *
 * They are not the same operation with different paperwork.
 *
 *   VOID    — the sale never really happened. Rung up twice, wrong customer,
 *             cashier hit the wrong button. Everything reverses: every unit
 *             goes back to the exact batch it left, and the receipt is marked
 *             voided. SAME BUSINESS DAY ONLY.
 *
 *   RETURN  — the sale happened and is being partly undone. The customer came
 *             back with something. Its own document, its own number, any time.
 *             Stock does NOT go back on the shelf by default.
 *
 * WHY THE VOID WINDOW. A receipt is a reported figure. Voiding one from a day
 * that has already been closed off changes a number that has been filed, which
 * is what a credit note exists to avoid — you do not edit history, you post a
 * correction against it. So a void is available while the day is still open and
 * a return is available afterwards. That is not a restriction so much as a
 * signpost: it routes you to the instrument that fits, rather than blocking you
 * and inviting a workaround.
 *
 * Pure, so the rules can be tested without a database. Business days are
 * reckoned in Asia/Manila, like everything else here.
 */

export interface SaleLineForReversal {
  saleItemId: string;
  productName: string;
  lotNumber: string | null;
  /** Units sold on this line. */
  quantity: number;
  unitPriceCentavos: number;
  /** Units already given back across every earlier return on this sale. */
  alreadyReturned: number;
}

export type VoidRefusal = "already_voided" | "day_closed" | "has_returns";

export type VoidCheck =
  | { ok: true }
  | { ok: false; reason: VoidRefusal; message: string };

export function canVoid(
  sale: { status: "completed" | "voided"; createdAt: Date; returnCount: number },
  asOf: Date = new Date(),
): VoidCheck {
  if (sale.status === "voided") {
    return { ok: false, reason: "already_voided", message: "This sale is already voided." };
  }
  if (sale.returnCount > 0) {
    // A sale with a credit note against it has already been partly undone, and
    // voiding it as well would give the money back twice.
    return {
      ok: false,
      reason: "has_returns",
      message: "This sale already has a return against it, so it can't be voided.",
    };
  }
  if (manilaDay(sale.createdAt) !== manilaDay(asOf)) {
    return {
      ok: false,
      reason: "day_closed",
      message:
        "That receipt is from an earlier day and can't be voided — record a return instead.",
    };
  }
  return { ok: true };
}

/** How many units of each line can still be given back. */
export function returnableQuantity(line: SaleLineForReversal): number {
  return Math.max(0, line.quantity - line.alreadyReturned);
}

export interface ReturnRequestLine {
  saleItemId: string;
  quantity: number;
  restock?: boolean;
}

export interface ReturnIssue {
  saleItemId: string;
  message: string;
}

export interface CheckedReturn {
  ok: boolean;
  issues: ReturnIssue[];
  /** Refund total in centavos, priced at what was actually charged. */
  totalCentavos: number;
  lines: {
    saleItemId: string;
    quantity: number;
    unitPriceCentavos: number;
    lineTotalCentavos: number;
    restock: boolean;
  }[];
}

/**
 * Check a return against what the sale actually contained.
 *
 * Priced from the ORIGINAL LINE, never from the product's current price. A
 * refund at today's price on something bought last month at a different one is
 * either a loss or a short-change, and both are somebody noticing later.
 *
 * A discount on the original sale is deliberately NOT prorated here — see the
 * note in the server path. Refunding the full line price on a discounted sale
 * gives back more than was taken, so the caller passes the line price it wants
 * honoured and the server recomputes proportionally.
 */
export function checkReturn(
  saleLines: SaleLineForReversal[],
  requested: ReturnRequestLine[],
): CheckedReturn {
  const byId = new Map(saleLines.map((l) => [l.saleItemId, l]));
  const issues: ReturnIssue[] = [];
  const lines: CheckedReturn["lines"] = [];
  let total = 0;

  const wanted = requested.filter((r) => r.quantity > 0);
  if (wanted.length === 0) {
    return {
      ok: false,
      issues: [{ saleItemId: "", message: "Nothing selected to return." }],
      totalCentavos: 0,
      lines: [],
    };
  }

  // A line named twice would pass each check on its own and overdraw together.
  const seen = new Set<string>();

  for (const req of wanted) {
    const line = byId.get(req.saleItemId);
    if (!line) {
      issues.push({ saleItemId: req.saleItemId, message: "That item isn't on this receipt." });
      continue;
    }
    if (seen.has(req.saleItemId)) {
      issues.push({ saleItemId: req.saleItemId, message: "That item is listed twice." });
      continue;
    }
    seen.add(req.saleItemId);

    if (!Number.isInteger(req.quantity) || req.quantity <= 0) {
      issues.push({ saleItemId: req.saleItemId, message: "Quantity must be a whole number above zero." });
      continue;
    }

    const remaining = returnableQuantity(line);
    if (remaining === 0) {
      issues.push({
        saleItemId: req.saleItemId,
        message: `${line.productName} has already been returned in full.`,
      });
      continue;
    }
    if (req.quantity > remaining) {
      issues.push({
        saleItemId: req.saleItemId,
        message: `Only ${remaining} of ${line.productName} can still be returned.`,
      });
      continue;
    }

    const lineTotal = line.unitPriceCentavos * req.quantity;
    total += lineTotal;
    lines.push({
      saleItemId: req.saleItemId,
      quantity: req.quantity,
      unitPriceCentavos: line.unitPriceCentavos,
      lineTotalCentavos: lineTotal,
      restock: req.restock === true,
    });
  }

  return { ok: issues.length === 0 && lines.length > 0, issues, totalCentavos: total, lines };
}

/**
 * The refund actually owed, once the original sale's discount is accounted for.
 *
 * A sale of ₱1,000 that was discounted to ₱800 was paid at 80% of list. Giving
 * back the list price of a returned line hands over money nobody took — and on
 * an SC/PWD sale, where the discount is 20% off the VAT-exclusive price, it is
 * a systematic overpayment on every single return.
 *
 * So the refund is prorated by what the customer actually paid. Rounded at the
 * end rather than per line, and floored at zero.
 */
export function proratedRefund(
  grossReturnCentavos: number,
  sale: { subtotalCentavos: number; totalCentavos: number },
): number {
  if (grossReturnCentavos <= 0) return 0;
  if (sale.subtotalCentavos <= 0) return 0;
  const ratio = sale.totalCentavos / sale.subtotalCentavos;
  return Math.max(0, Math.round(grossReturnCentavos * ratio));
}

const manilaFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function manilaDay(d: Date): string {
  return manilaFormatter.format(d);
}
