import { isStatutory, type DiscountType } from "./discount";

/**
 * The receipt, as a document rather than as JSX.
 *
 * A PH pharmacy receipt is a regulated document twice over — BIR wants a sales
 * invoice with a specific VAT presentation, FDA wants the Licence to Operate
 * and the supervising pharmacist's PRC number on the face of it. Getting the
 * layout wrong is not a cosmetic problem: the figures on this page are what a
 * pharmacy files, and what a Senior Citizen claims.
 *
 * So the arithmetic and the ORDER OF THE SUMMARY LINES live here, tested,
 * rather than in a component. The SC/PWD summary is structurally different from
 * an ordinary one — five rows against three, and two of them are statutory
 * disclosures — which is exactly the kind of branch that should not be a
 * ternary inside a <dl>.
 *
 * Everything is integer centavos. Nothing here rounds money twice: every
 * derived figure is a subtraction from a stored one, so the printed rows add up
 * to the amount actually charged by construction rather than by luck.
 */

/** The statutory rate. RA 9994 (SC) and RA 10754 (PWD) both give 20%. */
const STATUTORY_RATE = 0.2;

export interface PharmacyIdentity {
  name: string;
  displayName: string | null;
  address: string | null;
  phone: string | null;
  /** BIR Taxpayer Identification Number. */
  tin: string | null;
  /** FDA Licence to Operate. */
  fdaLtoNumber: string | null;
  /** The supervising pharmacist's PRC licence number. */
  prcLicenseNo: string | null;
  /** 12 in the Philippines. Zero means the pharmacy is not VAT-registered. */
  vatRatePct: number;
}

export interface ReceiptLineInput {
  nameAtTime: string;
  genericAtTime: string | null;
  lotNumberAtTime: string | null;
  expiryAtTime: Date | null;
  quantity: number;
  unitPriceCentavos: number;
  lineTotalCentavos: number;
}

export interface ReceiptSaleInput {
  receiptNumber: string;
  createdAt: Date;
  status: string;
  subtotalCentavos: number;
  discountCentavos: number;
  totalCentavos: number;
  vatExemptCentavos: number;
  discountType: DiscountType;
  beneficiaryIdNo: string | null;
  beneficiaryName: string | null;
  paymentMethod: string;
  tenderedCentavos: number;
  changeCentavos: number;
  prescriptionRef: string | null;
  /** Who rang it up. Not the same person as the supervising pharmacist. */
  soldBy: string | null;
  items: ReceiptLineInput[];
}

/**
 * The VAT box.
 *
 * Four figures BIR expects on the face of an invoice, and they must add to the
 * amount due — a box that does not reconcile to the total is a filing that does
 * not reconcile either.
 */
export interface VatBox {
  /** Sales net of VAT. */
  vatableSalesCentavos: number;
  /** The VAT on them. */
  vatCentavos: number;
  /** Exempt sales — an SC/PWD sale is exempt in full. */
  vatExemptCentavos: number;
  /** Always zero here; printed because the form has the row. */
  zeroRatedCentavos: number;
}

/**
 * Split a VAT-inclusive amount into its net and its VAT.
 *
 * The exempt portion is carved out FIRST and never has VAT imputed to it. The
 * VAT is then derived by subtraction rather than by a second rounding, so
 * `vatable + vat + exempt === amount` holds for every input.
 */
export function vatBreakdown(
  amountCentavos: number,
  vatExemptCentavos: number,
  vatRatePct: number,
): VatBox {
  const amount = Math.max(0, amountCentavos);
  const exempt = Math.min(Math.max(0, vatExemptCentavos), amount);
  const inclusive = amount - exempt;

  const vatable =
    vatRatePct > 0 ? Math.round(inclusive / (1 + vatRatePct / 100)) : inclusive;

  return {
    vatableSalesCentavos: vatable,
    vatCentavos: inclusive - vatable,
    vatExemptCentavos: exempt,
    zeroRatedCentavos: 0,
  };
}

/**
 * How an SC/PWD sale gets from shelf price to amount due.
 *
 * Two deductions, and printing them as one is the mistake this exists to stop.
 * On a ₱112.00 shelf price the beneficiary pays ₱80.00, and the stored
 * `discountCentavos` is ₱32.00 — but the STATUTORY discount is ₱20.00 and the
 * other ₱12.00 is VAT that was removed before it. A receipt showing "20%
 * discount ₱32.00" states a 28.6% discount, and ₱32.00 is not what the pharmacy
 * may claim as a tax deduction.
 *
 * Derived from the stored subtotal and total, never recomputed from the lines:
 * `totalCentavos` is a sum of per-line roundings and is the money that actually
 * changed hands. Any rounding drift therefore lands in `statutoryDiscount`, the
 * residual — which is the right place for it, because the VAT removal is exact
 * arithmetic on the shelf price and the discount is whatever reconciles to the
 * amount charged.
 */
export interface StatutorySplit {
  /** Shelf price, VAT-inclusive. */
  grossCentavos: number;
  /** The VAT taken off it. */
  vatDeductedCentavos: number;
  /** Shelf price net of VAT — the base the 20% is taken on. */
  netOfVatCentavos: number;
  /** The 20%. This is the figure the pharmacy claims. */
  statutoryDiscountCentavos: number;
  /** What the beneficiary pays. */
  amountDueCentavos: number;
}

export function statutorySplit(
  subtotalCentavos: number,
  totalCentavos: number,
  vatRatePct: number,
): StatutorySplit {
  const gross = Math.max(0, subtotalCentavos);
  const due = Math.min(Math.max(0, totalCentavos), gross);
  const netOfVat =
    vatRatePct > 0 ? Math.round(gross / (1 + vatRatePct / 100)) : gross;

  return {
    grossCentavos: gross,
    vatDeductedCentavos: gross - netOfVat,
    netOfVatCentavos: netOfVat,
    statutoryDiscountCentavos: netOfVat - due,
    amountDueCentavos: due,
  };
}

/** One row of the printed summary. */
export interface SummaryRow {
  label: string;
  centavos: number;
  /** `deduction` prints with a leading minus; `due` is the emphasised row. */
  kind: "subtotal" | "deduction" | "due";
  /** Shown small under the row, where the row needs explaining. */
  note?: string;
}

/**
 * Something the receipt legally needs and does not have.
 *
 * Surfaced rather than printed blank. A document with an empty space where the
 * TIN goes still looks like an official receipt, which is the failure mode
 * worth avoiding — a customer cannot tell, and the pharmacy finds out at audit.
 */
export interface ReceiptGap {
  field: string;
  label: string;
  why: string;
}

export interface ReceiptDocument {
  /** Registered name, address, phone, and the licence numbers. */
  identity: PharmacyIdentity;
  /** Trading name if set, registered name otherwise. */
  title: string;
  receiptNumber: string;
  issuedAt: Date;
  voided: boolean;
  lines: ReceiptLineInput[];
  summary: SummaryRow[];
  /** Null when the pharmacy is not VAT-registered. */
  vat: VatBox | null;
  vatRegistered: boolean;
  beneficiary: {
    kind: "sc" | "pwd";
    label: string;
    name: string | null;
    idNo: string | null;
  } | null;
  payment: {
    method: string;
    tenderedCentavos: number;
    changeCentavos: number;
  };
  prescriptionRef: string | null;
  soldBy: string | null;
  gaps: ReceiptGap[];
  /**
   * True only when nothing required is missing. When false the document must
   * not be presented as an official receipt.
   */
  isOfficial: boolean;
}

const BENEFICIARY_LABEL: Record<"sc" | "pwd", string> = {
  sc: "Senior Citizen",
  pwd: "Person With Disability",
};

/**
 * What the pharmacy itself is missing, independent of any one sale.
 *
 * Separate from `receiptGaps` because a credit note needs exactly these and
 * none of the beneficiary checks — and because "is this pharmacy able to issue
 * a compliant document at all" is a different question from "is this document
 * complete".
 */
export function identityGaps(identity: PharmacyIdentity): ReceiptGap[] {
  const gaps: ReceiptGap[] = [];

  if (!identity.tin?.trim()) {
    gaps.push({
      field: "tin",
      label: "TIN",
      why: "BIR requires the taxpayer identification number on the face of an invoice.",
    });
  }
  if (!identity.address?.trim()) {
    gaps.push({
      field: "address",
      label: "Business address",
      why: "BIR requires the registered address of the business.",
    });
  }
  if (!identity.fdaLtoNumber?.trim()) {
    gaps.push({
      field: "fdaLtoNumber",
      label: "FDA Licence to Operate",
      why: "A pharmacy's receipt must carry its LTO number.",
    });
  }
  if (!identity.prcLicenseNo?.trim()) {
    gaps.push({
      field: "prcLicenseNo",
      label: "Supervising pharmacist PRC No.",
      why: "Dispensing happens under a registered pharmacist, who is named on the receipt.",
    });
  }

  return gaps;
}

export function receiptGaps(
  identity: PharmacyIdentity,
  sale: Pick<ReceiptSaleInput, "discountType" | "beneficiaryIdNo" | "beneficiaryName">,
): ReceiptGap[] {
  const gaps = identityGaps(identity);

  if (isStatutory(sale.discountType)) {
    if (!sale.beneficiaryIdNo?.trim()) {
      gaps.push({
        field: "beneficiaryIdNo",
        label: "Beneficiary ID number",
        why: "The discount is not valid without the Senior Citizen or PWD ID on the receipt.",
      });
    }
    if (!sale.beneficiaryName?.trim()) {
      gaps.push({
        field: "beneficiaryName",
        label: "Beneficiary name",
        why: "The booklet entry and the receipt both name the beneficiary.",
      });
    }
  }

  return gaps;
}

/**
 * Build the printable summary.
 *
 * Three shapes, and the statutory one is the reason this is a function:
 *
 *   no discount   Amount due
 *   manual        Subtotal / Less discount / Amount due
 *   SC or PWD     Total (VAT-inclusive) / Less VAT / Total (VAT-exempt)
 *                 / Less 20% discount / Amount due
 *
 * The statutory five is the presentation a BIR examiner reads, and it is the
 * only one that shows the 20% as 20%.
 */
export function summaryRows(
  sale: Pick<
    ReceiptSaleInput,
    "subtotalCentavos" | "discountCentavos" | "totalCentavos" | "discountType"
  >,
  vatRatePct: number,
): SummaryRow[] {
  if (isStatutory(sale.discountType)) {
    const split = statutorySplit(sale.subtotalCentavos, sale.totalCentavos, vatRatePct);
    const label = BENEFICIARY_LABEL[sale.discountType];
    const rows: SummaryRow[] = [];

    if (vatRatePct > 0) {
      rows.push(
        { label: "Total (VAT-inclusive)", centavos: split.grossCentavos, kind: "subtotal" },
        {
          label: `Less VAT (${vatRatePct}%)`,
          centavos: split.vatDeductedCentavos,
          kind: "deduction",
          note: `A ${label} sale is VAT-exempt, so the VAT comes off before the discount.`,
        },
        { label: "Total (VAT-exempt)", centavos: split.netOfVatCentavos, kind: "subtotal" },
      );
    } else {
      rows.push({ label: "Subtotal", centavos: split.grossCentavos, kind: "subtotal" });
    }

    rows.push(
      {
        label: `Less ${STATUTORY_RATE * 100}% ${label} discount`,
        centavos: split.statutoryDiscountCentavos,
        kind: "deduction",
      },
      { label: "Amount due", centavos: split.amountDueCentavos, kind: "due" },
    );
    return rows;
  }

  if (sale.discountCentavos > 0) {
    return [
      { label: "Subtotal", centavos: sale.subtotalCentavos, kind: "subtotal" },
      { label: "Less discount", centavos: sale.discountCentavos, kind: "deduction" },
      { label: "Amount due", centavos: sale.totalCentavos, kind: "due" },
    ];
  }

  return [{ label: "Amount due", centavos: sale.totalCentavos, kind: "due" }];
}

export function buildReceipt(
  identity: PharmacyIdentity,
  sale: ReceiptSaleInput,
): ReceiptDocument {
  const gaps = receiptGaps(identity, sale);
  const vatRegistered = identity.vatRatePct > 0;

  return {
    identity,
    title: identity.displayName?.trim() || identity.name,
    receiptNumber: sale.receiptNumber,
    issuedAt: sale.createdAt,
    voided: sale.status === "voided",
    lines: sale.items,
    summary: summaryRows(sale, identity.vatRatePct),
    vat: vatRegistered
      ? vatBreakdown(sale.totalCentavos, sale.vatExemptCentavos, identity.vatRatePct)
      : null,
    vatRegistered,
    beneficiary: isStatutory(sale.discountType)
      ? {
          kind: sale.discountType,
          label: BENEFICIARY_LABEL[sale.discountType],
          name: sale.beneficiaryName,
          idNo: sale.beneficiaryIdNo,
        }
      : null,
    payment: {
      method: sale.paymentMethod,
      tenderedCentavos: sale.tenderedCentavos,
      changeCentavos: sale.changeCentavos,
    },
    prescriptionRef: sale.prescriptionRef,
    soldBy: sale.soldBy,
    gaps,
    isOfficial: gaps.length === 0,
  };
}
