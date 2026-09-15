import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

/**
 * Phase H1's isolation gate. H2 does not start until this passes.
 *
 * WHAT THIS IS FOR. The HQ console is the one place in this system that
 * legitimately reads across partners, and that makes the tables it introduces
 * the most dangerous ones in the schema: territory assignments say who owns a
 * city, ledger adjustments are money moved by hand, and impersonation grants are
 * the mechanism by which HQ gets inside an operator's own console. A partner
 * that could read any of those learns its competitors' commercial terms.
 *
 * So the assertions run WITHOUT a where clause and let Postgres answer. A test
 * that filters by partnerId and then checks it got the right rows tests the
 * where clause; these test the policy.
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
 * The role switch is not decoration, and leaving it out is how a suite like this
 * lies. `DATABASE_URL` connects as `postgres`, which carries `rolbypassrls =
 * true`. FORCE ROW LEVEL SECURITY subjects the table OWNER to its policies, but
 * BYPASSRLS outranks it — so a helper that sets only the GUC observes no policy
 * at all, and every "partner B sees zero rows" assertion below would pass
 * because of the query, not because of the policy.
 *
 * Six older suites in this directory do exactly that and therefore cannot
 * observe RLS (system_architecture.md §6). This one copies A1's pattern, not
 * theirs.
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
let territoryA = "";
let announcementId = "";
let draftId = "";

d("the harness can actually observe RLS", () => {
  it("runs partner-scoped queries as a role that does NOT bypass RLS", async () => {
    // If this fails, every assertion in this file is vacuous — green for the
    // wrong reason. It is first on purpose.
    const rows = await asPartner<{ who: string; bypasses: boolean }[]>(
      "00000000-0000-0000-0000-000000000000",
      (tx) =>
        tx.$queryRaw`
          select current_user as who,
                 coalesce((select rolbypassrls from pg_roles where rolname = current_user), false) as bypasses
        `,
    );
    expect(rows[0].bypasses, `connected as ${rows[0].who}, which bypasses RLS`).toBe(false);
  });
});

d("HQ tables are scoped", () => {
  beforeAll(async () => {
    await asSuper(async (tx) => {
      const mk = (label: string) =>
        tx.partner.create({
          data: {
            name: `HQ ${label} ${stamp}`,
            email: `hq-${label}-${stamp}@example.test`,
            status: "approved",
            tier: "operator",
            revenueSharePct: 70,
          },
          select: { id: true },
        });
      A = (await mk("a")).id;
      B = (await mk("b")).id;

      const t = await tx.territory.create({
        data: {
          name: `Testville ${stamp}`,
          province: "Davao del Norte",
          region: "Region XI",
          slug: `testville-${stamp}`,
          tier: "small",
          licenseFee: 29000,
          status: "taken",
          partnerId: A,
          assignedAt: new Date(),
        },
        select: { id: true },
      });
      territoryA = t.id;

      await tx.territoryAssignment.create({
        data: { territoryId: territoryA, partnerId: A, actorEmail: "hq@example.test" },
      });

      // An adjustment: money moved by hand, against partner A.
      await tx.partnerLedgerEntry.create({
        data: {
          partnerId: A,
          productId: "servd",
          merchantId: `merchant-${stamp}`,
          kind: "credit",
          providerRef: `adj:${stamp}`,
          grossAmount: 50000,
          partnerAmount: 35000,
          hqAmount: 15000,
          sharePct: 70,
          adjustmentReason: "Goodwill for the March outage",
          actorEmail: "hq@example.test",
        },
      });

      await tx.impersonationGrant.create({
        data: {
          hqAdminId: `admin-${stamp}`,
          hqAdminEmail: "hq@example.test",
          partnerId: A,
          tokenHash: `hash-${stamp}`,
          expiresAt: new Date(Date.now() + 30 * 60_000),
        },
      });

      const published = await tx.hqAnnouncement.create({
        data: {
          title: `Published ${stamp}`,
          body: "Everyone sees this.",
          publishedAt: new Date(),
        },
        select: { id: true },
      });
      announcementId = published.id;

      const draft = await tx.hqAnnouncement.create({
        data: { title: `Draft ${stamp}`, body: "Nobody sees this yet." },
        select: { id: true },
      });
      draftId = draft.id;

      await tx.hqAnnouncementRead.create({
        data: { announcementId, partnerId: A },
      });

      await tx.featureFlag.create({
        data: { productId: "servd", key: `global-${stamp}`, enabled: true },
      });
      await tx.featureFlag.create({
        data: { productId: "servd", key: `beta-${stamp}`, enabled: true, partnerId: A },
      });
    });
  });

  afterAll(async () => {
    await asSuper(async (tx) => {
      await tx.hqAnnouncement.deleteMany({ where: { title: { contains: stamp } } });
      await tx.featureFlag.deleteMany({ where: { key: { contains: stamp } } });
      await tx.partnerLedgerEntry.deleteMany({ where: { providerRef: `adj:${stamp}` } });
      await tx.territory.deleteMany({ where: { slug: `testville-${stamp}` } });
      await tx.partner.deleteMany({ where: { id: { in: [A, B] } } });
    });
    await prisma.$disconnect();
  });

  // --- 1–3: the partner-scoped tables ---------------------------------------

  it("1. B cannot read A's territory assignment history", async () => {
    // No where clause. Postgres answers.
    const mine = await asPartner<any[]>(A, (tx) => tx.territoryAssignment.findMany());
    const theirs = await asPartner<any[]>(B, (tx) => tx.territoryAssignment.findMany());
    expect(mine.length).toBe(1);
    expect(theirs.length).toBe(0);
  });

  it("2. B cannot read A's ledger adjustments", async () => {
    const mine = await asPartner<any[]>(A, (tx) =>
      tx.partnerLedgerEntry.findMany({ where: { kind: "credit" } }),
    );
    const theirs = await asPartner<any[]>(B, (tx) =>
      tx.partnerLedgerEntry.findMany({ where: { kind: "credit" } }),
    );
    expect(mine.length).toBe(1);
    expect(mine[0].adjustmentReason).toBe("Goodwill for the March outage");
    expect(theirs.length).toBe(0);

    // Not even by primary key — the strongest form of the assertion.
    const byId = await asPartner<any>(B, (tx) =>
      tx.partnerLedgerEntry.findUnique({ where: { providerRef: `adj:${stamp}` } }),
    );
    expect(byId).toBeNull();
  });

  it("2b. a partner cannot WRITE its own ledger row", async () => {
    // A partner writing a ledger entry is a partner writing their own
    // statement. Read-only by policy, not by nobody having tried yet.
    await expect(
      asPartner(A, (tx) =>
        tx.partnerLedgerEntry.create({
          data: {
            partnerId: A,
            productId: "servd",
            merchantId: "self-dealt",
            kind: "credit",
            providerRef: `adj:self-${stamp}`,
            grossAmount: 999999,
            partnerAmount: 999999,
            hqAmount: 0,
            sharePct: 100,
            adjustmentReason: "nice try",
            actorEmail: "partner@example.test",
          },
        }),
      ),
    ).rejects.toThrow();
  });

  it("3. B cannot read A's announcement read receipts", async () => {
    const mine = await asPartner<any[]>(A, (tx) => tx.hqAnnouncementRead.findMany());
    const theirs = await asPartner<any[]>(B, (tx) => tx.hqAnnouncementRead.findMany());
    expect(mine.length).toBe(1);
    expect(theirs.length).toBe(0);
  });

  it("3b. an UNPUBLISHED announcement is invisible to every partner", async () => {
    // The part that would actually leak: a draft naming a city about to lose
    // its licence, read by that city.
    const seen = await asPartner<any[]>(A, (tx) =>
      tx.hqAnnouncement.findMany({ where: { title: { contains: stamp } } }),
    );
    const ids = seen.map((r) => r.id);
    expect(ids).toContain(announcementId);
    expect(ids).not.toContain(draftId);
  });

  it("3c. a global flag is readable by anyone; a partner override is not", async () => {
    const asA = await asPartner<any[]>(A, (tx) =>
      tx.featureFlag.findMany({ where: { key: { contains: stamp } } }),
    );
    const asB = await asPartner<any[]>(B, (tx) =>
      tx.featureFlag.findMany({ where: { key: { contains: stamp } } }),
    );
    expect(asA.map((f) => f.key).sort()).toEqual([`beta-${stamp}`, `global-${stamp}`].sort());
    // "Cebu has the beta and you do not" is not information Cebu's competitor
    // should be able to pull.
    expect(asB.map((f) => f.key)).toEqual([`global-${stamp}`]);
  });

  // --- 4: HQ sees all of it -------------------------------------------------

  it("4. an HQ context reads every one of them", async () => {
    await asSuper(async (tx) => {
      expect(await tx.territoryAssignment.count({ where: { partnerId: A } })).toBe(1);
      expect(await tx.partnerLedgerEntry.count({ where: { providerRef: `adj:${stamp}` } })).toBe(1);
      expect(await tx.impersonationGrant.count({ where: { tokenHash: `hash-${stamp}` } })).toBe(1);
      expect(await tx.hqAnnouncement.count({ where: { title: { contains: stamp } } })).toBe(2);
      expect(await tx.featureFlag.count({ where: { key: { contains: stamp } } })).toBe(2);
    });
  });

  it("4b. a partner cannot enumerate the grants that let HQ into its console", async () => {
    // HQ-only, and A is the SUBJECT of this grant — so this is the case where
    // "my own row" reasoning would wrongly grant access.
    const asA = await asPartner<any[]>(A, (tx) => tx.impersonationGrant.findMany());
    expect(asA.length).toBe(0);
  });
});

// --- 5: the browser roles ---------------------------------------------------

d("anon and authenticated hold no grant on any HQ table", () => {
  const TABLES = [
    "territory_assignments",
    "feature_flags",
    "hq_announcements",
    "hq_announcement_reads",
    "impersonation_grants",
    "cron_runs",
    "territories",
  ];

  it("5. every one of them is 42501 permission denied", async () => {
    // A policy decides which ROWS a role sees. A grant decides whether the role
    // may touch the table at all, and these roles may not: the anon key ships in
    // every browser, and `authenticated` is what PostgREST runs a signed-in user
    // as — which every merchant cashier in this database can obtain.
    for (const role of ["anon", "authenticated"]) {
      for (const table of TABLES) {
        const err = await prisma
          .$transaction(async (tx) => {
            await tx.$executeRawUnsafe(`set local role ${role}`);
            await tx.$executeRawUnsafe(`select 1 from "${table}" limit 1`);
            return null;
          })
          .catch((e: unknown) => e as Error);
        expect(err, `${role} could read ${table}`).toBeTruthy();
        expect(String(err), `${role} on ${table}`).toMatch(/42501|permission denied/i);
      }
    }
  });
});

// --- 8: the backstop ---------------------------------------------------------

d("no table added by H1 is left policy-less", () => {
  it("8. every new table carries at least one policy", async () => {
    const rows = await asSuper<{ tablename: string; n: bigint }[]>(
      (tx) => tx.$queryRaw`
        select t.table_name as tablename,
               (select count(*) from pg_policies p
                 where p.schemaname = 'public' and p.tablename = t.table_name) as n
          from information_schema.tables t
         where t.table_schema = 'public'
           and t.table_name in ('territory_assignments', 'feature_flags',
                                'hq_announcements', 'hq_announcement_reads',
                                'impersonation_grants', 'cron_runs', 'territories')
      `,
    );
    expect(rows.length).toBe(7);
    for (const r of rows) {
      expect(Number(r.n), `${r.tablename} has no policy`).toBeGreaterThan(0);
    }
  });
});
