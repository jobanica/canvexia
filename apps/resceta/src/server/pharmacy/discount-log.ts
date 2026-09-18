import "server-only";
import { pharmacyDb } from "@/server/tenancy/scoped-db";
import { branchWhere, type BranchContext } from "@/server/pharmacy/branches";
import { manilaDayBounds, type DateRange } from "@/lib/pharmacy/range";

/**
 * THE SENIOR CITIZEN AND PWD LOGBOOK.
 *
 * REPORTED — "i dont see the senior citizen and pwd logbook, add it."
 *
 * A Philippine pharmacy granting the statutory 20% discount is expected to keep
 * a separate record of who received it, and to produce that record on request.
 * Every field it needs has been written on the sale since the discount existed —
 * `discountType`, `beneficiaryName`, `beneficiaryIdNo`, the amounts — and until
 * now the ONLY thing that ever read them back was the receipt.
 *
 * So the data was complete and the record was unobtainable: the same defect
 * this codebase keeps producing, and an expensive one here, because the answer
 * to "show me your discount record" was a database query nobody in the shop can
 * run.
 *
 * VOIDED SALES ARE EXCLUDED. A voided sale granted no discount, and a logbook
 * that lists one overstates what was given away — which is the direction that
 * matters when somebody is checking the claim.
 */

export interface DiscountLogRow {
  saleId: string;
  at: Date;
  receiptNumber: string;
  kind: "sc" | "pwd";
  beneficiaryName: string | null;
  beneficiaryIdNo: string | null;
  /** Before the discount. */
  grossCentavos: number;
  discountCentavos: number;
  /** What was actually paid. */
  netCentavos: number;
  /** VAT the sale was exempted from, which is reported separately. */
  vatExemptCentavos: number;
  items: { name: string; quantity: number; unit: string }[];
}

export interface DiscountLog {
  rows: DiscountLogRow[];
  totals: {
    sales: number;
    grossCentavos: number;
    discountCentavos: number;
    netCentavos: number;
    vatExemptCentavos: number;
    sc: number;
    pwd: number;
  };
  /** Rows the discount was granted on with no ID recorded. See below. */
  missingId: number;
}

export async function discountLog(
  pharmacyId: string,
  range: DateRange,
  branch?: BranchContext,
): Promise<DiscountLog> {
  const { start } = manilaDayBounds(range.from);
  const { end } = manilaDayBounds(range.to);

  const sales = await pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacySale.findMany({
      where: {
        // Voided sales granted nothing. Listing them overstates the claim.
        status: "completed",
        discountType: { in: ["sc", "pwd"] },
        createdAt: { gte: start, lt: end },
        ...(branch ? branchWhere(branch) : {}),
      },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        createdAt: true,
        receiptNumber: true,
        discountType: true,
        beneficiaryName: true,
        beneficiaryIdNo: true,
        subtotalCentavos: true,
        discountCentavos: true,
        totalCentavos: true,
        vatExemptCentavos: true,
        items: {
          orderBy: { createdAt: "asc" },
          select: {
            nameAtTime: true,
            quantity: true,
            product: { select: { unit: true } },
          },
        },
      },
    }),
  );

  const rows: DiscountLogRow[] = sales.map((s) => ({
    saleId: s.id,
    at: s.createdAt,
    receiptNumber: s.receiptNumber,
    kind: s.discountType === "pwd" ? "pwd" : "sc",
    beneficiaryName: s.beneficiaryName,
    beneficiaryIdNo: s.beneficiaryIdNo,
    grossCentavos: s.subtotalCentavos,
    discountCentavos: s.discountCentavos,
    netCentavos: s.totalCentavos,
    vatExemptCentavos: s.vatExemptCentavos,
    items: s.items.map((i) => ({
      // The name AS SOLD, not the product's name today. A product renamed since
      // is a different string, and the logbook has to match the receipt.
      name: i.nameAtTime,
      quantity: i.quantity,
      unit: i.product?.unit ?? "piece",
    })),
  }));

  return {
    rows,
    totals: {
      sales: rows.length,
      grossCentavos: rows.reduce((n, r) => n + r.grossCentavos, 0),
      discountCentavos: rows.reduce((n, r) => n + r.discountCentavos, 0),
      netCentavos: rows.reduce((n, r) => n + r.netCentavos, 0),
      vatExemptCentavos: rows.reduce((n, r) => n + r.vatExemptCentavos, 0),
      sc: rows.filter((r) => r.kind === "sc").length,
      pwd: rows.filter((r) => r.kind === "pwd").length,
    },
    /*
      A DISCOUNT GRANTED WITH NO ID RECORDED is the row that cannot be defended
      if anybody asks about it. The counter refuses to complete such a sale
      today, so a non-zero count here is history from before that gate — worth
      surfacing rather than leaving for somebody to find one row at a time.
    */
    missingId: rows.filter((r) => !r.beneficiaryIdNo?.trim()).length,
  };
}
