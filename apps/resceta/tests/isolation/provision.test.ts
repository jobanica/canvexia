import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { rescetaAdapter } from "@/server/products/resceta-adapter";
import { completeSale } from "@/server/pharmacy/sale";

/**
 * Provisioning through the real adapter, against a real database.
 *
 * THIS IS THE GATE on `live: true` in the product registry. The unit tests
 * cover the adapter's shape with `provisionPharmacy` mocked; what only a
 * database can show is that the real one creates a pharmacy the partner
 * actually owns, visible to that partner through RLS rather than through a
 * where clause someone remembered.
 *
 * `adding-a-vertical.md` asks for exactly three things before the flag flips,
 * and they are the first three tests below.
 *
 * Skips without DATABASE_URL. Must NOT run as a superuser: a superuser bypasses
 * RLS regardless of FORCE and every assertion would pass for the wrong reason.
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

function asPartner<T>(partnerId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `select set_config('role', 'app_user', true),` +
        ` set_config('app.current_partner_id', '${partnerId}', true)`,
    );
    return fn(tx);
  });
}

const stamp = randomUUID().slice(0, 8);
let ownerPartner = "";
let rivalPartner = "";
let provisioned = { merchantId: "", slug: "" };

d("provisioning a pharmacy through the real adapter", () => {
  beforeAll(async () => {
    await asSuper(async (tx) => {
      const mk = async (label: string) =>
        (
          await tx.partner.create({
            data: {
              name: `Prov ${label} ${stamp}`,
              email: `prov-${label}-${stamp}@example.test`,
              status: "approved",
              tier: "operator",
              revenueSharePct: 70,
            },
            select: { id: true },
          })
        ).id;
      ownerPartner = await mk("owner");
      rivalPartner = await mk("rival");
    });

    provisioned = await rescetaAdapter.provisionMerchant({
      partnerId: ownerPartner,
      name: `Botica ${stamp}`,
      address: "Davao City",
      phone: "+63 82 000 0000",
      extra: { fdaLtoNumber: "LTO-TEST-1", prcLicenseNo: "PRC-TEST-1" },
    });
  });

  afterAll(async () => {
    await asSuper(async (tx) => {
      if (provisioned.merchantId) {
        await tx.pharmacy.deleteMany({ where: { id: provisioned.merchantId } });
      }
      await tx.auditLog.deleteMany({
        where: { partnerId: { in: [ownerPartner, rivalPartner] } },
      });
      await tx.partner.deleteMany({ where: { id: { in: [ownerPartner, rivalPartner] } } });
    });
    await prisma.$disconnect();
  });

  // 1 of 3.
  it("creates a pharmacy owned by the right partner", async () => {
    const row = await asSuper((tx) =>
      tx.pharmacy.findUnique({
        where: { id: provisioned.merchantId },
        select: { partnerId: true, slug: true, status: true, fdaLtoNumber: true },
      }),
    );
    expect(row?.partnerId).toBe(ownerPartner);
    expect(row?.slug).toBe(provisioned.slug);
    // Pending, not active: it cannot legally dispense before its licence is on
    // file, and defaulting to active would mean the platform enabled it.
    expect(row?.status).toBe("pending");
    expect(row?.fdaLtoNumber).toBe("LTO-TEST-1");
  });

  // 2 of 3.
  it("is visible to that partner through RLS, with NO where clause", async () => {
    const rows = await asPartner(ownerPartner, (tx) =>
      tx.pharmacy.findMany({ select: { id: true } }),
    );
    expect(rows.map((r) => r.id)).toEqual([provisioned.merchantId]);
  });

  // 3 of 3.
  it("is invisible to any other partner, even by primary key", async () => {
    const list = await asPartner(rivalPartner, (tx) =>
      tx.pharmacy.findMany({ select: { id: true } }),
    );
    expect(list).toEqual([]);

    const byId = await asPartner(rivalPartner, (tx) =>
      tx.pharmacy.findUnique({
        where: { id: provisioned.merchantId },
        select: { id: true },
      }),
    );
    expect(byId).toBeNull();
  });

  it("writes an audit row naming the partner that did it", async () => {
    const log = await asSuper((tx) =>
      tx.auditLog.findFirst({
        where: { entityId: provisioned.merchantId, action: "pharmacy.provision" },
        select: { partnerId: true, actorType: true },
      }),
    );
    expect(log?.partnerId).toBe(ownerPartner);
    expect(log?.actorType).toBe("partner");
  });

  it("assigns a distinct slug when two pharmacies share a name", async () => {
    const second = await rescetaAdapter.provisionMerchant({
      partnerId: rivalPartner,
      name: `Botica ${stamp}`,
    });
    expect(second.slug).not.toBe(provisioned.slug);
    await asSuper((tx) => tx.pharmacy.deleteMany({ where: { id: second.merchantId } }));
  });

  it("dispenses FEFO and takes the stock off the right batch", async () => {
    // The sale path end to end, against a real database rather than a mock:
    // two batches of one product, the newer delivery expiring sooner.
    const { productId, sooner, later } = await asSuper(async (tx) => {
      const product = await tx.pharmacyProduct.create({
        data: {
          pharmacyId: provisioned.merchantId,
          name: `Biogesic ${stamp}`,
          genericName: "Paracetamol",
          priceCentavos: 11200,
        },
        select: { id: true },
      });
      const mkBatch = async (lot: string, expiry: string, received: string, qty: number) =>
        (
          await tx.pharmacyBatch.create({
            data: {
              pharmacyId: provisioned.merchantId,
              productId: product.id,
              lotNumber: lot,
              expiryDate: new Date(expiry),
              receivedAt: new Date(received),
              quantity: qty,
              costCentavos: 5000,
            },
            select: { id: true },
          })
        ).id;
      return {
        productId: product.id,
        // Received LATER, expires SOONER — the case FIFO gets wrong.
        sooner: await mkBatch("LOT-SOON", "2026-11-30", "2026-09-01", 2),
        later: await mkBatch("LOT-LATE", "2027-11-30", "2025-01-01", 10),
      };
    });

    const result = await completeSale({
      pharmacyId: provisioned.merchantId,
      lines: [{ productId, quantity: 3 }],
      discountType: "sc",
      beneficiaryIdNo: "SC-0001",
      tenderedCentavos: 100000,
      asOf: new Date("2026-09-14T09:00:00+08:00"),
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // 3 × ₱112.00 = ₱336.00; SC pays 3 × ₱80.00 = ₱240.00.
    expect(result.totalCentavos).toBe(24000);

    const batches = await asSuper((tx) =>
      tx.pharmacyBatch.findMany({
        where: { id: { in: [sooner, later] } },
        select: { id: true, quantity: true },
      }),
    );
    const qty = Object.fromEntries(batches.map((b) => [b.id, b.quantity]));
    expect(qty[sooner]).toBe(0); // drained first
    expect(qty[later]).toBe(9); // then one from the later batch

    // Two sale lines for one cart line, because two batches were touched —
    // which batch a unit came from is the recall trail.
    const items = await asSuper((tx) =>
      tx.pharmacySaleItem.findMany({
        where: { saleId: result.saleId },
        select: { lotNumberAtTime: true, quantity: true },
      }),
    );
    expect(items).toHaveLength(2);
    expect(items.find((i) => i.lotNumberAtTime === "LOT-SOON")?.quantity).toBe(2);
    expect(items.find((i) => i.lotNumberAtTime === "LOT-LATE")?.quantity).toBe(1);

    // And the stock ledger explains the balance.
    const movements = await asSuper((tx) =>
      tx.pharmacyStockMovement.findMany({
        where: { referenceId: result.saleId },
        select: { quantityDelta: true, type: true },
      }),
    );
    expect(movements.map((m) => m.type)).toEqual(["sale", "sale"]);
    expect(movements.reduce((s, m) => s + m.quantityDelta, 0)).toBe(-3);
  });

  it("allocates gapless receipt numbers", async () => {
    const before = await asSuper((tx) =>
      tx.pharmacySale.findMany({
        where: { pharmacyId: provisioned.merchantId },
        select: { receiptNumber: true },
        orderBy: { receiptNumber: "asc" },
      }),
    );
    const numbers = before.map((s) => Number(s.receiptNumber));
    expect(numbers).toEqual(numbers.map((_, i) => numbers[0] + i));
  });
});
