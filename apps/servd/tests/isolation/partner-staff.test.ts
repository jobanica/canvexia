import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

/**
 * A7.1's isolation gate. A7.2 does not start until this passes.
 *
 * TWO BOUNDARIES, and both are tested here because A7 is the first phase where
 * the second one exists. The partner boundary is the old one: Davao must not
 * read Tagum. The SEAT boundary is new: a salesperson must not read a
 * colleague's location history, their targets, or their commission.
 *
 * The assertions run WITHOUT a where clause and let Postgres answer. A test
 * that filters by the thing it is trying to prove is a test of the filter.
 *
 * Skips without DATABASE_URL, like every DB-backed suite here.
 */
const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

const prisma = new PrismaClient();
const stamp = randomUUID().slice(0, 8);

function asSuper<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.is_super_admin', 'on', true)`;
    return fn(tx);
  }) as Promise<T>;
}

/**
 * `app_user`, which does not bypass RLS.
 *
 * DATABASE_URL connects as `postgres`, which carries rolbypassrls. FORCE ROW
 * LEVEL SECURITY subjects the table owner to its policies; BYPASSRLS outranks
 * it. A helper that sets only the GUCs therefore observes no policy at all and
 * every assertion below would pass for the wrong reason.
 */
const AS_APP_USER =
  `select set_config('role', CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user')` +
  ` THEN 'app_user' ELSE current_setting('role') END, true)`;

/**
 * A partner scope AND a seat scope, exactly as partnerDb() sets them.
 *
 * `app.is_super_admin` is turned OFF first. The connection is pooled and
 * `set_config(..., true)` is transaction-local, but a suite that sets it ON in
 * one test and forgets in the next is how three assertions in H6 passed for the
 * wrong reason. Explicit is cheap.
 */
function asSeat<T>(
  partnerId: string,
  partnerUserId: string | null,
  fn: (tx: any) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.is_super_admin', 'off', true)`;
    await tx.$executeRawUnsafe(AS_APP_USER);
    await tx.$executeRaw`select set_config('app.current_partner_id', ${partnerId}, true)`;
    await tx.$executeRaw`select set_config('app.current_partner_user_id', ${partnerUserId ?? ""}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

let A = "";
let B = "";
let salesA = "";
let otherA = "";
let salesB = "";

d("the harness can actually observe RLS", () => {
  it("runs seat-scoped queries as a role that does NOT bypass RLS", async () => {
    // First on purpose: if this fails, every assertion in this file is vacuous.
    const rows = await asSeat<{ who: string; bypasses: boolean }[]>(
      "00000000-0000-0000-0000-000000000000",
      null,
      (tx) =>
        tx.$queryRaw`
          select current_user as who,
                 coalesce((select rolbypassrls from pg_roles where rolname = current_user), false) as bypasses
        `,
    );
    expect(rows[0].bypasses, `connected as ${rows[0].who}`).toBe(false);
  });

  it("does not leave super-admin on between transactions", async () => {
    const rows = await asSeat<{ su: boolean }[]>(
      "00000000-0000-0000-0000-000000000000",
      null,
      (tx) => tx.$queryRaw`select app.is_super_admin() as su`,
    );
    expect(rows[0].su).toBe(false);
  });
});

d("A7 staff tables are scoped by partner AND by seat", () => {
  beforeAll(async () => {
    await asSuper(async (tx) => {
      const mkPartner = (label: string) =>
        tx.partner.create({
          data: {
            name: `Staff ${label} ${stamp}`,
            email: `staff-${label}-${stamp}@example.test`,
            status: "approved",
          },
          select: { id: true },
        });
      A = (await mkPartner("A")).id;
      B = (await mkPartner("B")).id;

      const mkSeat = (partnerId: string, label: string, role: string) =>
        tx.partnerUser.create({
          data: {
            partnerId,
            email: `seat-${label}-${stamp}@example.test`,
            name: label,
            role,
            status: "active",
          },
          select: { id: true },
        });
      salesA = (await mkSeat(A, "salesA", "sales")).id;
      otherA = (await mkSeat(A, "otherA", "sales")).id;
      salesB = (await mkSeat(B, "salesB", "sales")).id;

      // One row per table per seat, so "sees own, not a colleague's, not
      // another partner's" is answerable on every one of them.
      for (const [partnerId, userId] of [
        [A, salesA],
        [A, otherA],
        [B, salesB],
      ] as const) {
        await tx.staffEvent.create({
          data: { partnerId, partnerUserId: userId, kind: "call.logged" },
        });
        await tx.staffTarget.create({
          data: { partnerId, partnerUserId: userId, month: "2026-09", targetVisits: 10 },
        });
        await tx.attendanceSession.create({
          data: { partnerId, partnerUserId: userId, dayKey: "2026-09-15" },
        });
        await tx.staffVisit.create({
          data: {
            partnerId,
            partnerUserId: userId,
            subjectType: "prospect",
            subjectId: randomUUID(),
            outcome: "met_owner",
          },
        });
        await tx.commissionRule.create({
          data: { partnerId, partnerUserId: userId, type: "per_signup", value: 50000 },
        });
        await tx.commissionStatement.create({
          data: { partnerId, partnerUserId: userId, month: "2026-09", totalCentavos: 12345 },
        });
      }
    });
  });

  afterAll(async () => {
    if (!hasDb) return;
    // Cascades take the staff rows with the partners.
    await asSuper((tx) => tx.partner.deleteMany({ where: { id: { in: [A, B] } } }));
    await prisma.$disconnect();
  });

  const TABLES = [
    "staffEvent",
    "staffTarget",
    "attendanceSession",
    "staffVisit",
    "commissionRule",
    "commissionStatement",
  ] as const;

  it("a seat reads its OWN rows on every staff table", async () => {
    // The assertion that keeps the rest honest: a policy denying everything
    // would pass every "sees nothing" test below and break the product.
    for (const model of TABLES) {
      const rows = await asSeat<any[]>(A, salesA, (tx: any) => tx[model].findMany({}));
      expect(rows.length, `${model}: own rows`).toBe(1);
      expect(rows[0].partnerUserId, model).toBe(salesA);
    }
  });

  it("a seat reads NOTHING of a colleague's, in the same partner", async () => {
    // The new boundary. Same partner, same tenant scope, different person —
    // and a GPS trail is not a thing a colleague gets to read.
    for (const model of TABLES) {
      const rows = await asSeat<any[]>(A, otherA, (tx: any) => tx[model].findMany({}));
      expect(rows.length, model).toBe(1);
      expect(rows[0].partnerUserId, `${model}: leaked a colleague's row`).toBe(otherA);
    }
  });

  it("a seat reads NOTHING of another partner's", async () => {
    // The old boundary, which must not have been weakened by adding the new one.
    for (const model of TABLES) {
      const rows = await asSeat<any[]>(B, salesB, (tx: any) => tx[model].findMany({}));
      expect(rows.length, model).toBe(1);
      expect(rows[0].partnerId, `${model}: leaked across partners`).toBe(B);
    }
  });

  it("a partner scope with NO seat reads the staff tables as empty", async () => {
    // A legacy partner login has no partner_users row. Empty is the safe
    // direction — a blank screen, not everybody's rows.
    for (const model of TABLES) {
      const rows = await asSeat<any[]>(A, null, (tx: any) => tx[model].findMany({}));
      expect(rows.length, `${model}: a seatless scope saw rows`).toBe(0);
    }
  });

  it("a seat cannot WRITE a row for somebody else", async () => {
    // Reads and writes are deliberately asymmetric: a manager may read the
    // team's attendance and may not forge a colleague's check-in.
    await expect(
      asSeat(A, salesA, (tx: any) =>
        tx.staffVisit.create({
          data: {
            partnerId: A,
            partnerUserId: otherA,
            subjectType: "prospect",
            subjectId: randomUUID(),
            outcome: "signed",
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it("a seat cannot write a row into another partner", async () => {
    await expect(
      asSeat(A, salesA, (tx: any) =>
        tx.staffEvent.create({
          data: { partnerId: B, partnerUserId: salesB, kind: "call.logged" },
        }),
      ),
    ).rejects.toThrow();
  });
});

d("the see-everyone permission is what widens the read", () => {
  it("turning hr.view_all ON lets a seat read the team, and OFF takes it back", async () => {
    // The permission-toggle test the plan calls for, at the POLICY level. The
    // grid is not a cosmetic setting: flipping it changes what Postgres itself
    // will hand back, on the next request, with nothing to invalidate.
    const before = await asSeat<any[]>(A, salesA, (tx: any) => tx.staffEvent.findMany({}));
    expect(before.length, "own row only, to start").toBe(1);

    await asSuper((tx) =>
      tx.partnerRolePermission.create({
        data: { partnerId: A, role: "sales", permission: "hr.view_all", allowed: true },
      }),
    );
    const granted = await asSeat<any[]>(A, salesA, (tx: any) => tx.staffEvent.findMany({}));
    expect(granted.length, "should now see both seats in partner A").toBe(2);
    // And still not partner B's, which is the point of two arms rather than one.
    expect(granted.every((r: any) => r.partnerId === A)).toBe(true);

    await asSuper((tx) =>
      tx.partnerRolePermission.update({
        where: {
          partnerId_role_permission: {
            partnerId: A,
            role: "sales",
            permission: "hr.view_all",
          },
        },
        data: { allowed: false },
      }),
    );
    const revoked = await asSeat<any[]>(A, salesA, (tx: any) => tx.staffEvent.findMany({}));
    expect(revoked.length, "revoking must take it back, not just stop granting").toBe(1);
  });

  it("does not let one partner's grant widen another partner's seat", async () => {
    // app.has_permission joins on the partner in the GUC. If it did not, a
    // permissive partner would be granting reads inside every other partner.
    await asSuper((tx) =>
      tx.partnerRolePermission.upsert({
        where: {
          partnerId_role_permission: {
            partnerId: A,
            role: "sales",
            permission: "attendance.view_all",
          },
        },
        create: {
          partnerId: A,
          role: "sales",
          permission: "attendance.view_all",
          allowed: true,
        },
        update: { allowed: true },
      }),
    );
    const bRows = await asSeat<any[]>(B, salesB, (tx: any) => tx.attendanceSession.findMany({}));
    expect(bRows.length, "partner A's grant reached into partner B").toBe(1);
  });
});
