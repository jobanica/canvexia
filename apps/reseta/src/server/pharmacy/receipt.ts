import "server-only";
import { pharmacyDb } from "@/server/tenancy/scoped-db";
import {
  buildReceipt,
  type ReceiptDocument,
  type PharmacyIdentity,
} from "@/lib/pharmacy/receipt";
import type { DiscountType } from "@/lib/pharmacy/discount";

/**
 * Everything the printed receipt needs, in one scoped read.
 *
 * Scoped, so another pharmacy's receipt number is simply not found — which is
 * the answer that matters here more than on most screens. A receipt names a
 * customer's medicines, their lot numbers, and on a statutory sale their ID
 * number and their name. It is the most personal document this system prints.
 *
 * `soldByStaffId` has no relation on the model, so the dispenser is looked up
 * separately — and by id WITHIN the scope, so a stale id belonging to someone
 * else's staff row resolves to nothing rather than to a name.
 */
export async function receiptFor(
  pharmacyId: string,
  saleId: string,
): Promise<ReceiptDocument | null> {
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

    const sale = await tx.pharmacySale.findUnique({
      where: { id: saleId },
      select: {
        receiptNumber: true,
        createdAt: true,
        status: true,
        subtotalCentavos: true,
        discountCentavos: true,
        totalCentavos: true,
        vatExemptCentavos: true,
        discountType: true,
        beneficiaryIdNo: true,
        beneficiaryName: true,
        paymentMethod: true,
        tenderedCentavos: true,
        changeCentavos: true,
        prescriptionRef: true,
        soldByStaffId: true,
        items: {
          orderBy: { createdAt: "asc" },
          select: {
            nameAtTime: true,
            genericAtTime: true,
            lotNumberAtTime: true,
            expiryAtTime: true,
            quantity: true,
            unitPriceCentavos: true,
            lineTotalCentavos: true,
          },
        },
      },
    });
    if (!sale) return null;

    let soldBy: string | null = null;
    if (sale.soldByStaffId) {
      const staff = await tx.pharmacyStaff.findUnique({
        where: { id: sale.soldByStaffId },
        select: { displayName: true, email: true },
      });
      soldBy = staff?.displayName ?? staff?.email ?? null;
    }

    return buildReceipt(pharmacy as PharmacyIdentity, {
      ...sale,
      discountType: sale.discountType as DiscountType,
      soldBy,
    });
  });
}
