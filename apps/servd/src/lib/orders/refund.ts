/**
 * Working out what a refunded item is actually worth.
 *
 * The naive answer — hand back the line's menu price — is wrong for any ticket
 * that carried a discount, a gift card, or a card fee. A ₱1,000 order settled
 * at ₱800 after a senior discount that then refunds a ₱200 dish at face value
 * has given back more of the customer's money than they paid for that dish, and
 * the drawer is short by the difference.
 *
 * So a refund is a SHARE OF WHAT WAS COLLECTED, proportional to the line's
 * share of the ticket. Every adjustment on the order — discount, credit,
 * surcharge — is already baked into what was collected, so none of them need
 * handling separately and none of them can be missed.
 *
 * Pure: no database, no clock, no money moved.
 */

export interface RefundableLine {
  id: string;
  /** Gross value of the whole line (unit incl. add-ons × quantity), centavos. */
  lineTotal: number;
  quantity: number;
  /** How many of this line have already been refunded. */
  refundedQty: number;
}

export interface RefundRequest {
  lineId: string;
  quantity: number;
}

export interface RefundPlan {
  /** What to hand back in total, centavos. */
  amount: number;
  lines: { lineId: string; quantity: number; amount: number }[];
  error: string | null;
}

/**
 * @param lines      every line on the ticket (all of them — the shares are
 *                   worked out against the ticket's whole gross)
 * @param requests   what's being refunded
 * @param collected  what the ticket actually took, centavos
 * @param alreadyRefunded  what has already been handed back on it, centavos
 */
export function planRefund(
  lines: RefundableLine[],
  requests: RefundRequest[],
  collected: number,
  alreadyRefunded = 0,
): RefundPlan {
  const none: RefundPlan = { amount: 0, lines: [], error: null };
  const byId = new Map(lines.map((l) => [l.id, l]));

  const wanted = requests.filter((r) => r.quantity > 0);
  if (wanted.length === 0) return { ...none, error: "Pick at least one item to refund." };

  const grossTicket = lines.reduce((s, l) => s + Math.max(0, l.lineTotal), 0);
  if (grossTicket <= 0) return { ...none, error: "There's nothing on this ticket to refund." };

  const remaining = Math.max(0, collected - Math.max(0, alreadyRefunded));
  if (remaining <= 0) {
    return { ...none, error: "Everything collected on this ticket has already been refunded." };
  }

  const out: RefundPlan["lines"] = [];
  for (const r of wanted) {
    const line = byId.get(r.lineId);
    if (!line) return { ...none, error: "That item isn't on this ticket." };
    const left = Math.max(0, line.quantity - Math.max(0, line.refundedQty));
    if (r.quantity > left) {
      return {
        ...none,
        error:
          left === 0
            ? "That item has already been refunded."
            : `Only ${left} of that item left to refund.`,
      };
    }
    // The line's share of the ticket, scaled to how many are going back.
    const perUnitGross = line.lineTotal / line.quantity;
    const share = (perUnitGross * r.quantity) / grossTicket;
    out.push({ lineId: r.lineId, quantity: r.quantity, amount: Math.round(share * collected) });
  }

  const total = out.reduce((s, l) => s + l.amount, 0);
  // Rounding each line independently can drift a centavo past what's left.
  // Refunding more than was taken is the one outcome that must never happen.
  if (total > remaining) {
    const trimmed = trimTo(out, remaining);
    return { amount: remaining, lines: trimmed, error: null };
  }
  return { amount: total, lines: out, error: null };
}

/** Shave the overshoot off the largest line, so the total lands exactly. */
function trimTo(lines: RefundPlan["lines"], cap: number): RefundPlan["lines"] {
  const total = lines.reduce((s, l) => s + l.amount, 0);
  let over = total - cap;
  if (over <= 0) return lines;
  const sorted = [...lines].sort((a, b) => b.amount - a.amount);
  return lines.map((l) => {
    if (over <= 0 || l.lineId !== sorted[0].lineId) return l;
    const take = Math.min(over, l.amount);
    over -= take;
    return { ...l, amount: l.amount - take };
  });
}

/** What's left to refund on a ticket, centavos. */
export function refundableRemaining(collected: number, alreadyRefunded: number): number {
  return Math.max(0, collected - Math.max(0, alreadyRefunded));
}
