import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

/**
 * The pipeline's isolation, and the public lead form's blast radius.
 *
 * `prospects` holds the name, mobile number and address of every business a
 * partner has walked into, plus everyone who fills in a public form. None of
 * them agreed to anything. It is the same shape of data as `prospect_leads`,
 * which D27 found readable by anyone who viewed page source.
 *
 * Skips without DATABASE_URL, like every DB-backed suite here.
 */
const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

const prisma = new PrismaClient();
const stamp = randomUUID().slice(0, 8);

/**
 * `app_user`, not the connection's own role.
 *
 * DATABASE_URL connects as `postgres`, which carries rolbypassrls = true, so a
 * helper that sets only the scope GUC observes no policy and every assertion
 * below would pass for the wrong reason. See partner-seats.test.ts.
 */
const AS_APP_USER =
  `select set_config('role', CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user')` +
  ` THEN 'app_user' ELSE current_setting('role') END, true)`;

function asSuper<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.is_super_admin', 'on', true)`;
    return fn(tx);
  }) as Promise<T>;
}

function asPartner<T>(partnerId: string, fn: (tx: any) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(AS_APP_USER);
    await tx.$executeRaw`select set_config('app.current_partner_id', ${partnerId}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

let A = "";
let B = "";
let prospectA = "";

d("the pipeline is partner-scoped", () => {
  beforeAll(async () => {
    await asSuper(async (tx) => {
      const mk = (label: string) =>
        tx.partner.create({
          data: {
            name: `Pipe ${label} ${stamp}`,
            email: `pipe-${label}-${stamp}@example.test`,
            status: "approved",
            tier: "operator",
            revenueSharePct: 70,
            slug: `pipe-${label}-${stamp}`,
          },
          select: { id: true },
        });
      A = (await mk("a")).id;
      B = (await mk("b")).id;

      const p = await tx.prospect.create({
        data: {
          partnerId: A,
          businessName: `Walked past ${stamp}`,
          ownerName: "Someone",
          mobile: "+639171234567",
          address: "A street",
          productId: "servd",
          source: "walk_in",
        },
        select: { id: true },
      });
      prospectA = p.id;
    });
  });

  afterAll(async () => {
    await asSuper((tx) => tx.partner.deleteMany({ where: { email: { contains: stamp } } }));
    await prisma.$disconnect();
  });

  it("another partner cannot read a prospect, by list or by id", async () => {
    const listed = await asPartner(B, (tx) => tx.prospect.findMany());
    expect((listed as { id: string }[]).map((r) => r.id)).not.toContain(prospectA);

    const direct = await asPartner(B, (tx) =>
      tx.prospect.findUnique({ where: { id: prospectA } }),
    ).catch(() => null);
    expect(direct).toBeNull();
  });

  it("another partner cannot move a prospect between stages", async () => {
    const moved = await asPartner<{ count: number }>(B, (tx) =>
      tx.prospect.updateMany({ where: { id: prospectA }, data: { stage: "paid" } }),
    );
    expect(moved.count).toBe(0);

    const after = await asSuper<{ stage: string }>((tx) =>
      tx.prospect.findUnique({ where: { id: prospectA }, select: { stage: true } }),
    );
    expect(after.stage).toBe("lead");
  });

  it("another partner cannot file a prospect under someone else's id", async () => {
    // WITH CHECK, not just USING. The lead form's whole defence is that the
    // partnerId comes from a slug lookup and never from the request — this is
    // the database saying the same thing.
    const wrote = await asPartner(B, async (tx) => {
      await tx.prospect.create({
        data: { partnerId: A, businessName: `Smuggled ${stamp}`, productId: "servd" },
      });
      return true;
    }).catch(() => false);
    expect(wrote).toBe(false);
  });

  it("the stage enum refuses a value the code does not have", async () => {
    const wrote = await asSuper(async (tx) => {
      await tx.$executeRawUnsafe(
        `update prospects set stage = 'won' where id = '${prospectA}'`,
      );
      return true;
    }).catch(() => false);
    expect(wrote).toBe(false);
  });

  it("neither anon nor authenticated holds any grant on prospects", async () => {
    const rows = await asSuper<{ grantee: string }[]>((tx) =>
      tx.$queryRaw`
        select grantee from information_schema.role_table_grants
         where table_name = 'prospects' and grantee in ('anon', 'authenticated')
      `,
    );
    expect(rows).toEqual([]);
  });
});
