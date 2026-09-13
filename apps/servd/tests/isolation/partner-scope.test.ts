import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

/**
 * CROSS-PARTNER ISOLATION — the acceptance gate for CANVEXIA Phase 1.
 *
 * WRITTEN TO FAIL. Nothing it asks for exists yet: there is no
 * restaurants."partnerId", no app.current_partner_id() helper, and no partner
 * arm on any policy. That is the point — this is the definition of done for
 * Phase 1, committed before the code so the target cannot quietly move.
 *
 * Why it matters: partner isolation today is app-level only. The partner portal
 * reads through systemDb() (see src/server/partners/portal.ts), which sets
 * app.is_super_admin and therefore BYPASSES row-level security entirely. A
 * missing `where partnerId` in that code path is not a 403, it is one partner
 * reading another partner's restaurants. The database has no opinion about it.
 *
 * Deliberately raw SQL rather than the Prisma client: the columns under test do
 * not exist in the schema yet, so a typed query would not compile and this file
 * would have to wait for Phase 1 to be written at all. Raw SQL also tests the
 * layer that actually enforces the boundary.
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

/** Run as a partner: the scope Phase 1 introduces, alongside tenantDb(). */
function asPartner<T>(partnerId: string, fn: (tx: any) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.current_partner_id', ${partnerId}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

function asSuper<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.is_super_admin', 'on', true)`;
    return fn(tx);
  }) as Promise<T>;
}

let partnerA = "";
let partnerB = "";
let restaurantA = "";
let restaurantB = "";
const stamp = randomUUID().slice(0, 8);

d("cross-partner isolation (RLS)", () => {
  beforeAll(async () => {
    await asSuper(async (tx) => {
      const pa = await tx.partner.create({
        data: { name: `Partner A ${stamp}`, email: `partner-a-${stamp}@example.test` },
      });
      const pb = await tx.partner.create({
        data: { name: `Partner B ${stamp}`, email: `partner-b-${stamp}@example.test` },
      });
      partnerA = pa.id;
      partnerB = pb.id;

      const ra = await tx.restaurant.create({
        data: { name: "Partner A diner", slug: `pa-${stamp}`, status: "active" },
      });
      const rb = await tx.restaurant.create({
        data: { name: "Partner B diner", slug: `pb-${stamp}`, status: "active" },
      });
      restaurantA = ra.id;
      restaurantB = rb.id;

      // Phase 1 adds this column. Until then the whole suite fails here, which
      // is the correct and most legible place for it to fail.
      await tx.$executeRawUnsafe(
        `update restaurants set "partnerId" = $1 where id = $2`,
        partnerA,
        restaurantA,
      );
      await tx.$executeRawUnsafe(
        `update restaurants set "partnerId" = $1 where id = $2`,
        partnerB,
        restaurantB,
      );
    });
  });

  afterAll(async () => {
    if (!partnerA) return;
    await asSuper(async (tx) => {
      await tx.restaurant.deleteMany({ where: { id: { in: [restaurantA, restaurantB] } } });
      await tx.partner.deleteMany({ where: { id: { in: [partnerA, partnerB] } } });
    });
    await prisma.$disconnect();
  });

  it("a partner reading restaurants with no where clause sees only its own", async () => {
    const rows = await asPartner(partnerA, (tx) =>
      tx.$queryRawUnsafe(`select id from restaurants`),
    );
    const ids = (rows as { id: string }[]).map((r) => r.id);
    expect(ids).toContain(restaurantA);
    expect(ids).not.toContain(restaurantB);
  });

  it("a partner cannot read another partner's restaurant by id", async () => {
    const rows = await asPartner(partnerA, (tx) =>
      tx.$queryRawUnsafe(`select id from restaurants where id = $1`, restaurantB),
    );
    expect(rows).toHaveLength(0);
  });

  it("a partner cannot reassign another partner's restaurant to itself", async () => {
    // Either the write is refused outright, or it silently matches zero rows.
    // Both are acceptable; the restaurant still belonging to B is what matters.
    await asPartner(partnerA, async (tx) => {
      try {
        await tx.$executeRawUnsafe(
          `update restaurants set "partnerId" = $1 where id = $2`,
          partnerA,
          restaurantB,
        );
      } catch {
        /* a refusal is a pass */
      }
    });

    const [row] = (await asSuper((tx) =>
      tx.$queryRawUnsafe(`select "partnerId" from restaurants where id = $1`, restaurantB),
    )) as { partnerId: string }[];
    expect(row.partnerId).toBe(partnerB);
  });

  it("a partner cannot read orders belonging to another partner's restaurant", async () => {
    const orderId = randomUUID();
    await asSuper((tx) =>
      tx.$executeRawUnsafe(
        `insert into orders (id, "restaurantId", status, "createdAt", "updatedAt")
         values ($1, $2, 'new', now(), now())`,
        orderId,
        restaurantB,
      ),
    );

    const rows = await asPartner(partnerA, (tx) =>
      tx.$queryRawUnsafe(`select id from orders where id = $1`, orderId),
    );
    expect(rows).toHaveLength(0);

    await asSuper((tx) =>
      tx.$executeRawUnsafe(`delete from orders where id = $1`, orderId),
    );
  });

  it("super-admin still sees across partners", async () => {
    const rows = await asSuper((tx) =>
      tx.$queryRawUnsafe(
        `select id from restaurants where id in ($1, $2)`,
        restaurantA,
        restaurantB,
      ),
    );
    expect(rows).toHaveLength(2);
  });
});
