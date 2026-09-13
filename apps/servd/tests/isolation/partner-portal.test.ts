import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { getPartnerDashboard } from "@/server/partners/portal";

/**
 * The partner portal, against a real database.
 *
 * This is the test that makes Phase 1's work load-bearing. The portal used to
 * read through systemDb(), which sets app.is_super_admin and switches every
 * tenant policy off — so its isolation was a single `where` clause in one file.
 * It now reads through partnerDb(), and these assertions are what says so.
 *
 * Also covers the two bugs Phase 3 found:
 *   - a partner's own merchants must belong to THEM, not to the house partner
 *   - `partners` had no policy at all, so one partner could write another's row
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

function asPartner<T>(partnerId: string, fn: (tx: any) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.current_partner_id', ${partnerId}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

const stamp = randomUUID().slice(0, 8);
let A = "";
let B = "";
let shopA = "";
let shopB = "";

d("partner portal isolation", () => {
  beforeAll(async () => {
    await asSuper(async (tx) => {
      const mk = (label: string) =>
        tx.partner.create({
          data: {
            name: `Portal ${label} ${stamp}`,
            email: `portal-${label}-${stamp}@example.test`,
            status: "approved",
            tier: "operator",
          },
          select: { id: true },
        });
      A = (await mk("a")).id;
      B = (await mk("b")).id;

      const shop = async (label: string, owner: string) => {
        const r = await tx.restaurant.create({
          data: {
            name: `Shop ${label} ${stamp}`,
            slug: `shop-${label}-${stamp}`,
            status: "active",
          },
          select: { id: true },
        });
        await tx.$executeRawUnsafe(
          `update restaurants set "partnerId" = $1 where id = $2`,
          owner,
          r.id,
        );
        return r.id;
      };
      shopA = await shop("a", A);
      shopB = await shop("b", B);
    });
  });

  afterAll(async () => {
    if (!A) return;
    await asSuper(async (tx) => {
      await tx.restaurant.deleteMany({ where: { id: { in: [shopA, shopB] } } });
      await tx.partner.deleteMany({ where: { id: { in: [A, B] } } });
    });
    await prisma.$disconnect();
  });

  it("shows a partner only its own merchants", async () => {
    const dash = await getPartnerDashboard(A);
    const ids = dash.accounts.map((a) => a.id);
    expect(ids).toContain(shopA);
    expect(ids).not.toContain(shopB);
  });

  it("shows the other partner only theirs", async () => {
    const dash = await getPartnerDashboard(B);
    const ids = dash.accounts.map((a) => a.id);
    expect(ids).toContain(shopB);
    expect(ids).not.toContain(shopA);
  });

  it("refuses a cross-partner read even with no where clause", async () => {
    // The database is the filter, not the query. If this ever returns shopB,
    // the policy is gone and every `where` in the portal is load-bearing again.
    const rows = await asPartner(A, (tx) =>
      tx.$queryRawUnsafe(`select id from restaurants`),
    );
    const ids = (rows as { id: string }[]).map((r) => r.id);
    expect(ids).toContain(shopA);
    expect(ids).not.toContain(shopB);
  });

  describe("the partners table itself", () => {
    it("lets a partner read only its own row", async () => {
      const rows = await asPartner(A, (tx) => tx.$queryRawUnsafe(`select id from partners`));
      const ids = (rows as { id: string }[]).map((r) => r.id);
      expect(ids).toEqual([A]);
    });

    it("refuses one partner writing another's row", async () => {
      // Brand settings are the first thing a partner edits about themselves.
      // Without a policy here the only thing stopping this is a where clause.
      await asPartner(A, async (tx) => {
        try {
          await tx.$executeRawUnsafe(
            `update partners set name = 'hijacked' where id = $1`,
            B,
          );
        } catch {
          /* a refusal is a pass */
        }
      });

      const [row] = (await asSuper((tx) =>
        tx.$queryRawUnsafe(`select name from partners where id = $1`, B),
      )) as { name: string }[];
      expect(row.name).not.toBe("hijacked");
    });

    it("lets a partner write its own row", async () => {
      await asPartner(A, (tx) =>
        tx.$executeRawUnsafe(`update partners set territory = 'Davao City' where id = $1`, A),
      );
      const [row] = (await asSuper((tx) =>
        tx.$queryRawUnsafe(`select territory from partners where id = $1`, A),
      )) as { territory: string | null }[];
      expect(row.territory).toBe("Davao City");
    });
  });
});
