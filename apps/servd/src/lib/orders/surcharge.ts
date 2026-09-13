/**
 * The card surcharge — what a till adds on when somebody pays by card, to cover
 * what the terminal's provider takes off.
 *
 * It is charged on the amount going onto the card, not on the order: a bill
 * split half cash half card only carries a fee on the half that went through
 * the terminal. That falls out of the rule below rather than being special-cased
 * anywhere, because the caller passes the tender, not the total.
 *
 * Pure so the arithmetic can be tested without a terminal, a printer or a till.
 */

import { bpToPercentString } from "@/lib/printing/printer-config";

/** The methods a surcharge applies to. A card is the only one that costs. */
const SURCHARGEABLE = new Set(["card_terminal"]);

export function isSurchargeable(method: string | null | undefined): boolean {
  return !!method && SURCHARGEABLE.has(method);
}

/**
 * The fee on `amount` centavos, or 0 when there's nothing to charge.
 *
 * Rounded to the centavo, half-up. Rounding down would be the generous choice
 * and it is not what a card provider does to the merchant.
 */
export function surchargeFor(
  method: string | null | undefined,
  amount: number,
  bp: number,
): number {
  if (!isSurchargeable(method)) return 0;
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (!Number.isFinite(bp) || bp <= 0) return 0;
  return Math.round((amount * bp) / 10_000);
}

/** What the line is called on the receipt — with the rate, so it can be queried. */
export function surchargeLabel(bp: number): string {
  const pct = bpToPercentString(bp);
  return pct ? `Card fee (${pct}%)` : "Card fee";
}
