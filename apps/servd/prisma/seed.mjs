// Seeds reference data + two demo restaurants so tenant isolation can be tested.
// Run in the trusted super-admin context so RLS lets us write across tenants.
//
//   node prisma/seed.mjs
//
// NOTE: this seeds Servd's own tables only. Linking staff logins requires
// creating Supabase auth users (separate step, documented in README).
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

// Load env from .env / .env.local (node doesn't do this automatically).
for (const f of [".env", ".env.local"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* file may not exist — ignore */
  }
}

const prisma = new PrismaClient();

async function asSuper(fn) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.is_super_admin', 'on', true)`;
    return fn(tx);
  });
}

// Plan tiers (centavos). Tiers ascend: Free (essentials, no monthly fee) →
// Growth (brand online + marketing + AI menu import, adds custom domain) →
// Business (everything). Mirrors src/lib/billing/catalog.ts.
const PLANS = [
  {
    id: "00000000-0000-0000-0000-0000000000a1",
    name: "Free",
    priceMonthly: 0, // free forever
    limits: { maxTables: 5, maxStaff: 3, smsIncluded: 0 },
    modules: [],
  },
  {
    id: "00000000-0000-0000-0000-0000000000a2",
    name: "Growth",
    priceMonthly: 89900, // ₱899 — adds custom domain + online ordering/marketing + AI menu import
    limits: { maxTables: 20, maxStaff: 15, smsIncluded: 200 },
    modules: ["custom_domain"],
  },
  {
    id: "00000000-0000-0000-0000-0000000000a3",
    name: "Business",
    priceMonthly: 179900, // ₱1,799 — every feature (accounting, inventory, HR…)
    limits: { smsIncluded: 1000 }, // unlimited tables & staff
    modules: ["inventory", "hris", "custom_domain"],
  },
];

await asSuper(async (tx) => {
  let plan; // default (cheapest) plan, used for demo trials
  for (const p of PLANS) {
    const created = await tx.plan.upsert({
      where: { id: p.id },
      update: { priceMonthly: p.priceMonthly, limits: p.limits, trialDays: 30 },
      create: {
        id: p.id,
        name: p.name,
        priceMonthly: p.priceMonthly,
        limits: p.limits,
        trialDays: 30,
      },
    });
    for (const module of p.modules) {
      await tx.planModule.upsert({
        where: { planId_module: { planId: p.id, module } },
        update: { enabled: true },
        create: { planId: p.id, module, enabled: true },
      });
    }
    if (!plan) plan = created;
  }

  for (const r of [
    { name: "Mango Grill", slug: "mango-grill", primary: "#1F8A4C" },
    { name: "Guava Cafe", slug: "guava-cafe", primary: "#7A3FF2" },
  ]) {
    const restaurant = await tx.restaurant.upsert({
      where: { slug: r.slug },
      update: {},
      create: {
        name: r.name,
        slug: r.slug,
        status: "active",
        planId: plan.id,
        displayName: r.name,
        brandPrimaryColor: r.primary,
      },
    });

    const category = await tx.category.create({
      data: { restaurantId: restaurant.id, name: "Mains", sortOrder: 0 },
    });

    await tx.menuItem.create({
      data: {
        restaurantId: restaurant.id,
        categoryId: category.id,
        name: `${r.name} Signature Plate`,
        price: 25000,
      },
    });

    await tx.table.create({
      data: {
        restaurantId: restaurant.id,
        tableNumber: "1",
        qrToken: randomUUID().replace(/-/g, ""),
      },
    });

    // 30-day trial subscription on the default (Free) plan.
    const existingSub = await tx.subscription.findFirst({
      where: { restaurantId: restaurant.id },
    });
    if (!existingSub) {
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 30);
      await tx.subscription.create({
        data: {
          restaurantId: restaurant.id,
          planId: plan.id,
          status: "trialing",
          trialEndsAt,
          currentPeriodEnd: trialEndsAt,
        },
      });
    }

    console.log(`Seeded ${r.name} (/${r.slug})`);
  }
});

await prisma.$disconnect();
console.log("✅ Seed complete.");
