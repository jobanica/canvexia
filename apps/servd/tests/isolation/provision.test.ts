import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { provisionMerchantForPartner } from "@/server/products";

/**
 * Provisioning through the product dispatch, against a real database.
 *
 * The unit tests cover the dispatch's refusals with a fake adapter. What only a
 * database can show is that the REAL Servd adapter creates a merchant the
 * partner actually owns — which is the whole chain Phases 1–3 built: ownership
 * set at creation, and the row visible to its partner through RLS rather than
 * through a where clause someone remembered.
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
let approved = "";
let suspended = "";
const created: string[] = [];

d("provisioning a merchant through the dispatch", () => {
  beforeAll(async () => {
    await asSuper(async (tx) => {
      const mk = async (label: string, status: string) =>
        (
          await tx.partner.create({
            data: {
              name: `Prov ${label} ${stamp}`,
              email: `prov-${label}-${stamp}@example.test`,
              status,
              tier: "operator",
            },
            select: { id: true },
          })
        ).id;
      approved = await mk("ok", "approved");
      suspended = await mk("susp", "suspended");
    });
  });

  afterAll(async () => {
    await asSuper(async (tx) => {
      if (created.length) {
        await tx.subscription.deleteMany({ where: { restaurantId: { in: created } } });
        await tx.restaurant.deleteMany({ where: { id: { in: created } } });
      }
      await tx.partner.deleteMany({ where: { id: { in: [approved, suspended] } } });
    });
    await prisma.$disconnect();
  });

  it("creates a merchant the partner owns", async () => {
    const out = await provisionMerchantForPartner("servd", approved, {
      name: `Dispatch Diner ${stamp}`,
      address: "Davao City",
      phone: "0917 000 0000",
    });

    expect(out.ok).toBe(true);
    if (!out.ok) return;
    created.push(out.result.merchantId);

    expect(out.result.slug).toBeTruthy();

    const row = (await asSuper((tx) =>
      tx.restaurant.findUnique({
        where: { id: out.result.merchantId },
        select: { name: true, slug: true, partnerId: true, demoPartnerId: true },
      }),
    )) as { name: string; slug: string; partnerId: string | null; demoPartnerId: string | null };

    // Ownership AND provenance, which are different questions (D13) and are both
    // this partner here because they built it and own it.
    expect(row.partnerId).toBe(approved);
    expect(row.demoPartnerId).toBe(approved);
    expect(row.slug).toBe(out.result.slug);
  });

  it("makes it visible to that partner through RLS, not through a where clause", async () => {
    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select set_config('app.current_partner_id', ${approved}, true)`;
      return tx.$queryRawUnsafe(`select id from restaurants`);
    });
    const ids = (rows as { id: string }[]).map((r) => r.id);
    expect(ids).toContain(created[0]);
  });

  it("hides it from another partner", async () => {
    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select set_config('app.current_partner_id', ${suspended}, true)`;
      return tx.$queryRawUnsafe(`select id from restaurants`);
    });
    expect((rows as unknown[]).length).toBe(0);
  });

  it("refuses a suspended partner", async () => {
    const out = await provisionMerchantForPartner("servd", suspended, { name: "Nope" });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.message).toMatch(/suspended/);
  });

  it("refuses a partner that does not exist", async () => {
    const out = await provisionMerchantForPartner("servd", randomUUID(), { name: "Nope" });
    expect(out.ok).toBe(false);
  });

  it("refuses a product that is not live yet", async () => {
    const out = await provisionMerchantForPartner("laundry", approved, { name: "Nope" });
    expect(out).toMatchObject({ ok: false, reason: "product_not_live" });
  });
});
