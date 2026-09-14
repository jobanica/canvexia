import { isStatutory, type DiscountType } from "./discount";
import {
  identityGaps,
  vatBreakdown,
  type PharmacyIdentity,
  type ReceiptGap,
  type SummaryRow,
  type VatBox,
} from "./receipt";

/**
 * The credit note — the document a return produces.
 *
 * A void and a return are different instruments (D32), and this is the half
 * that has to be handed to a customer. It is its own BIR document with its own
 * gapless series (`CN…`), and it must point at the invoice it corrects: a
 * credit note that does not name the receipt it reverses cannot be reconciled
 * against anything.
 *
 * It repeats the receipt's central problem in mirror image. A return is priced
 * from the ORIGINAL line — shelf prices — but the customer is refunded what
 * they actually PAID, prorated. On a Senior Citizen sale those differ by the
 * discount: ₱112.00 of goods comes back and ₱80.00 goes out. Printing the
 * ₱112.00 as the credit would overstate the reversal by exactly the discount,
 * on every statutory return, forever — which is the receipt's ₱32.00 bug
 * arriving from the other direction.
 *
 * So both figures are printed, and the step between them is a labelled row.
 */

export interface CreditNoteLineInput {
  productName: string;
  generic: string | null;
  lotNumber: string | null;
  expiry: Date | null;
  quantity: number;
  unitPriceCentavos: number;
  lineTotalCentavos: number;
  /** `restocked` or `destroyed`. Printed: it is the record of what happened. */
  disposition: string;
}

/** The sale being corrected. Enough of it to mirror its VAT treatment. */
export interface CreditNoteSaleRef {
  receiptNumber: string;
  createdAt: Date;
  subtotalCentavos: number;
  totalCentavos: number;
  vatExemptCentavos: number;
  discountType: DiscountType;
  beneficiaryIdNo: string | null;
  beneficiaryName: string | null;
}

export interface CreditNoteInput {
  returnNumber: string;
  createdAt: Date;
  reason: string | null;
  refundMethod: string;
  /** What the customer actually gets back — already prorated. */
  refundCentavos: number;
  processedBy: string | null;
  sale: CreditNoteSaleRef;
  items: CreditNoteLineInput[];
}

export interface CreditNoteDocument {
  identity: PharmacyIdentity;
  title: string;
  returnNumber: string;
  issuedAt: Date;
  /** The invoice this corrects. A credit note is meaningless without it. */
  correcting: { receiptNumber: string; issuedAt: Date };
  lines: CreditNoteLineInput[];
  summary: SummaryRow[];
  vat: VatBox | null;
  vatRegistered: boolean;
  /** Carried from the original sale — the discount is the customer's, not the sale's. */
  beneficiary: { label: string; name: string | null; idNo: string | null } | null;
  reason: string | null;
  refundMethod: string;
  processedBy: string | null;
  gaps: ReceiptGap[];
  isOfficial: boolean;
}

const BENEFICIARY_LABEL: Record<"sc" | "pwd", string> = {
  sc: "Senior Citizen",
  pwd: "Person With Disability",
};

/** Goods coming back, valued at what they were sold for. */
export function grossReturned(items: Pick<CreditNoteLineInput, "lineTotalCentavos">[]): number {
  return items.reduce((sum, i) => sum + i.lineTotalCentavos, 0);
}

/**
 * The summary, in two shapes.
 *
 * When the original sale was not discounted the refund equals the goods and one
 * row says so. When it was, the gap is shown as its own row rather than folded
 * away — a credit note whose lines sum to more than its total, with nothing
 * explaining the difference, is a document that invites a dispute at the
 * counter and a question at audit.
 */
export function creditNoteSummary(
  grossCentavos: number,
  refundCentavos: number,
  discountType: DiscountType,
): SummaryRow[] {
  const gross = Math.max(0, grossCentavos);
  const refund = Math.max(0, Math.min(refundCentavos, gross));

  if (refund === gross) {
    return [{ label: "Amount refunded", centavos: refund, kind: "due" }];
  }

  const label = isStatutory(discountType)
    ? `Less ${BENEFICIARY_LABEL[discountType]} discount on the original sale`
    : "Less discount on the original sale";

  return [
    { label: "Goods returned (at the prices charged)", centavos: gross, kind: "subtotal" },
    {
      label,
      centavos: gross - refund,
      kind: "deduction",
      note: "The refund is what was actually paid, not the shelf price.",
    },
    { label: "Amount refunded", centavos: refund, kind: "due" },
  ];
}

/**
 * The credit note's VAT mirrors the sale's.
 *
 * If the sale was VAT-exempt the credit is exempt in full; a credit note that
 * reclaims output VAT never charged would understate the return. Any partly
 * exempt sale is impossible today — `discountType` is per-sale — so this reads
 * the stored flag rather than assuming.
 */
export function creditVatBox(
  refundCentavos: number,
  sale: Pick<CreditNoteSaleRef, "vatExemptCentavos">,
  vatRatePct: number,
): VatBox {
  const exemptSale = sale.vatExemptCentavos > 0;
  return vatBreakdown(refundCentavos, exemptSale ? refundCentavos : 0, vatRatePct);
}

export function buildCreditNote(
  identity: PharmacyIdentity,
  input: CreditNoteInput,
): CreditNoteDocument {
  const gaps = identityGaps(identity);
  const vatRegistered = identity.vatRatePct > 0;
  const gross = grossReturned(input.items);

  return {
    identity,
    title: identity.displayName?.trim() || identity.name,
    returnNumber: input.returnNumber,
    issuedAt: input.createdAt,
    correcting: {
      receiptNumber: input.sale.receiptNumber,
      issuedAt: input.sale.createdAt,
    },
    lines: input.items,
    summary: creditNoteSummary(gross, input.refundCentavos, input.sale.discountType),
    vat: vatRegistered
      ? creditVatBox(input.refundCentavos, input.sale, identity.vatRatePct)
      : null,
    vatRegistered,
    beneficiary: isStatutory(input.sale.discountType)
      ? {
          label: BENEFICIARY_LABEL[input.sale.discountType],
          name: input.sale.beneficiaryName,
          idNo: input.sale.beneficiaryIdNo,
        }
      : null,
    reason: input.reason,
    refundMethod: input.refundMethod,
    processedBy: input.processedBy,
    gaps,
    isOfficial: gaps.length === 0,
  };
}
