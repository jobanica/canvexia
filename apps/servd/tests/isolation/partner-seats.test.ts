import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

/**
 * Phase A1's isolation gate. A2 does not start until this passes.
 *
 * Every screen in the partner portal is partner-scoped, and this repository has
 * been burned by exactly this once: D27 found twelve tables with no policy at
 * all, `prospect_leads` among them — names, emails and phone numbers of sales
 * leads, writable by anyone who read the page source.
 *
 * `prospects` is the same shape of data and worse: the name, mobile number and
 * address of every business a partner has walked into, none of whom agreed to
 * anything. So the assertions here are not "the query has the right where
 * clause" — they run WITHOUT a where clause and let Postgres answer.
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
 * A partner scope, exactly as partnerDb() sets it — INCLUDING the role switch.
 *
 * The role switch is not decoration and leaving it out is how this suite lies.
 * `DATABASE_URL` connects as `postgres`, which carries `rolbypassrls = true`.
 * FORCE ROW LEVEL SECURITY subjects the table OWNER to its policies, but
 * BYPASSRLS outranks it — so a helper that sets only the GUC observes no policy
 * at all, and every "partner B sees zero rows" assertion below would pass
 * because of the `where` clause in the query, not because of the policy. That is
 * the first line of defence being tested twice and the second one never.
 *
 * `app_user` has no BYPASSRLS. It is the role `scoped-db.ts` switches to on
 * every request, so this is also what production actually runs as.
 *
 * The CASE keeps this working on a database where rls.sql has not been run yet,
 * instead of failing every query with "role does not exist".
 */
const AS_APP_USER =
  `select set_config('role', CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user')` +
  ` THEN 'app_user' ELSE current_setting('role') END, true)`;

function asPartner<T>(partnerId: string, fn: (tx: any) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(AS_APP_USER);
    await tx.$executeRaw`select set_config('app.current_partner_id', ${partnerId}, true)`;
    return fn(tx);
  }) as Promise<T>;
}

let A = "";
let B = "";
let seatA = "";
let prospectA = "";

d("the harness can actually observe RLS", () => {
  it("runs partner-scoped queries as a role that does NOT bypass RLS", async () => {
    // If this ever fails, every isolation assertion in this file is vacuous —
    // green for the wrong reason. It is first on purpose.
    const rows = await asPartner<{ who: string; bypasses: boolean }[]>(
      "00000000-0000-0000-0000-000000000000",
      (tx) =>
        tx.$queryRaw`
          select current_user as who,
                 coalesce((select rolbypassrls from pg_roles where rolname = current_user), false) as bypasses
        `,
    );
    const row = rows[0];
    expect(row.bypasses, `connected as ${row.who}, which bypasses RLS`).toBe(false);
  });
});

d("partner portal tables are partner-scoped", () => {
  beforeAll(async () => {
    await asSuper(async (tx) => {
      const mk = (label: string) =>
        tx.partner.create({
          data: {
            name: `Seats ${label} ${stamp}`,
            email: `seats-${label}-${stamp}@example.test`,
            status: "approved",
            tier: "operator",
            revenueSharePct: 70,
          },
          select: { id: true },
        });
      A = (await mk("a")).id;
      B = (await mk("b")).id;

      const seat = await tx.partnerUser.create({
        data: {
          partnerId: A,
          email: `sales-${stamp}@example.test`,
          name: "A Salesperson",
          role: "sales",
          status: "active",
        },
        select: { id: true },
      });
      seatA = seat.id;

      const p = await tx.prospect.create({
        data: {
          partnerId: A,
          businessName: `Botica ${stamp}`,
          ownerName: "Aling Nena",
          mobile: "+639171234567",
          address: "Poblacion",
          productId: "pharmacy",
          assignedToId: seatA,
        },
        select: { id: true },
      });
      prospectA = p.id;

      await tx.notificationPref.create({
        data: { partnerId: A, partnerUserId: seatA, event: "lead.received", email: true },
      });
      await tx.partnerInvite.create({
        data: {
          partnerId: A,
          email: `invitee-${stamp}@example.test`,
          role: "support",
          tokenHash: `hash-${stamp}`,
          expiresAt: new Date(Date.now() + 7 * 864e5),
        },
      });
    });
  });

  afterAll(async () => {
    // Partner delete cascades to seats, prospects, invites and prefs.
    await asSuper((tx) => tx.partner.deleteMany({ where: { email: { contains: stamp } } }));
    await prisma.$disconnect();
  });

  it("a partner sees their OWN prospects with no where clause", () => {
    return asPartner(A, async (tx) => {
      const rows = await tx.prospect.findMany();
      expect(rows.map((r: { id: string }) => r.id)).toContain(prospectA);
    });
  });

  it("another partner sees NONE of them", () => {
    return asPartner(B, async (tx) => {
      const rows = await tx.prospect.findMany();
      expect(rows.map((r: { id: string }) => r.id)).not.toContain(prospectA);
    });
  });

  it("nor by primary key — probing an id is not a directory", async () => {
    const row = await asPartner(B, (tx) =>
      tx.prospect.findUnique({ where: { id: prospectA } }),
    ).catch(() => null);
    expect(row).toBeNull();
  });

  it("another partner cannot WRITE into a prospect they cannot see", async () => {
    const updated = await asPartner<{ count: number }>(B, (tx) =>
      tx.prospect.updateMany({
        where: { id: prospectA },
        data: { stage: "lost", lostReason: "hijacked" },
      }),
    );
    expect(updated.count).toBe(0);

    const after = await asSuper<{ stage: string }>((tx) =>
      tx.prospect.findUnique({ where: { id: prospectA }, select: { stage: true } }),
    );
    expect(after.stage).toBe("lead");
  });

  it("another partner cannot CREATE a prospect against someone else's id", async () => {
    // WITH CHECK, not just USING: a policy with only USING lets a tenant insert
    // rows they then cannot read, which is a quiet way to pollute a table.
    const wrote = await asPartner(B, async (tx) => {
      await tx.prospect.create({
        data: { partnerId: A, businessName: `Smuggled ${stamp}`, productId: "servd" },
      });
      return true;
    }).catch(() => false);
    expect(wrote).toBe(false);
  });

  it("seats, invites and notification prefs are scoped the same way", async () => {
    const seen = await asPartner(B, async (tx) => ({
      users: await tx.partnerUser.count(),
      invites: await tx.partnerInvite.count(),
      prefs: await tx.notificationPref.count(),
    }));
    expect(seen).toEqual({ users: 0, invites: 0, prefs: 0 });

    const own = await asPartner(A, async (tx) => ({
      users: await tx.partnerUser.count(),
      invites: await tx.partnerInvite.count(),
      prefs: await tx.notificationPref.count(),
    }));
    expect(own).toEqual({ users: 1, invites: 1, prefs: 1 });
  });

  it("refuses a role the code does not know", async () => {
    // The CHECK constraint, doing its job. A typo in a seat row is a seat that
    // `isPartnerUserRole` rejects at login — a person who cannot sign in and no
    // error that says why.
    const wrote = await asSuper(async (tx) => {
      await tx.$executeRawUnsafe(
        `insert into partner_users (id, "partnerId", email, role, "updatedAt")
         values (gen_random_uuid()::text, '${A}', 'typo-${stamp}@example.test', 'saels', now())`,
      );
      return true;
    }).catch(() => false);
    expect(wrote).toBe(false);
  });

  it("keeps a deactivated seat rather than deleting it", async () => {
    // The audit log names an actor. Deleting the seat makes every past action
    // by that person anonymous, which is the opposite of what an audit log is
    // for.
    await asSuper((tx) =>
      tx.partnerUser.update({
        where: { id: seatA },
        data: { status: "deactivated", deactivatedAt: new Date() },
      }),
    );
    const still = await asSuper<{ status: string }>((tx) =>
      tx.partnerUser.findUnique({ where: { id: seatA }, select: { status: true } }),
    );
    expect(still.status).toBe("deactivated");

    // And the prospect they were working is still there, unassigned or not.
    const prospect = await asSuper((tx) =>
      tx.prospect.findUnique({ where: { id: prospectA }, select: { id: true } }),
    );
    expect(prospect).not.toBeNull();
  });
});

d("the backfill kept every existing login working", () => {
  it("gives every partner with an authUserId an active admin seat", async () => {
    // The migration's one job that cannot be undone by re-running it: a partner
    // mid-shift in the portal must not be logged out by the deploy that adds
    // seats. getCurrentPartner() reads partner_users first, so a partner with a
    // login and no seat would fall through to the legacy path — which still
    // works, but silently, and only until that path is removed.
    const orphans = await asSuper((tx) =>
      tx.$queryRaw<{ email: string }[]>`
        select p.email
          from partners p
         where p."authUserId" is not null
           and not exists (
             select 1 from partner_users u
              where u."partnerId" = p.id
                and u."authUserId" = p."authUserId"
                and u.role = 'admin'
                and u.status = 'active'
           )
      `,
    );
    expect(orphans).toEqual([]);
  });
});
