import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { receiveDelivery } from "@/server/pharmacy/receiving";
import { completeSale } from "@/server/pharmacy/sale";
import { voidSale, processReturn } from "@/server/pharmacy/reversal";
import { catalogue } from "@/server/pharmacy/queries";

/**
 * Voids and returns against a real database.
 *
 * The pure tests cover the rules. What only a database can show is that a
 * reversal moves stock back to the RIGHT batch, writes the movement that
 * explains it, and never lets the same units be given back twice.
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
let staffId = "";
let productId = "";

/** A product with two batches, the newer one expiring sooner. */
async function stockUp(qtySoon: number, qtyLater: number) {
  const product = await asSuper((tx) =>
    tx.pharmacyProduct.create({
      data: { pharmacyId, name: `Item ${randomUUID().slice(0, 6)}`, priceCentavos: 11200 },
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
        lotNumber: "SOON",
        expiryDate: "2027-01-31",
        quantity: qtySoon,
        unitCostCentavos: 600,
      },
      {
        productId: product.id,
        lotNumber: "LATER",
        expiryDate: "2028-01-31",
        quantity: qtyLater,
        unitCostCentavos: 800,
      },
    ],
  });
  return product.id;
}

d("voids and returns", () => {
  beforeAll(async () => {
    await asSuper(async (tx) => {
      partnerId = (
        await tx.partner.create({
          data: {
            name: `Rev ${stamp}`,
            email: `rev-${stamp}@example.test`,
            status: "approved",
            tier: "operator",
            revenueSharePct: 70,
          },
          select: { id: true },
        })
      ).id;
      pharmacyId = (
        await tx.pharmacy.create({
          data: {
            partnerId,
            name: `Rev Botica ${stamp}`,
            slug: `rev-botica-${stamp}`,
            status: "active",
          },
          select: { id: true },
        })
      ).id;
      staffId = (
        await tx.pharmacyStaff.create({
          data: {
            pharmacyId,
            authUserId: randomUUID(),
            email: `rev-${stamp}@example.test`,
            role: "manager",
          },
          select: { id: true },
        })
      ).id;
    });
    productId = await stockUp(5, 10);
  });

  afterAll(async () => {
    await asSuper(async (tx) => {
      await tx.pharmacy.deleteMany({ where: { id: pharmacyId } });
      await tx.partner.deleteMany({ where: { id: partnerId } });
    });
    await prisma.$disconnect();
  });

  describe("voiding", () => {
    it("puts every unit back in the batch it LEFT, not the newest one", async () => {
      const pid = await stockUp(3, 10);
      // 5 units: drains SOON (3), then 2 from LATER.
      const sale = await completeSale({
        pharmacyId,
        lines: [{ productId: pid, quantity: 5 }],
        tenderedCentavos: 100000,
        asOf: TODAY,
      });
      expect(sale.ok).toBe(true);
      if (!sale.ok) return;

      const result = await voidSale({
        pharmacyId,
        saleId: sale.saleId,
        actorStaffId: staffId,
        reason: "Rung up twice",
        asOf: TODAY,
      });
      expect(result).toMatchObject({ ok: true, unitsRestored: 5 });

      const batches = await asSuper((tx) =>
        tx.pharmacyBatch.findMany({
          where: { productId: pid },
          select: { lotNumber: true, quantity: true },
        }),
      );
      const q = Object.fromEntries(batches.map((b) => [b.lotNumber, b.quantity]));
      // Exactly back where it started. Restocking into the newest batch — which
      // is what the system this was derived from does — would have left SOON on
      // 0 and LATER on 13.
      expect(q).toEqual({ SOON: 3, LATER: 10 });

      const moves = await asSuper((tx) =>
        tx.pharmacyStockMovement.findMany({
          where: { referenceId: sale.saleId, type: "void" },
          select: { quantityDelta: true, reason: true },
        }),
      );
      expect(moves.reduce((s, m) => s + m.quantityDelta, 0)).toBe(5);
      expect(moves[0].reason).toContain("Rung up twice");
    });

    it("marks the sale voided and keeps its figures as printed", async () => {
      const pid = await stockUp(2, 2);
      const sale = await completeSale({
        pharmacyId,
        lines: [{ productId: pid, quantity: 1 }],
        tenderedCentavos: 100000,
        asOf: TODAY,
      });
      if (!sale.ok) return;
      await voidSale({ pharmacyId, saleId: sale.saleId, actorStaffId: staffId, asOf: TODAY });

      const row = await asSuper((tx) =>
        tx.pharmacySale.findUnique({
          where: { id: sale.saleId },
          select: { status: true, voidedAt: true, voidedByStaffId: true, totalCentavos: true },
        }),
      );
      expect(row?.status).toBe("voided");
      expect(row?.voidedByStaffId).toBe(staffId);
      // The receipt still says what it said. A void is a status, not an edit.
      expect(row?.totalCentavos).toBe(11200);
    });

    it("refuses to void the same sale twice", async () => {
      const pid = await stockUp(2, 2);
      const sale = await completeSale({
        pharmacyId,
        lines: [{ productId: pid, quantity: 1 }],
        tenderedCentavos: 100000,
        asOf: TODAY,
      });
      if (!sale.ok) return;
      await voidSale({ pharmacyId, saleId: sale.saleId, actorStaffId: staffId, asOf: TODAY });
      const second = await voidSale({
        pharmacyId,
        saleId: sale.saleId,
        actorStaffId: staffId,
        asOf: TODAY,
      });
      expect(second).toMatchObject({ ok: false, reason: "already_voided" });

      // And the stock was not put back twice.
      const total = await asSuper((tx) =>
        tx.pharmacyBatch.aggregate({ where: { productId: pid }, _sum: { quantity: true } }),
      );
      expect(total._sum.quantity).toBe(4);
    });

    it("refuses a sale from an earlier day", async () => {
      const pid = await stockUp(2, 2);
      const sale = await completeSale({
        pharmacyId,
        lines: [{ productId: pid, quantity: 1 }],
        tenderedCentavos: 100000,
        asOf: TODAY,
      });
      if (!sale.ok) return;
      const tomorrow = new Date(TODAY.getTime() + 36 * 60 * 60 * 1000);
      const result = await voidSale({
        pharmacyId,
        saleId: sale.saleId,
        actorStaffId: staffId,
        asOf: tomorrow,
      });
      expect(result).toMatchObject({ ok: false, reason: "day_closed" });
    });
  });

  describe("returning", () => {
    it("writes a credit note WITHOUT putting medicine back on the shelf", async () => {
      const pid = await stockUp(4, 4);
      const sale = await completeSale({
        pharmacyId,
        lines: [{ productId: pid, quantity: 3 }],
        tenderedCentavos: 100000,
        asOf: TODAY,
      });
      if (!sale.ok) return;

      const items = await asSuper((tx) =>
        tx.pharmacySaleItem.findMany({
          where: { saleId: sale.saleId },
          select: { id: true, quantity: true },
        }),
      );

      const before = await asSuper((tx) =>
        tx.pharmacyBatch.aggregate({ where: { productId: pid }, _sum: { quantity: true } }),
      );

      const result = await processReturn({
        pharmacyId,
        saleId: sale.saleId,
        actorStaffId: staffId,
        canRestock: true,
        lines: [{ saleItemId: items[0].id, quantity: 2 }],
        reason: "Customer changed mind",
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.returnNumber).toMatch(/^CN\d{8}$/);
      expect(result.unitsDestroyed).toBe(2);
      expect(result.unitsRestocked).toBe(0);

      // THE DEFAULT: a dispensed medicine does not go back on the shelf.
      const after = await asSuper((tx) =>
        tx.pharmacyBatch.aggregate({ where: { productId: pid }, _sum: { quantity: true } }),
      );
      expect(after._sum.quantity).toBe(before._sum.quantity);

      // But the ledger still records that it moved.
      const moves = await asSuper((tx) =>
        tx.pharmacyStockMovement.findMany({
          where: { referenceId: result.returnId },
          select: { type: true, quantityDelta: true, reason: true },
        }),
      );
      expect(moves[0]).toMatchObject({ type: "return", quantityDelta: 0 });
      expect(moves[0].reason).toMatch(/not resaleable/i);
    });

    it("restocks into the ORIGINAL lot when someone explicitly asks", async () => {
      const pid = await stockUp(3, 10);
      const sale = await completeSale({
        pharmacyId,
        lines: [{ productId: pid, quantity: 3 }],
        tenderedCentavos: 100000,
        asOf: TODAY,
      });
      if (!sale.ok) return;
      const items = await asSuper((tx) =>
        tx.pharmacySaleItem.findMany({
          where: { saleId: sale.saleId },
          select: { id: true, lotNumberAtTime: true, quantity: true },
        }),
      );
      const soonLine = items.find((i) => i.lotNumberAtTime === "SOON")!;

      const result = await processReturn({
        pharmacyId,
        saleId: sale.saleId,
        actorStaffId: staffId,
        canRestock: true,
        lines: [{ saleItemId: soonLine.id, quantity: 2, restock: true }],
      });
      expect(result).toMatchObject({ ok: true, unitsRestocked: 2, unitsDestroyed: 0 });

      const batches = await asSuper((tx) =>
        tx.pharmacyBatch.findMany({
          where: { productId: pid },
          select: { lotNumber: true, quantity: true },
        }),
      );
      const q = Object.fromEntries(batches.map((b) => [b.lotNumber, b.quantity]));
      // Back into SOON, the lot it came from — NOT into LATER, which is what
      // "restock to the newest batch" would have done. A recall names a lot.
      expect(q.SOON).toBe(2);
      expect(q.LATER).toBe(10);
    });

    it("refuses to restock for a caller without the stock permission", async () => {
      const pid = await stockUp(2, 2);
      const sale = await completeSale({
        pharmacyId,
        lines: [{ productId: pid, quantity: 1 }],
        tenderedCentavos: 100000,
        asOf: TODAY,
      });
      if (!sale.ok) return;
      const item = await asSuper((tx) =>
        tx.pharmacySaleItem.findFirst({ where: { saleId: sale.saleId }, select: { id: true } }),
      );
      const result = await processReturn({
        pharmacyId,
        saleId: sale.saleId,
        actorStaffId: staffId,
        canRestock: false,
        lines: [{ saleItemId: item!.id, quantity: 1, restock: true }],
      });
      expect(result).toMatchObject({ ok: false, reason: "cannot_restock" });
    });

    it("will not give the same units back twice", async () => {
      const pid = await stockUp(5, 5);
      const sale = await completeSale({
        pharmacyId,
        lines: [{ productId: pid, quantity: 4 }],
        tenderedCentavos: 100000,
        asOf: TODAY,
      });
      if (!sale.ok) return;
      const item = await asSuper((tx) =>
        tx.pharmacySaleItem.findFirst({
          where: { saleId: sale.saleId },
          select: { id: true, quantity: true },
        }),
      );

      const first = await processReturn({
        pharmacyId,
        saleId: sale.saleId,
        actorStaffId: staffId,
        canRestock: true,
        lines: [{ saleItemId: item!.id, quantity: item!.quantity }],
      });
      expect(first.ok).toBe(true);

      const second = await processReturn({
        pharmacyId,
        saleId: sale.saleId,
        actorStaffId: staffId,
        canRestock: true,
        lines: [{ saleItemId: item!.id, quantity: 1 }],
      });
      expect(second).toMatchObject({ ok: false, reason: "invalid" });
    });

    it("refunds the DISCOUNTED amount on an SC sale, not the shelf price", async () => {
      const pid = await stockUp(4, 4);
      const sale = await completeSale({
        pharmacyId,
        lines: [{ productId: pid, quantity: 2 }],
        discountType: "sc",
        beneficiaryIdNo: "SC-9",
        tenderedCentavos: 100000,
        asOf: TODAY,
      });
      if (!sale.ok) return;
      // 2 × ₱112 shelf; SC pays 2 × ₱80 = ₱160.
      expect(sale.totalCentavos).toBe(16000);

      const item = await asSuper((tx) =>
        tx.pharmacySaleItem.findFirst({ where: { saleId: sale.saleId }, select: { id: true } }),
      );
      const result = await processReturn({
        pharmacyId,
        saleId: sale.saleId,
        actorStaffId: staffId,
        canRestock: true,
        lines: [{ saleItemId: item!.id, quantity: 1 }],
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // ₱80, not ₱112. Refunding the shelf price on every SC/PWD return is a
      // systematic overpayment, and every SC/PWD sale is discounted.
      expect(result.refundCentavos).toBe(8000);
    });

    it("refuses a return against a voided sale", async () => {
      const pid = await stockUp(2, 2);
      const sale = await completeSale({
        pharmacyId,
        lines: [{ productId: pid, quantity: 1 }],
        tenderedCentavos: 100000,
        asOf: TODAY,
      });
      if (!sale.ok) return;
      const item = await asSuper((tx) =>
        tx.pharmacySaleItem.findFirst({ where: { saleId: sale.saleId }, select: { id: true } }),
      );
      await voidSale({ pharmacyId, saleId: sale.saleId, actorStaffId: staffId, asOf: TODAY });

      const result = await processReturn({
        pharmacyId,
        saleId: sale.saleId,
        actorStaffId: staffId,
        canRestock: true,
        lines: [{ saleItemId: item!.id, quantity: 1 }],
      });
      expect(result).toMatchObject({ ok: false, reason: "sale_voided" });
    });

    it("blocks a void once a credit note exists — the money is not given back twice", async () => {
      const pid = await stockUp(3, 3);
      const sale = await completeSale({
        pharmacyId,
        lines: [{ productId: pid, quantity: 2 }],
        tenderedCentavos: 100000,
        asOf: TODAY,
      });
      if (!sale.ok) return;
      const item = await asSuper((tx) =>
        tx.pharmacySaleItem.findFirst({ where: { saleId: sale.saleId }, select: { id: true } }),
      );
      await processReturn({
        pharmacyId,
        saleId: sale.saleId,
        actorStaffId: staffId,
        canRestock: true,
        lines: [{ saleItemId: item!.id, quantity: 1 }],
      });
      const result = await voidSale({
        pharmacyId,
        saleId: sale.saleId,
        actorStaffId: staffId,
        asOf: TODAY,
      });
      expect(result).toMatchObject({ ok: false, reason: "has_returns" });
    });

    it("allocates gapless credit-note numbers, in their own series", async () => {
      const notes = await asSuper((tx) =>
        tx.pharmacyReturn.findMany({
          where: { pharmacyId },
          select: { returnNumber: true },
          orderBy: { returnNumber: "asc" },
        }),
      );
      const numbers = notes.map((n) => Number(n.returnNumber.replace("CN", "")));
      expect(numbers.length).toBeGreaterThan(1);
      expect(numbers).toEqual(numbers.map((_, i) => numbers[0] + i));
      // And the receipt series is untouched by them.
      const receipts = await asSuper((tx) =>
        tx.pharmacySale.findMany({
          where: { pharmacyId },
          select: { receiptNumber: true },
          orderBy: { receiptNumber: "asc" },
        }),
      );
      const rNums = receipts.map((r) => Number(r.receiptNumber));
      expect(rNums).toEqual(rNums.map((_, i) => rNums[0] + i));
    });
  });

  it("leaves on-hand consistent with the movement ledger throughout", async () => {
    // The batch quantity is the balance; the movements are the statement that
    // explains it. A reversal that touched one without the other would show up
    // exactly here.
    const stock = await catalogue(pharmacyId, TODAY);
    for (const product of stock) {
      const moves = await asSuper((tx) =>
        tx.pharmacyStockMovement.aggregate({
          where: { productId: product.id },
          _sum: { quantityDelta: true },
        }),
      );
      const onHandFromLedger = moves._sum.quantityDelta ?? 0;
      const batches = await asSuper((tx) =>
        tx.pharmacyBatch.aggregate({
          where: { productId: product.id },
          _sum: { quantity: true },
        }),
      );
      expect(batches._sum.quantity).toBe(onHandFromLedger);
    }
  });
});
