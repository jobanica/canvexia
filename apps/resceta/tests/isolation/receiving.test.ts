import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { receiveDelivery } from "@/server/pharmacy/receiving";
import { completeSale } from "@/server/pharmacy/sale";
import { catalogue } from "@/server/pharmacy/queries";

/**
 * Receiving, against a real database.
 *
 * The pure tests cover which lines are refused. What only a database can show
 * is that a delivery lands as batches AND movements together, that the same
 * delivery cannot land twice, and that what was received is then what FEFO
 * dispenses.
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
let partnerId = "";
let pharmacyId = "";
let staffId = "";
let existingProduct = "";

d("receiving a delivery", () => {
  beforeAll(async () => {
    await asSuper(async (tx) => {
      partnerId = (
        await tx.partner.create({
          data: {
            name: `Recv ${stamp}`,
            email: `recv-${stamp}@example.test`,
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
            name: `Recv Botica ${stamp}`,
            slug: `recv-botica-${stamp}`,
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
            email: `recv-${stamp}@example.test`,
            role: "manager",
          },
          select: { id: true },
        })
      ).id;
      existingProduct = (
        await tx.pharmacyProduct.create({
          data: { pharmacyId, name: `Amoxil ${stamp}`, priceCentavos: 2500 },
          select: { id: true },
        })
      ).id;
    });
  });

  afterAll(async () => {
    await asSuper(async (tx) => {
      await tx.pharmacy.deleteMany({ where: { id: pharmacyId } });
      await tx.partner.deleteMany({ where: { id: partnerId } });
    });
    await prisma.$disconnect();
  });

  it("creates a batch AND the movement that explains it, in one go", async () => {
    const ref = randomUUID();
    const result = await receiveDelivery({
      pharmacyId,
      actorStaffId: staffId,
      deliveryRef: ref,
      canCreateProducts: true,
      reference: "DR-1001",
      newSupplierName: `Supplier ${stamp}`,
      lines: [
        {
          productId: existingProduct,
          lotNumber: "LOT-A",
          expiryDate: "2027-06-30",
          quantity: 24,
          unitCostCentavos: 1200,
        },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result).toMatchObject({ batchesCreated: 1, unitsReceived: 24 });

    const batches = await asSuper((tx) =>
      tx.pharmacyBatch.findMany({
        where: { pharmacyId },
        select: { id: true, quantity: true, lotNumber: true, supplierId: true },
      }),
    );
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({ quantity: 24, lotNumber: "LOT-A" });
    // The supplier named on the delivery was created and attached.
    expect(batches[0].supplierId).toBeTruthy();

    const movements = await asSuper((tx) =>
      tx.pharmacyStockMovement.findMany({
        where: { referenceId: ref },
        select: { type: true, quantityDelta: true, reason: true, actorStaffId: true },
      }),
    );
    expect(movements).toEqual([
      expect.objectContaining({
        type: "receive",
        quantityDelta: 24,
        reason: "Delivery DR-1001",
        actorStaffId: staffId,
      }),
    ]);
  });

  it("refuses the SAME delivery twice — a second click must not double the stock", async () => {
    const ref = randomUUID();
    const payload = {
      pharmacyId,
      actorStaffId: staffId,
      deliveryRef: ref,
      canCreateProducts: true,
      lines: [
        {
          productId: existingProduct,
          lotNumber: "LOT-DUPE",
          expiryDate: "2027-06-30",
          quantity: 10,
          unitCostCentavos: 1000,
        },
      ],
    };

    const first = await receiveDelivery(payload);
    expect(first.ok).toBe(true);

    const second = await receiveDelivery(payload);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe("already_received");

    const batches = await asSuper((tx) =>
      tx.pharmacyBatch.count({ where: { pharmacyId, lotNumber: "LOT-DUPE" } }),
    );
    expect(batches).toBe(1);
  });

  it("writes nothing at all when a line is invalid", async () => {
    const before = await asSuper((tx) => tx.pharmacyBatch.count({ where: { pharmacyId } }));
    const result = await receiveDelivery({
      pharmacyId,
      actorStaffId: staffId,
      deliveryRef: randomUUID(),
      canCreateProducts: true,
      lines: [
        {
          productId: existingProduct,
          lotNumber: "GOOD",
          expiryDate: "2027-06-30",
          quantity: 5,
          unitCostCentavos: 100,
        },
        // Already expired: the whole delivery is refused, not just this line.
        {
          productId: existingProduct,
          lotNumber: "BAD",
          expiryDate: "2020-01-01",
          quantity: 5,
          unitCostCentavos: 100,
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid");
    const after = await asSuper((tx) => tx.pharmacyBatch.count({ where: { pharmacyId } }));
    expect(after).toBe(before);
  });

  it("refuses to create a product for a caller who may not manage the catalogue", async () => {
    const result = await receiveDelivery({
      pharmacyId,
      actorStaffId: staffId,
      deliveryRef: randomUUID(),
      canCreateProducts: false,
      lines: [
        {
          productId: null,
          newProductName: `Neozep ${stamp}`,
          newProductPriceCentavos: 800,
          lotNumber: "LOT-NEW",
          expiryDate: "2027-06-30",
          quantity: 12,
          unitCostCentavos: 400,
        },
      ],
    });
    expect(result).toMatchObject({ ok: false, reason: "needs_catalogue_permission" });
  });

  it("creates the product when the caller may, and prices it", async () => {
    const result = await receiveDelivery({
      pharmacyId,
      actorStaffId: staffId,
      deliveryRef: randomUUID(),
      canCreateProducts: true,
      lines: [
        {
          productId: null,
          newProductName: `Neozep ${stamp}`,
          newProductPriceCentavos: 800,
          lotNumber: "LOT-NEW",
          expiryDate: "2027-06-30",
          quantity: 12,
          unitCostCentavos: 400,
        },
      ],
    });
    expect(result.ok).toBe(true);

    const product = await asSuper((tx) =>
      tx.pharmacyProduct.findFirst({
        where: { pharmacyId, name: `Neozep ${stamp}` },
        select: { priceCentavos: true },
      }),
    );
    expect(product?.priceCentavos).toBe(800);
  });

  it("keeps two deliveries of the same lot as two batches", async () => {
    // Same lot, different cost. Merging would flatten both and the older
    // batch's margin would quietly become the newer one's.
    const mk = (cost: number) =>
      receiveDelivery({
        pharmacyId,
        actorStaffId: staffId,
        deliveryRef: randomUUID(),
        canCreateProducts: true,
        lines: [
          {
            productId: existingProduct,
            lotNumber: "LOT-SAME",
            expiryDate: "2027-08-31",
            quantity: 5,
            unitCostCentavos: cost,
          },
        ],
      });
    expect((await mk(1000)).ok).toBe(true);
    expect((await mk(1400)).ok).toBe(true);

    const batches = await asSuper((tx) =>
      tx.pharmacyBatch.findMany({
        where: { pharmacyId, lotNumber: "LOT-SAME" },
        select: { costCentavos: true },
        orderBy: { costCentavos: "asc" },
      }),
    );
    expect(batches.map((b) => b.costCentavos)).toEqual([1000, 1400]);
  });

  it("hands received stock straight to FEFO, which dispenses the soonest expiry", async () => {
    const ref = randomUUID();
    const product = await asSuper((tx) =>
      tx.pharmacyProduct.create({
        data: { pharmacyId, name: `Cetirizine ${stamp}`, priceCentavos: 1500 },
        select: { id: true },
      }),
    );

    await receiveDelivery({
      pharmacyId,
      actorStaffId: staffId,
      deliveryRef: ref,
      canCreateProducts: true,
      lines: [
        {
          productId: product.id,
          lotNumber: "LATER",
          expiryDate: "2028-01-31",
          quantity: 10,
          unitCostCentavos: 700,
        },
        {
          productId: product.id,
          lotNumber: "SOONER",
          expiryDate: "2026-12-31",
          quantity: 3,
          unitCostCentavos: 650,
        },
      ],
    });

    // On hand is what was received, from the batches, computed on read.
    const stock = await catalogue(pharmacyId, new Date("2026-09-14T09:00:00+08:00"));
    expect(stock.find((p) => p.id === product.id)?.onHand).toBe(13);

    const sale = await completeSale({
      pharmacyId,
      lines: [{ productId: product.id, quantity: 4 }],
      tenderedCentavos: 100000,
      asOf: new Date("2026-09-14T09:00:00+08:00"),
    });
    expect(sale.ok).toBe(true);
    if (!sale.ok) return;

    const items = await asSuper((tx) =>
      tx.pharmacySaleItem.findMany({
        where: { saleId: sale.saleId },
        select: { lotNumberAtTime: true, quantity: true, unitCostCentavos: true },
      }),
    );
    // SOONER drained first, then the balance off LATER — and each line carries
    // the cost of the batch it actually came from.
    expect(items.find((i) => i.lotNumberAtTime === "SOONER")).toMatchObject({
      quantity: 3,
      unitCostCentavos: 650,
    });
    expect(items.find((i) => i.lotNumberAtTime === "LATER")).toMatchObject({
      quantity: 1,
      unitCostCentavos: 700,
    });
  });
});
