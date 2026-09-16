/**
 * What an SMS costs, in credits and in pesos.
 *
 * Pure, and in core, because three places have to agree about it and two of
 * them are screens: the composer's "this will cost N credits", the sender's
 * debit, and the partner statement. A segment count computed differently in any
 * one of those is a bill that does not match what somebody was shown.
 */

/**
 * ONE CREDIT IS ONE SEGMENT, not one message.
 *
 * A long text is several segments on the network and is billed as several, so
 * counting messages would drift from the aggregator's invoice by exactly the
 * amount nobody notices until the month it matters.
 */
export const CREDIT_PRICE_CENTAVOS = 50; // ₱0.50, confirmed.

export interface CreditPack {
  credits: number;
  /** Centavos. Derived, never typed twice. */
  priceCentavos: number;
}

export const CREDIT_PACKS: CreditPack[] = [500, 2000, 10000].map((credits) => ({
  credits,
  priceCentavos: credits * CREDIT_PRICE_CENTAVOS,
}));

export function packFor(credits: number): CreditPack | null {
  return CREDIT_PACKS.find((p) => p.credits === credits) ?? null;
}

/**
 * GSM-7, the alphabet an ordinary SMS is encoded in.
 *
 * The characters outside it are what make this worth doing: an emoji, a curly
 * apostrophe pasted out of Word, or the ₱ sign itself push the whole message
 * into UCS-2, where a segment holds 70 characters instead of 160. A composer
 * that does not say so lets somebody quadruple their own bill with one paste.
 */
const GSM7 =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

/** These cost TWO GSM-7 characters each, because they are escape sequences. */
const GSM7_EXTENDED = "^{}\\[~]|€";

export type SmsEncoding = "GSM-7" | "UCS-2";

export function encodingOf(text: string): SmsEncoding {
  for (const ch of text) {
    if (!GSM7.includes(ch) && !GSM7_EXTENDED.includes(ch)) return "UCS-2";
  }
  return "GSM-7";
}

export interface SegmentCount {
  encoding: SmsEncoding;
  /** Billable characters — escapes counted twice, as the network counts them. */
  length: number;
  segments: number;
  /** How many more characters fit before another segment is charged for. */
  remaining: number;
}

/**
 * How many segments this message is.
 *
 * The thresholds are the network's, not ours: 160 for a single GSM-7 message
 * and 153 each once it is concatenated (the header eats seven characters);
 * 70 and 67 for UCS-2. An empty message is ZERO segments, not one — the
 * composer shows a cost before anything is typed and "1 credit" for nothing
 * would be wrong in the direction that costs somebody money.
 */
export function countSegments(text: string): SegmentCount {
  const encoding = encodingOf(text);
  let length = 0;
  for (const ch of text) {
    length += encoding === "GSM-7" && GSM7_EXTENDED.includes(ch) ? 2 : 1;
  }

  const single = encoding === "GSM-7" ? 160 : 70;
  const multi = encoding === "GSM-7" ? 153 : 67;

  if (length === 0) return { encoding, length, segments: 0, remaining: single };
  if (length <= single) {
    return { encoding, length, segments: 1, remaining: single - length };
  }
  const segments = Math.ceil(length / multi);
  return { encoding, length, segments, remaining: segments * multi - length };
}

/** What sending one body to N recipients will cost, in credits. */
export function campaignCost(body: string, recipients: number): number {
  return countSegments(body).segments * Math.max(0, recipients);
}

export function pesos(centavos: number): string {
  return `₱${(centavos / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * When to warn that the wallet is nearly empty.
 *
 * TEN PER CENT OF THE LAST TOP-UP, which is the only figure that means anything
 * — 10% of the balance is a threshold that moves as the balance moves and can
 * never be crossed. A partner who bought 2,000 credits is warned at 200.
 *
 * The floor of 50 is for the partner who has never topped up through us or
 * whose last purchase was tiny: a warning at 5 credits arrives after the
 * campaign has already been cut short.
 */
export function lowBalanceThreshold(lastTopUpCredits: number): number {
  return Math.max(50, Math.floor(lastTopUpCredits * 0.1));
}

export function isLow(balance: number, lastTopUpCredits: number): boolean {
  return balance <= lowBalanceThreshold(lastTopUpCredits);
}

/**
 * The statement's pass-through line.
 *
 * RETURNS A SENTENCE, NOT A NUMBER, WHEN THE COST IS UNSET — and that is the
 * point of this function. The aggregator's per-segment cost is not in this
 * repository, and a made-up figure here would produce a made-up margin on a
 * document an operator uses to decide whether this business is worth running.
 * So an unconfigured cost says so, in words, on the statement.
 */
export function providerCostLine(
  segments: number,
  unitCostCentavos: number | null | undefined,
): { configured: boolean; text: string; centavos: number | null } {
  if (unitCostCentavos === null || unitCostCentavos === undefined) {
    return {
      configured: false,
      text: "Provider cost not configured — ask HQ to enter the per-segment rate.",
      centavos: null,
    };
  }
  const total = segments * unitCostCentavos;
  return {
    configured: true,
    text: `${segments.toLocaleString("en-PH")} segments at ${pesos(unitCostCentavos)} each`,
    centavos: total,
  };
}
