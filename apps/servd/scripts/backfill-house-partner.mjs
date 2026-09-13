#!/usr/bin/env node
/**
 * Move every existing restaurant under the house partner (CANVEXIA Davao).
 *
 *   node scripts/backfill-house-partner.mjs            # dry run — prints a plan, writes nothing
 *   node scripts/backfill-house-partner.mjs --apply    # actually does it
 *
 * WHY THIS IS A SCRIPT AND NOT PART OF THE MIGRATION. Adding the column is
 * reversible; deciding who owns every merchant on the platform is not. There is
 * no "undo" that can tell a restaurant backfilled by mistake from one a partner
 * legitimately signed five minutes later. So the plan is printed first, read by
 * a person, and only then applied.
 *
 * Run AFTER prisma/manual/add-partner-tenancy.sql and BEFORE `npm run db:rls`.
 * That order matters: once the partner policies are live, a restaurant with a
 * null partnerId belongs to nobody, and a partner-scoped query will correctly
 * refuse to return it.
 *
 * Idempotent. It only ever fills a NULL partnerId, so re-running touches nothing
 * and a restaurant already assigned to a real partner is never reassigned.
 */

import { PrismaClient } from "@prisma/client";

// Load env from .env / .env.local (node doesn't do this automatically).
for (const f of [".env", ".env.local"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* file may not exist — ignore */
  }
}

const APPLY = process.argv.includes("--apply");

/**
 * The house partner. HQ's own operator account: the first partner, run by
 * CANVEXIA itself, so the partner model is exercised on real revenue before any
 * external operator signs.
 *
 * It goes through the same code paths as any external partner — tier "operator",
 * a real revenue share — because a house account with special-cased billing
 * proves nothing about the billing everyone else will use. The statement it
 * generates nets out internally; that is accounting, not a reason to make the
 * code lie.
 *
 * collectionMode is the one honest difference: these merchants already pay
 * CANVEXIA directly through the platform gateway, which is exactly what
 * "hq_collects" means. External operators default to collecting themselves.
 */
const HOUSE = {
  name: process.env.HOUSE_PARTNER_NAME ?? "CANVEXIA Davao",
  email: process.env.HOUSE_PARTNER_EMAIL ?? "davao@canvexia.ph",
  slug: "canvexia-davao",
  territory: "Davao City",
  tier: "operator",
  revenueSharePct: 70,
  collectionMode: "hq_collects",
  brandMode: "powered_by",
  status: "approved",
};

const prisma = new PrismaClient();

function asSuper(fn) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.is_super_admin', 'on', true)`;
    return fn(tx);
  });
}

async function assertMigrated() {
  const [{ present }] = await prisma.$queryRaw`
    select exists (
      select 1 from information_schema.columns
      where table_name = 'restaurants' and column_name = 'partnerId'
    ) as present`;
  if (!present) {
    console.error(
      'restaurants."partnerId" does not exist.\n' +
        "Run prisma/manual/add-partner-tenancy.sql first — this script assigns the\n" +
        "column, it does not create it.",
    );
    process.exit(1);
  }
}

async function main() {
  await assertMigrated();

  const result = await asSuper(async (tx) => {
    const existing = await tx.partner.findFirst({
      where: { OR: [{ slug: HOUSE.slug }, { email: HOUSE.email }] },
      select: { id: true, name: true, slug: true, tier: true, revenueSharePct: true },
    });

    const [{ unassigned }] = await tx.$queryRaw`
      select count(*)::int as unassigned from restaurants where "partnerId" is null`;
    const [{ assigned }] = await tx.$queryRaw`
      select count(*)::int as assigned from restaurants where "partnerId" is not null`;

    return { existing, unassigned, assigned };
  });

  const { existing, unassigned, assigned } = result;

  console.log("");
  console.log("  House partner   :", HOUSE.name, `(${HOUSE.slug})`);
  console.log("  Already exists  :", existing ? `yes — ${existing.id}` : "no, will be created");
  console.log("  Split           :", `partner ${HOUSE.revenueSharePct}% / HQ ${100 - HOUSE.revenueSharePct}%`);
  console.log("");
  console.log("  Restaurants with no partner :", unassigned, "→ would move to the house partner");
  console.log("  Restaurants already assigned:", assigned, "→ left alone");
  console.log("");

  if (unassigned === 0 && existing) {
    console.log("  Nothing to do. Already backfilled.");
    return;
  }

  if (!APPLY) {
    console.log("  DRY RUN — nothing was written.");
    console.log("  Re-run with --apply once the numbers above look right.");
    return;
  }

  const { partnerId, moved } = await asSuper(async (tx) => {
    let partner = existing;
    if (!partner) {
      partner = await tx.partner.create({
        data: {
          name: HOUSE.name,
          email: HOUSE.email,
          status: HOUSE.status,
          tier: HOUSE.tier,
          slug: HOUSE.slug,
          territory: HOUSE.territory,
          revenueSharePct: HOUSE.revenueSharePct,
          collectionMode: HOUSE.collectionMode,
          brandMode: HOUSE.brandMode,
        },
        select: { id: true },
      });
    }

    // Only ever fills a NULL. A restaurant that already belongs to a partner is
    // not touched, which is what makes re-running this safe.
    const moved = await tx.$executeRaw`
      update restaurants set "partnerId" = ${partner.id} where "partnerId" is null`;

    return { partnerId: partner.id, moved };
  });

  console.log("  ✅ House partner:", partnerId);
  console.log("  ✅ Restaurants moved:", moved);
  console.log("");
  console.log("  Next: npm run db:rls — install the partner policies.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
