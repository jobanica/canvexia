import "server-only";
import { pharmacyDb } from "@/server/tenancy/scoped-db";
import {
  buildCreditNote,
  type CreditNoteDocument,
} from "@/lib/pharmacy/credit-note";
import type { PharmacyIdentity } from "@/lib/pharmacy/receipt";
import type { DiscountType } from "@/lib/pharmacy/discount";

/**
 * A credit note, in one scoped read.
 *
 * The return items do not snapshot the product name or the lot — they point at
 * the SALE LINE, which does (D32). That is the same decision that lets a
 * restock go back to the lot it came from, and it means the document is
 * assembled by reading through `saleItem` rather than from the return alone.
 */
export async function creditNoteFor(
  pharmacyId: string,
  returnId: string,
): Promise<CreditNoteDocument | null> {
  return pharmacyDb(pharmacyId, async (tx) => {
    const pharmacy = await tx.pharmacy.findUnique({
      where: { id: pharmacyId },
      select: {
        name: true,
        displayName: true,
        address: true,
        phone: true,
        tin: true,
        fdaLtoNumber: true,
        prcLicenseNo: true,
        vatRatePct: true,
      },
    });
    if (!pharmacy) return null;

    const ret = await tx.pharmacyReturn.findUnique({
      where: { id: returnId },
      select: {
        returnNumber: true,
        createdAt: true,
        reason: true,
        refundMethod: true,
        totalCentavos: true,
        processedByStaffId: true,
        sale: {
          select: {
            receiptNumber: true,
            createdAt: true,
            subtotalCentavos: true,
            totalCentavos: true,
            vatExemptCentavos: true,
            discountType: true,
            beneficiaryIdNo: true,
            beneficiaryName: true,
          },
        },
        items: {
          orderBy: { createdAt: "asc" },
          select: {
            quantity: true,
            unitPriceCentavos: true,
            lineTotalCentavos: true,
            disposition: true,
            saleItem: {
              select: {
                nameAtTime: true,
                genericAtTime: true,
                lotNumberAtTime: true,
                expiryAtTime: true,
              },
            },
          },
        },
      },
    });
    if (!ret) return null;

    let processedBy: string | null = null;
    if (ret.processedByStaffId) {
      const staff = await tx.pharmacyStaff.findUnique({
        where: { id: ret.processedByStaffId },
        select: { displayName: true, email: true },
      });
      processedBy = staff?.displayName ?? staff?.email ?? null;
    }

    return buildCreditNote(pharmacy as PharmacyIdentity, {
      returnNumber: ret.returnNumber,
      createdAt: ret.createdAt,
      reason: ret.reason,
      refundMethod: ret.refundMethod,
      refundCentavos: ret.totalCentavos,
      processedBy,
      sale: { ...ret.sale, discountType: ret.sale.discountType as DiscountType },
      items: ret.items.map((i) => ({
        productName: i.saleItem.nameAtTime,
        generic: i.saleItem.genericAtTime,
        lotNumber: i.saleItem.lotNumberAtTime,
        expiry: i.saleItem.expiryAtTime,
        quantity: i.quantity,
        unitPriceCentavos: i.unitPriceCentavos,
        lineTotalCentavos: i.lineTotalCentavos,
        disposition: i.disposition,
      })),
    });
  });
}
