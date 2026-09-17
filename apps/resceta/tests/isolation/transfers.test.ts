import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { receiveDelivery } from "@/server/pharmacy/receiving";
import { createTransfer, receiveTransfer, cancelTransfer } from "@/server/pharmacy/transfers";
import { saveBranch } from "@/server/pharmacy/branches";
import { catalogue } from "@/server/pharmacy/queries";

/**
 * Transfers between branches, against a real database.
 *
 * The pure tests cover the shape of the rules. What only a database can show is
 * that stock LEAVES one branch and ARRIVES at the other as two separate events,
 * that the ledger balances across both, that the lot number and expiry survive
 * the journey, and that the partial unique index really does refuse a second
 * main branch.
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
let productId = "";
let mainBranchId = "";
let secondBranchId = "";

d("moving stock between branches", () => {
  beforeAll(async () => {
    await asSuper(async (tx) => {
      partnerId = (
        await tx.partner.create({
          data: {
            name: `Xfer ${stamp}`,
            email: `xfer-${stamp}@example.test`,
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
            name: `Xfer Botica ${stamp}`,
            slug: `xfer-botica-${stamp}`,
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
            email: `xfer-${stamp}@example.test`,
            role: "manager",
          },
          select: { id: true },
        })
      ).id;
      productId = (
        await tx.pharmacyProduct.create({
          data: { pharmacyId, name: `Biogesic ${stamp}`, priceCentavos: 800 },
          select: { id: true },
        })
      ).id;
      // Provisioning does not create one, so the test makes the main branch the
      // same way the migration did.
      mainBranchId = (
        await tx.pharmacyBranch.create({
          data: { pharmacyId, name: "Main Branch", isMain: true },
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

  it("opens a second branch, and refuses to make it a second main", async () => {
    const res = await saveBranch({
      pharmacyId,
      branchId: null,
      name: "Toril",
      address: "Toril, Davao City",
      phone: "0917 000 0000",
      isActive: true,
      actorStaffId: staffId,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    secondBranchId = res.id;

    const branches = await asSuper((tx) =>
      tx.pharmacyBranch.findMany({ where: { pharmacyId }, select: { isMain: true } }),
    );
    expect(branches).toHaveLength(2);
    // Exactly one main, enforced by a partial unique index. It is where every
    // null-branch row resolves and where every write falls back.
    expect(branches.filter((b) => b.isMain)).toHaveLength(1);

    // And the index, not just the app, is what holds.
    await expect(
      asSuper((tx) =>
        tx.pharmacyBranch.create({
          data: { pharmacyId, name: "Second main", isMain: true },
        }),
      ),
    ).rejects.toThrow();
  });

  it("takes stock off the source when it is sent, and does not credit the destination", async () => {
    const delivery = await receiveDelivery({
      pharmacyId,
      actorStaffId: staffId,
      deliveryRef: randomUUID(),
      canCreateProducts: false,
      branchId: mainBranchId,
      lines: [
        {
          productId,
          lotNumber: "LOT-XFER",
          expiryDate: "2028-01-31",
          quantity: 100,
          unitCostCentavos: 500,
        },
      ],
    });
    expect(delivery.ok).toBe(true);

    const [batch] = await asSuper((tx) =>
      tx.pharmacyBatch.findMany({
        where: { pharmacyId, branchId: mainBranchId },
        select: { id: true, quantity: true },
      }),
    );
    expect(batch!.quantity).toBe(100);

    const sent = await createTransfer({
      pharmacyId,
      fromBranchId: mainBranchId,
      toBranchId: secondBranchId,
      lines: [{ batchId: batch!.id, quantity: 40 }],
      notes: "Van run",
      actorStaffId: staffId,
    });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;
    expect(sent.units).toBe(40);

    const after = await asSuper((tx) =>
      tx.pharmacyBatch.findMany({
        where: { pharmacyId },
        select: { branchId: true, quantity: true },
      }),
    );
    // 60 left at the source, and NOTHING at the destination yet: the boxes are
    // in a van. Crediting the destination now is what would hide a shortfall.
    expect(after.filter((b) => b.branchId === mainBranchId)[0]!.quantity).toBe(60);
    expect(after.filter((b) => b.branchId === secondBranchId)).toHaveLength(0);

    const transfer = await asSuper((tx) =>
      tx.pharmacyStockTransfer.findFirst({
        where: { id: sent.id },
        select: {
          status: true,
          items: { select: { quantity: true, lotNumber: true, expiryDate: true } },
        },
      }),
    );
    expect(transfer!.status).toBe("in_transit");
    // The lot travels with the goods, copied onto the line.
    expect(transfer!.items[0]!.lotNumber).toBe("LOT-XFER");
    expect(transfer!.items[0]!.expiryDate).not.toBeNull();
  });

  it("puts it on the destination shelf when it is received, keeping lot and expiry", async () => {
    const pending = await asSuper((tx) =>
      tx.pharmacyStockTransfer.findFirst({
        where: { pharmacyId, status: "in_transit" },
        select: { id: true },
      }),
    );

    const got = await receiveTransfer({
      pharmacyId,
      transferId: pending!.id,
      actorStaffId: staffId,
    });
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.units).toBe(40);

    const arrived = await asSuper((tx) =>
      tx.pharmacyBatch.findFirst({
        where: { pharmacyId, branchId: secondBranchId },
        select: { quantity: true, lotNumber: true, expiryDate: true, costCentavos: true },
      }),
    );
    expect(arrived).toMatchObject({
      quantity: 40,
      lotNumber: "LOT-XFER",
      costCentavos: 500,
    });
    // The recall trail does not stop at the branch boundary.
    expect(arrived!.expiryDate?.toISOString().slice(0, 10)).toBe("2028-01-31");

    // Nothing was created or destroyed: 60 + 40 across two branches.
    const total = await asSuper((tx) =>
      tx.pharmacyBatch.aggregate({ where: { pharmacyId }, _sum: { quantity: true } }),
    );
    expect(total._sum.quantity).toBe(100);
  });

  it("explains itself in the ledger, on both sides", async () => {
    const moves = await asSuper((tx) =>
      tx.pharmacyStockMovement.findMany({
        where: { pharmacyId, reason: { in: ["Transferred out", "Transferred in"] } },
        select: { quantityDelta: true, branchId: true, reason: true },
      }),
    );
    expect(moves).toHaveLength(2);
    // Signed, and they cancel: the statement agrees with the balance.
    expect(moves.reduce((t, m) => t + m.quantityDelta, 0)).toBe(0);
    expect(moves.find((m) => m.reason === "Transferred out")!.branchId).toBe(mainBranchId);
    expect(moves.find((m) => m.reason === "Transferred in")!.branchId).toBe(secondBranchId);
  });

  it("shows each branch only its own stock, and the whole pharmacy when asked", async () => {
    const at = (b: { id: string; isMain: boolean } | null) =>
      catalogue(pharmacyId, new Date(), {
        branches: [],
        current: b as never,
        all: b === null,
        writeBranchId: b?.id ?? null,
        multi: true,
      });

    const main = await at({ id: mainBranchId, isMain: true });
    const second = await at({ id: secondBranchId, isMain: false });
    const both = await at(null);

    expect(main[0]!.onHand).toBe(60);
    expect(second[0]!.onHand).toBe(40);
    expect(both[0]!.onHand).toBe(100);
  });

  it("refuses to receive the same transfer twice", async () => {
    const done = await asSuper((tx) =>
      tx.pharmacyStockTransfer.findFirst({
        where: { pharmacyId, status: "received" },
        select: { id: true },
      }),
    );
    const again = await receiveTransfer({
      pharmacyId,
      transferId: done!.id,
      actorStaffId: staffId,
    });
    // Receiving twice would double the stock out of nothing.
    expect(again.ok).toBe(false);

    const total = await asSuper((tx) =>
      tx.pharmacyBatch.aggregate({ where: { pharmacyId }, _sum: { quantity: true } }),
    );
    expect(total._sum.quantity).toBe(100);
  });

  it("puts the stock back where it came from when one is cancelled", async () => {
    const [batch] = await asSuper((tx) =>
      tx.pharmacyBatch.findMany({
        where: { pharmacyId, branchId: mainBranchId, quantity: { gt: 0 } },
        select: { id: true },
      }),
    );
    const sent = await createTransfer({
      pharmacyId,
      fromBranchId: mainBranchId,
      toBranchId: secondBranchId,
      lines: [{ batchId: batch!.id, quantity: 10 }],
      notes: null,
      actorStaffId: staffId,
    });
    expect(sent.ok).toBe(true);
    if (!sent.ok) return;

    const cancelled = await cancelTransfer({
      pharmacyId,
      transferId: sent.id,
      actorStaffId: staffId,
    });
    expect(cancelled.ok).toBe(true);

    const main = await asSuper((tx) =>
      tx.pharmacyBatch.aggregate({
        where: { pharmacyId, branchId: mainBranchId },
        _sum: { quantity: true },
      }),
    );
    // Back to 60 at the source, and still 100 in the pharmacy.
    expect(main._sum.quantity).toBe(60);
  });

  it("refuses to send more than the batch holds", async () => {
    const [batch] = await asSuper((tx) =>
      tx.pharmacyBatch.findMany({
        where: { pharmacyId, branchId: mainBranchId, quantity: { gt: 0 } },
        select: { id: true, quantity: true },
      }),
    );
    const res = await createTransfer({
      pharmacyId,
      fromBranchId: mainBranchId,
      toBranchId: secondBranchId,
      lines: [{ batchId: batch!.id, quantity: batch!.quantity + 1 }],
      notes: null,
      actorStaffId: staffId,
    });
    expect(res.ok).toBe(false);

    // And the refusal left nothing behind — no half-written transfer.
    const stranded = await asSuper((tx) =>
      tx.pharmacyStockTransfer.count({ where: { pharmacyId, status: "in_transit" } }),
    );
    expect(stranded).toBe(0);
  });

  it("refuses a branch transferring to itself", async () => {
    const [batch] = await asSuper((tx) =>
      tx.pharmacyBatch.findMany({
        where: { pharmacyId, branchId: mainBranchId, quantity: { gt: 0 } },
        select: { id: true },
      }),
    );
    const res = await createTransfer({
      pharmacyId,
      fromBranchId: mainBranchId,
      toBranchId: mainBranchId,
      lines: [{ batchId: batch!.id, quantity: 1 }],
      notes: null,
      actorStaffId: staffId,
    });
    expect(res.ok).toBe(false);
  });
});
