// Seeds the city list behind canvexia.com's territory finder.
//
//   node packages/db/prisma/seed-territories.mjs
//   pnpm --filter @servd/db db:seed:territories
//
// Idempotent: upserts on `slug`, so re-running after moving a city between
// tiers corrects the fee in place. It NEVER touches `status` on a row that
// already exists — a territory someone has reserved or bought must not be
// handed back to "available" by a re-seed. That is the whole reason this is an
// upsert with two different payloads rather than one.
import { PrismaClient } from "@prisma/client";
import { allTerritories } from "./territories.mjs";

for (const f of [".env", ".env.local"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* file may not exist — ignore */
  }
}

const prisma = new PrismaClient();

// `territories` is locked to the super-admin context (add-partner-waitlist.sql),
// so a seed that does not set the GUC writes nothing and reports success —
// which is why this wrapper exists rather than a bare prisma call.
async function asSuper(fn) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.is_super_admin', 'on', true)`;
    return fn(tx);
  });
}

async function main() {
  const rows = allTerritories();

  // One slug appearing twice would mean two cities silently collapsing into
  // one row. Caught here rather than in production, where the symptom is a
  // missing city nobody notices.
  const seen = new Set();
  for (const r of rows) {
    if (seen.has(r.slug)) throw new Error(`duplicate territory slug: ${r.slug}`);
    seen.add(r.slug);
  }

  let created = 0;
  let updated = 0;

  // Serial, not Promise.all: ~143 rows, and a transaction per upsert keeps the
  // pooler out of trouble. This runs once in a while, not on a request.
  for (const r of rows) {
    const before = await asSuper((tx) =>
      tx.territory.findUnique({ where: { slug: r.slug }, select: { id: true } }),
    );
    await asSuper((tx) =>
      tx.territory.upsert({
        where: { slug: r.slug },
        create: r,
        // No `status` here — see the note at the top.
        update: {
          name: r.name,
          province: r.province,
          region: r.region,
          tier: r.tier,
          licenseFee: r.licenseFee,
        },
      }),
    );
    if (before) updated += 1;
    else created += 1;
  }

  console.log(`territories: ${created} created, ${updated} updated, ${rows.length} total`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
