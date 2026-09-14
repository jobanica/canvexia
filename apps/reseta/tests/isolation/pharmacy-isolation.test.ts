import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";

/**
 * Partner and merchant isolation for the pharmacy axis, against a real
 * database.
 *
 * This is the test `docs/canvexia/adding-a-vertical.md` says to write BEFORE
 * the adapter, and it is the gate on flipping `live: true`. The unit tests
 * cover the arithmetic; only a database can show that the policies actually
 * hold — that the second merchant axis added to rls.sql isolates as well as the
 * first, rather than quietly matching everything or nothing.
 *
 * EVERY QUERY BELOW OMITS ITS WHERE CLAUSE ON PURPOSE. A test that filters
 * proves the filter works, which nobody doubted. The claim being tested is that
 * Postgres refuses the rows even when the application forgets.
 *
 * Skips without DATABASE_URL so the offline suite and CI stay green. It must
 * also not run as a superuser: a superuser bypasses RLS regardless of FORCE,
 * and every assertion here would fail in a way that looks like a regression.
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

function asPharmacy<T>(pharmacyId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `select set_config('role', 'app_user', true),` +
        ` set_config('app.current_pharmacy_id', '${pharmacyId}', true)`,
    );
    return fn(tx);
  });
}

const stamp = randomUUID().slice(0, 8);
let alphaPartner = "";
let betaPartner = "";
let alphaPharmacy = "";
let betaPharmacy = "";
let alphaProduct = "";

d("pharmacy tenancy", () => {
  beforeAll(async () => {
    await asSuper(async (tx) => {
      const mkPartner = async (label: string) =>
        (
          await tx.partner.create({
            data: {
              name: `Rx ${label} ${stamp}`,
              email: `rx-${label}-${stamp}@example.test`,
              status: "approved",
              tier: "operator",
              revenueSharePct: 70,
            },
            select: { id: true },
          })
        ).id;
      alphaPartner = await mkPartner("alpha");
      betaPartner = await mkPartner("beta");

      const mkPharmacy = async (label: string, partnerId: string) =>
        (
          await tx.pharmacy.create({
            data: {
              partnerId,
              name: `Rx ${label} ${stamp}`,
              slug: `rx-${label}-${stamp}`,
              status: "active",
            },
            select: { id: true },
          })
        ).id;
      alphaPharmacy = await mkPharmacy("alpha", alphaPartner);
      betaPharmacy = await mkPharmacy("beta", betaPartner);

      // A product and a batch in each, so the tenant tables have something to
      // leak if the policies are wrong.
      const mkStock = async (pharmacyId: string, name: string) => {
        const product = await tx.pharmacyProduct.create({
          data: { pharmacyId, name, priceCentavos: 11200 },
          select: { id: true },
        });
        await tx.pharmacyBatch.create({
          data: {
            pharmacyId,
            productId: product.id,
            quantity: 10,
            costCentavos: 5000,
            lotNumber: `LOT-${name}`,
            expiryDate: new Date("2027-12-31"),
          },
        });
        return product.id;
      };
      alphaProduct = await mkStock(alphaPharmacy, `Alpha Paracetamol ${stamp}`);
      await mkStock(betaPharmacy, `Beta Paracetamol ${stamp}`);
    });
  });

  afterAll(async () => {
    await asSuper(async (tx) => {
      await tx.pharmacy.deleteMany({ where: { id: { in: [alphaPharmacy, betaPharmacy] } } });
      await tx.partner.deleteMany({ where: { id: { in: [alphaPartner, betaPartner] } } });
    });
    await prisma.$disconnect();
  });

  it("shows a partner its own pharmacies and no others — with no where clause", async () => {
    const rows = await asPartner(alphaPartner, (tx) =>
      tx.pharmacy.findMany({ select: { id: true } }),
    );
    expect(rows.map((r) => r.id)).toEqual([alphaPharmacy]);
  });

  it("hides another partner's products, with no where clause", async () => {
    const rows = await asPartner(betaPartner, (tx) =>
      tx.pharmacyProduct.findMany({ select: { pharmacyId: true } }),
    );
    expect(rows.every((r) => r.pharmacyId === betaPharmacy)).toBe(true);
    expect(rows.map((r) => r.pharmacyId)).not.toContain(alphaPharmacy);
  });

  it("hides another partner's batches — the recall trail is not shared", async () => {
    const rows = await asPartner(betaPartner, (tx) =>
      tx.pharmacyBatch.findMany({ select: { pharmacyId: true, lotNumber: true } }),
    );
    expect(rows.every((r) => r.pharmacyId === betaPharmacy)).toBe(true);
  });

  it("scopes a merchant to itself, with no where clause", async () => {
    const rows = await asPharmacy(alphaPharmacy, (tx) =>
      tx.pharmacyProduct.findMany({ select: { pharmacyId: true } }),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.pharmacyId === alphaPharmacy)).toBe(true);
  });

  it("refuses to let a partner claim another partner's pharmacy", async () => {
    // The row is invisible under `using`, so this must affect zero rows rather
    // than move it. That is the arm that stops a partner rebranding a rival's
    // merchant into their own book.
    const moved = await asPartner(betaPartner, (tx) =>
      tx.pharmacy.updateMany({
        where: { id: alphaPharmacy },
        data: { partnerId: betaPartner },
      }),
    );
    expect(moved.count).toBe(0);

    const still = await asSuper((tx) =>
      tx.pharmacy.findUnique({
        where: { id: alphaPharmacy },
        select: { partnerId: true },
      }),
    );
    expect(still?.partnerId).toBe(alphaPartner);
  });

  it("keeps the two axes from seeing each other", async () => {
    // A pharmacy scope must not open Servd's tables, and vice versa. The GUCs
    // are separate names, so setting one leaves the other NULL — which is the
    // point of giving each product its own.
    const restaurants = await asPharmacy(alphaPharmacy, (tx) =>
      tx.restaurant.findMany({ select: { id: true } }),
    );
    expect(restaurants).toEqual([]);
  });

  it("keeps the settlement ledger out of a merchant's reach", async () => {
    await asSuper((tx) =>
      tx.partnerLedgerEntry.create({
        data: {
          partnerId: alphaPartner,
          productId: "pharmacy",
          merchantId: alphaPharmacy,
          kind: "subscription",
          providerRef: `rx-ledger-${stamp}`,
          grossAmount: 100000,
          partnerAmount: 70000,
          hqAmount: 30000,
          sharePct: 70,
        },
      }),
    );

    // The partner earned it, so the partner can read it…
    const forPartner = await asPartner(alphaPartner, (tx) =>
      tx.partnerLedgerEntry.findMany({ select: { merchantId: true, productId: true } }),
    );
    expect(forPartner).toContainEqual({ merchantId: alphaPharmacy, productId: "pharmacy" });

    // …and the merchant it was earned on cannot. What the partner keeps and
    // what CANVEXIA takes is a commercial term between them (D27's sibling
    // reasoning), and a merchant reading its own row would learn both.
    const forMerchant = await asPharmacy(alphaPharmacy, (tx) =>
      tx.partnerLedgerEntry.findMany({ select: { id: true } }),
    );
    expect(forMerchant).toEqual([]);

    await asSuper((tx) =>
      tx.partnerLedgerEntry.deleteMany({ where: { providerRef: `rx-ledger-${stamp}` } }),
    );
  });
});
