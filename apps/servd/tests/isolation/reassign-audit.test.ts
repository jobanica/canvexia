import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { reassignMerchant } from "@/server/partners/reassign";

/**
 * Reassignment against a real database: the column moves, and the move is
 * recorded.
 *
 * The decision logic is unit-tested in tests/partners/reassign.test.ts. What
 * cannot be tested without a database is the part that matters operationally —
 * that the update and the audit row are one transaction, and that the trail
 * says who did it, when, and what changed. A merchant that silently changes
 * hands is the kind of thing nobody notices until two partners are both
 * invoicing it.
 *
 * Requires a live database with RLS applied:
 *   pnpm --filter servd exec prisma db push && pnpm --filter servd db:rls
 *   DATABASE_URL=... pnpm --filter servd test:isolation
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
let suspended = "";
let merchant = "";

d("merchant reassignment (database)", () => {
  beforeAll(async () => {
    await asSuper(async (tx) => {
      const mk = (label: string, status: string) =>
        tx.partner.create({
          data: {
            name: `Reassign ${label} ${stamp}`,
            email: `reassign-${label}-${stamp}@example.test`,
            status,
            tier: "operator",
          },
          select: { id: true },
        });
      partnerA = (await mk("a", "approved")).id;
      partnerB = (await mk("b", "approved")).id;
      suspended = (await mk("s", "suspended")).id;

      const r = await tx.restaurant.create({
        data: { name: `Reassign diner ${stamp}`, slug: `reassign-${stamp}`, status: "active" },
        select: { id: true },
      });
      merchant = r.id;
      await tx.$executeRawUnsafe(
        `update restaurants set "partnerId" = $1 where id = $2`,
        partnerA,
        merchant,
      );
    });
  });

  afterAll(async () => {
    if (!merchant) return;
    await asSuper(async (tx) => {
      await tx.auditLog.deleteMany({ where: { entityId: merchant } });
      await tx.restaurant.deleteMany({ where: { id: merchant } });
      await tx.partner.deleteMany({ where: { id: { in: [partnerA, partnerB, suspended] } } });
    });
    await prisma.$disconnect();
  });

  it("moves the merchant and records the move in one go", async () => {
    const result = await reassignMerchant({
      restaurantId: merchant,
      targetPartnerId: partnerB,
      actorEmail: "founder@example.test",
      reason: "Partner A stopped supporting the city",
    });

    expect(result).toMatchObject({ ok: true, moved: true, from: partnerA, to: partnerB });

    const [row] = (await asSuper((tx) =>
      tx.$queryRawUnsafe(`select "partnerId" from restaurants where id = $1`, merchant),
    )) as { partnerId: string }[];
    expect(row.partnerId).toBe(partnerB);

    const audit = await asSuper((tx) =>
      tx.auditLog.findFirst({
        where: { entityId: merchant, action: "merchant.reassigned" },
        orderBy: { createdAt: "desc" },
      }),
    );
    expect(audit).toBeTruthy();
    expect(audit.actorType).toBe("hq");
    expect(audit.actorEmail).toBe("founder@example.test");
    expect(audit.reason).toBe("Partner A stopped supporting the city");
    // The incoming partner, so the new owner can see the trail for its merchant.
    expect(audit.partnerId).toBe(partnerB);
    expect(audit.before).toEqual({ partnerId: partnerA });
    expect(audit.after).toEqual({ partnerId: partnerB });
  });

  it("is a quiet no-op when repeated, and writes no second audit row", async () => {
    const before = await asSuper((tx) =>
      tx.auditLog.count({ where: { entityId: merchant, action: "merchant.reassigned" } }),
    );

    const result = await reassignMerchant({
      restaurantId: merchant,
      targetPartnerId: partnerB,
      actorEmail: "founder@example.test",
    });
    expect(result).toMatchObject({ ok: true, moved: false });

    const after = await asSuper((tx) =>
      tx.auditLog.count({ where: { entityId: merchant, action: "merchant.reassigned" } }),
    );
    expect(after).toBe(before);
  });

  it("refuses a suspended partner and changes nothing", async () => {
    const result = await reassignMerchant({
      restaurantId: merchant,
      targetPartnerId: suspended,
      actorEmail: "founder@example.test",
    });
    expect(result.ok).toBe(false);

    const [row] = (await asSuper((tx) =>
      tx.$queryRawUnsafe(`select "partnerId" from restaurants where id = $1`, merchant),
    )) as { partnerId: string }[];
    expect(row.partnerId).toBe(partnerB);
  });

  it("refuses a merchant that does not exist", async () => {
    const result = await reassignMerchant({
      restaurantId: randomUUID(),
      targetPartnerId: partnerB,
      actorEmail: "founder@example.test",
    });
    expect(result.ok).toBe(false);
  });

  it("lets the new partner read the merchant, and the old one no longer can", async () => {
    const asPartner = (id: string) =>
      prisma.$transaction(async (tx) => {
        await tx.$executeRaw`select set_config('app.current_partner_id', ${id}, true)`;
        return tx.$queryRawUnsafe(`select id from restaurants where id = $1`, merchant);
      });

    expect(await asPartner(partnerB)).toHaveLength(1);
    // The whole point of reassignment: access follows ownership, enforced by the
    // database rather than by the portal remembering to filter.
    expect(await asPartner(partnerA)).toHaveLength(0);
  });
});
