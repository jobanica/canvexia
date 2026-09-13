import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { activateByProviderRef } from "@/server/billing/activate";
import { PLATFORM_SCOPE, partnerScope } from "@/server/billing/settlement-scope";
import { __resetLedgerTableCache } from "@/server/billing/ledger";

/**
 * Cross-partner settlement, and the ledger it writes.
 *
 * The attack this is about: every `*ByProviderRef` handler used to settle a
 * payment by gateway reference ALONE. With one trusted gateway that was sound —
 * possessing a reference was proof it came from us. With N sub-accounts it is
 * not: a reference that is unique inside one account need not be unique across
 * them, and a webhook routed to the wrong partner settles the wrong merchant's
 * invoice, grants access, and records revenue, all silently.
 *
 * Skips without DATABASE_URL, so the offline suite and CI stay green.
 */
const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

const prisma = new PrismaClient();

function asSuper<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.is_super_admin', 'on', true)`;
    return fn(tx);
  }) as Promise<T>;
}

const stamp = randomUUID().slice(0, 8);
let partnerA = "";
let partnerB = "";
let shopA = "";
let shopB = "";
let invoiceA = "";
let invoiceB = "";
const refA = `ref-a-${stamp}`;
const refB = `ref-b-${stamp}`;
const PRICE = 99900; // ₱999.00

d("cross-partner settlement", () => {
  beforeAll(async () => {
    __resetLedgerTableCache();
    await asSuper(async (tx) => {
      const mkPartner = async (label: string, sharePct: number) => {
        const p = await tx.partner.create({
          data: {
            name: `Settle ${label} ${stamp}`,
            email: `settle-${label}-${stamp}@example.test`,
            status: "approved",
            tier: "operator",
          },
          select: { id: true },
        });
        await tx.$executeRawUnsafe(
          `update partners set "revenueSharePct" = $1 where id = $2`,
          sharePct,
          p.id,
        );
        return p.id;
      };
      partnerA = await mkPartner("a", 70);
      partnerB = await mkPartner("b", 65);

      const mkShop = async (label: string, owner: string) => {
        const r = await tx.restaurant.create({
          data: { name: `Settle ${label} ${stamp}`, slug: `settle-${label}-${stamp}`, status: "active" },
          select: { id: true },
        });
        await tx.$executeRawUnsafe(
          `update restaurants set "partnerId" = $1 where id = $2`,
          owner,
          r.id,
        );
        return r.id;
      };
      shopA = await mkShop("a", partnerA);
      shopB = await mkShop("b", partnerB);

      const mkInvoice = async (restaurantId: string, providerRef: string) => {
        const inv = await tx.restaurantInvoice.create({
          data: {
            restaurantId,
            amount: PRICE,
            status: "open",
            periodStart: new Date(),
            periodEnd: new Date(Date.now() + 30 * 86400000),
            providerRef,
          },
          select: { id: true },
        });
        return inv.id;
      };
      invoiceA = await mkInvoice(shopA, refA);
      invoiceB = await mkInvoice(shopB, refB);
    });
  });

  afterAll(async () => {
    if (!partnerA) return;
    await asSuper(async (tx) => {
      await tx.$executeRawUnsafe(
        `delete from partner_ledger_entries where "providerRef" = any($1)`,
        [refA, refB],
      );
      await tx.restaurantInvoice.deleteMany({ where: { id: { in: [invoiceA, invoiceB] } } });
      await tx.restaurant.deleteMany({ where: { id: { in: [shopA, shopB] } } });
      await tx.partner.deleteMany({ where: { id: { in: [partnerA, partnerB] } } });
    });
    await prisma.$disconnect();
  });

  it("refuses partner A settling partner B's invoice", async () => {
    const settled = await activateByProviderRef(refB, partnerScope(partnerA));
    expect(settled).toBe(false);

    const inv = (await asSuper((tx) =>
      tx.restaurantInvoice.findUnique({ where: { id: invoiceB } }),
    )) as { status: string; paidAt: Date | null };
    expect(inv.status).toBe("open");
    expect(inv.paidAt).toBeNull();
  });

  it("writes no ledger entry for a refused settlement", async () => {
    // The quieter half of the same bug: revenue credited to the wrong partner.
    const rows = (await asSuper((tx) =>
      tx.$queryRawUnsafe(
        `select "partnerId" from partner_ledger_entries where "providerRef" = $1`,
        refB,
      ),
    )) as unknown[];
    expect(rows).toHaveLength(0);
  });

  it("lets the owning partner settle it, and records the split", async () => {
    const settled = await activateByProviderRef(refB, partnerScope(partnerB));
    expect(settled).toBe(true);

    const inv = (await asSuper((tx) =>
      tx.restaurantInvoice.findUnique({ where: { id: invoiceB } }),
    )) as { status: string };
    expect(inv.status).toBe("paid");

    const [entry] = (await asSuper((tx) =>
      tx.$queryRawUnsafe(
        `select * from partner_ledger_entries where "providerRef" = $1`,
        refB,
      ),
    )) as {
      partnerId: string;
      grossAmount: number;
      partnerAmount: number;
      hqAmount: number;
      sharePct: number;
      kind: string;
    }[];

    expect(entry.partnerId).toBe(partnerB);
    expect(entry.kind).toBe("subscription");
    expect(entry.grossAmount).toBe(PRICE);
    // Partner B negotiated 65, not the 70 default — the entry must carry the
    // rate that actually applied, not the platform's headline one.
    expect(entry.sharePct).toBe(65);
    expect(entry.partnerAmount).toBe(Math.round((PRICE * 65) / 100));
    expect(entry.partnerAmount + entry.hqAmount).toBe(PRICE);
  });

  it("is idempotent — a replayed webhook credits nobody twice", async () => {
    await activateByProviderRef(refB, partnerScope(partnerB));
    await activateByProviderRef(refB, partnerScope(partnerB));

    const rows = (await asSuper((tx) =>
      tx.$queryRawUnsafe(
        `select id from partner_ledger_entries where "providerRef" = $1`,
        refB,
      ),
    )) as unknown[];
    expect(rows).toHaveLength(1);
  });

  it("still lets the platform scope settle its own account's payments", async () => {
    const settled = await activateByProviderRef(refA, PLATFORM_SCOPE);
    expect(settled).toBe(true);

    const [entry] = (await asSuper((tx) =>
      tx.$queryRawUnsafe(
        `select "partnerId", "sharePct" from partner_ledger_entries where "providerRef" = $1`,
        refA,
      ),
    )) as { partnerId: string; sharePct: number }[];
    expect(entry.partnerId).toBe(partnerA);
    expect(entry.sharePct).toBe(70);
  });

  it("keeps the ledger out of the merchant's reach", async () => {
    // It carries what the partner keeps and what CANVEXIA takes. A restaurant
    // reading its own rows would learn its partner's margin.
    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select set_config('app.current_restaurant_id', ${shopB}, true)`;
      return tx.$queryRawUnsafe(`select id from partner_ledger_entries`);
    });
    expect(rows).toHaveLength(0);
  });

  it("lets the owning partner read their own entries", async () => {
    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select set_config('app.current_partner_id', ${partnerB}, true)`;
      return tx.$queryRawUnsafe(`select "providerRef" from partner_ledger_entries`);
    });
    const refs = (rows as { providerRef: string }[]).map((r) => r.providerRef);
    expect(refs).toContain(refB);
    expect(refs).not.toContain(refA);
  });
});
