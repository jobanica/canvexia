import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { receiveDelivery } from "@/server/pharmacy/receiving";
import { completeSale } from "@/server/pharmacy/sale";
import { processReturn } from "@/server/pharmacy/reversal";
import { creditNoteFor } from "@/server/pharmacy/credit-note";
import { updatePharmacySettings } from "@/server/pharmacy/settings";

/**
 * The credit note against a real return.
 *
 * The pure tests cover the arithmetic. What only a database can show is that
 * the printed document agrees with the money actually handed back — and, on a
 * statutory sale, that it does not print the shelf price as the credit.
 *
 * Skips without DATABASE_URL. Must not run as a superuser.
 */
const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

const prisma = new PrismaClient();
type Tx = Prisma.TransactionClient;

function asSuper<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.is_super_admin', 'on', true)`;
    return fn(tx);
  });
}

const stamp = randomUUID().slice(0, 8);
const TODAY = new Date();
let partnerId = "";
let pharmacyId = "";
let otherPharmacyId = "";
let staffId = "";

async function stockUp(priceCentavos: number, quantity: number) {
  const product = await asSuper((tx) =>
    tx.pharmacyProduct.create({
      data: { pharmacyId, name: `Item ${randomUUID().slice(0, 6)}`, priceCentavos },
      select: { id: true },
    }),
  );
  await receiveDelivery({
    pharmacyId,
    actorStaffId: staffId,
    deliveryRef: randomUUID(),
    canCreateProducts: true,
    lines: [
      {
        productId: product.id,
        lotNumber: "LOT-CN",
        expiryDate: "2028-06-30",
        quantity,
        unitCostCentavos: Math.floor(priceCentavos / 2),
      },
    ],
  });
  return product.id;
}

d("the printed credit note", () => {
  beforeAll(async () => {
    partnerId = (
      await asSuper((tx) =>
        tx.partner.create({
          data: {
            name: `CN ${stamp}`,
            email: `cn-${stamp}@example.test`,
            status: "approved",
            tier: "operator",
            revenueSharePct: 70,
          },
          select: { id: true },
        }),
      )
    ).id;
    for (const [label, target] of [["cn", "main"], ["cnother", "other"]] as const) {
      const id = (
        await asSuper((tx) =>
          tx.pharmacy.create({
            data: {
              partnerId,
              name: `${label} ${stamp}`,
              slug: `${label}-${stamp}`,
              status: "active",
            },
            select: { id: true },
          }),
        )
      ).id;
      if (target === "main") pharmacyId = id;
      else otherPharmacyId = id;
    }
    staffId = (
      await asSuper((tx) =>
        tx.pharmacyStaff.create({
          data: {
            pharmacyId,
            authUserId: randomUUID(),
            email: `cn-${stamp}@example.test`,
            displayName: "Ana Cruz",
            role: "owner",
          },
          select: { id: true },
        }),
      )
    ).id;
    await updatePharmacySettings({
      pharmacyId,
      actorStaffId: staffId,
      displayName: null,
      address: "12 Quimpo Blvd, Davao City",
      phone: null,
      email: null,
      tin: "123-456-789-00000",
      fdaLtoNumber: "LTO-2026-0001",
      prcLicenseNo: "PRC-0012345",
      vatRatePct: 12,
    });
  });

  afterAll(async () => {
    await asSuper(async (tx) => {
      await tx.pharmacy.deleteMany({ where: { id: { in: [pharmacyId, otherPharmacyId] } } });
      await tx.partner.deleteMany({ where: { id: partnerId } });
    });
    await prisma.$disconnect();
  });

  it("credits what was refunded, and names the invoice it corrects", async () => {
    const pid = await stockUp(11200, 10);
    const sale = await completeSale({
      pharmacyId,
      lines: [{ productId: pid, quantity: 3 }],
      tenderedCentavos: 50000,
      soldByStaffId: staffId,
      asOf: TODAY,
    });
    if (!sale.ok) throw new Error("sale failed");

    const items = await asSuper((tx) =>
      tx.pharmacySaleItem.findMany({ where: { saleId: sale.saleId }, select: { id: true } }),
    );
    const ret = await processReturn({
      pharmacyId,
      saleId: sale.saleId,
      actorStaffId: staffId,
      reason: "Wrong item",
      refundMethod: "cash",
      canRestock: false,
      lines: [{ saleItemId: items[0].id, quantity: 1 }],
    });
    if (!ret.ok) throw new Error("return failed");

    const doc = (await creditNoteFor(pharmacyId, ret.returnId))!;
    expect(doc.returnNumber).toBe(ret.returnNumber);
    expect(doc.returnNumber).toMatch(/^CN\d{8}$/);
    expect(doc.correcting.receiptNumber).toBe(sale.receiptNumber);
    expect(doc.summary.at(-1)).toMatchObject({ kind: "due", centavos: 11200 });
    expect(doc.lines[0]).toMatchObject({
      lotNumber: "LOT-CN",
      quantity: 1,
      disposition: "destroyed",
    });
    expect(doc.processedBy).toBe("Ana Cruz");
    expect(doc.isOfficial).toBe(true);
  });

  it("does NOT credit the shelf price on a statutory sale", async () => {
    // The mirror of the receipt's ₱32 bug: ₱112 of goods come back and ₱80 goes
    // out, because ₱80 is what was paid. Crediting ₱112 would overstate every
    // statutory return by exactly the discount.
    const pid = await stockUp(11200, 10);
    const sale = await completeSale({
      pharmacyId,
      lines: [{ productId: pid, quantity: 1 }],
      discountType: "sc",
      beneficiaryIdNo: "SC-99887",
      beneficiaryName: "Rosario Dela Cruz",
      tenderedCentavos: 50000,
      soldByStaffId: staffId,
      asOf: TODAY,
    });
    if (!sale.ok) throw new Error("sale failed");
    expect(sale.totalCentavos).toBe(8000);

    const items = await asSuper((tx) =>
      tx.pharmacySaleItem.findMany({ where: { saleId: sale.saleId }, select: { id: true } }),
    );
    const ret = await processReturn({
      pharmacyId,
      saleId: sale.saleId,
      actorStaffId: staffId,
      reason: "Changed mind",
      refundMethod: "cash",
      canRestock: false,
      lines: [{ saleItemId: items[0].id, quantity: 1 }],
    });
    if (!ret.ok) throw new Error("return failed");

    const doc = (await creditNoteFor(pharmacyId, ret.returnId))!;

    // Goods at shelf price, the discount deducted, the refund credited.
    expect(doc.summary[0].centavos).toBe(11200);
    expect(doc.summary[1]).toMatchObject({ kind: "deduction", centavos: 3200 });
    expect(doc.summary.at(-1)!.centavos).toBe(8000);

    // The credit is exempt in full, mirroring the sale — reclaiming VAT that
    // was never charged would understate the return.
    expect(doc.vat).toMatchObject({ vatCentavos: 0, vatExemptCentavos: 8000 });
    expect(doc.beneficiary).toMatchObject({ idNo: "SC-99887", name: "Rosario Dela Cruz" });
  });

  it("records a restock as returned to stock", async () => {
    const pid = await stockUp(5000, 10);
    const sale = await completeSale({
      pharmacyId,
      lines: [{ productId: pid, quantity: 2 }],
      tenderedCentavos: 50000,
      soldByStaffId: staffId,
      asOf: TODAY,
    });
    if (!sale.ok) throw new Error("sale failed");
    const items = await asSuper((tx) =>
      tx.pharmacySaleItem.findMany({ where: { saleId: sale.saleId }, select: { id: true } }),
    );
    const ret = await processReturn({
      pharmacyId,
      saleId: sale.saleId,
      actorStaffId: staffId,
      reason: "Never left the counter",
      refundMethod: "gcash",
      canRestock: true,
      lines: [{ saleItemId: items[0].id, quantity: 1, restock: true }],
    });
    if (!ret.ok) throw new Error("return failed");

    const doc = (await creditNoteFor(pharmacyId, ret.returnId))!;
    expect(doc.lines[0].disposition).toBe("restocked");
    expect(doc.refundMethod).toBe("gcash");
  });

  it("will not hand another pharmacy's credit note over", async () => {
    const pid = await stockUp(2500, 5);
    const sale = await completeSale({
      pharmacyId,
      lines: [{ productId: pid, quantity: 1 }],
      tenderedCentavos: 2500,
      asOf: TODAY,
    });
    if (!sale.ok) throw new Error("sale failed");
    const items = await asSuper((tx) =>
      tx.pharmacySaleItem.findMany({ where: { saleId: sale.saleId }, select: { id: true } }),
    );
    const ret = await processReturn({
      pharmacyId,
      saleId: sale.saleId,
      actorStaffId: staffId,
      reason: "x",
      refundMethod: "cash",
      canRestock: false,
      lines: [{ saleItemId: items[0].id, quantity: 1 }],
    });
    if (!ret.ok) throw new Error("return failed");

    expect(await creditNoteFor(otherPharmacyId, ret.returnId)).toBeNull();
  });
});
