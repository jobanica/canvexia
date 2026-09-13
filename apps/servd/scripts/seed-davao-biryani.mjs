// One-off importer for Davao Biryani's menu (categories + items + prices).
// Run against the live DB (uses DIRECT_URL to avoid PgBouncer issues):
//   node scripts/seed-davao-biryani.mjs            # defaults to slug davao-biryani-2
//   node scripts/seed-davao-biryani.mjs my-slug    # other slug
// Idempotent: re-running skips items/categories that already exist.
import { PrismaClient } from "@prisma/client";

for (const f of [".env", ".env.local"]) {
  try {
    process.loadEnvFile(f);
  } catch {
    /* ignore */
  }
}

const prisma = new PrismaClient({
  datasourceUrl: process.env.DIRECT_URL || process.env.DATABASE_URL,
});

function asSuper(fn) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("select set_config('app.is_super_admin','on',true)");
    return fn(tx);
  });
}

const peso = (p) => Math.round(p * 100); // pesos -> centavos

// [name, pricePesos, description?]
const MENU = [
  {
    category: "Main",
    items: [
      ["Whole Chicken Tikka", 300, "Charcoal grilled · serves 3–4"],
      ["Chicken Tikka Biryani (serves 3)", 599],
      ["Chicken Tikka Biryani (serves 5)", 799],
      ["Authentic Chicken Biryani (solo)", 230, "Quarter size"],
      ["Chicken Tikka Biryani (solo)", 250, "Quarter size"],
      ["Beef Biryani (solo)", 350],
      ["Mutton Biryani (solo)", 420],
      ["Butter Chicken", 350, "Serves 2–3"],
      ["Half Chicken (no rice)", 170],
      ["Chicken Masala", 180],
      ["Beef Masala", 300],
      ["Mutton Masala", 370],
      ["Chana", 100],
      ["Raita", 120, "Yogurt salad"],
      ["Additional Biryani Rice", 100],
    ],
  },
  {
    category: "Bread items",
    items: [
      ["7 Layers Paratha", 95],
      ["Sweet Cheese Paratha", 150, "8 slices · good for 4"],
      ["Chocolate Paratha", 190, "8 slices · serves 4"],
      ["Roti", 55],
      ["Chicken Shawarma", 190],
      ["Chicken Shawarma w/ Cheese", 210],
      ["Beef Shawarma", 265],
    ],
  },
  {
    category: "Drinks",
    items: [
      ["Lassi", 150],
      ["Mango Shake", 120],
      ["Avocado Shake", 140],
      ["Durian Shake", 160],
      ["Juices", 89, "Mango, pineapple & 4 seasons"],
      ["Chai", 85],
      ["Premium English Tea", 95, "Flavoured"],
    ],
  },
];

const SLUG = process.argv[2] || "davao-biryani-2";

await asSuper(async (tx) => {
  const restaurant = await tx.restaurant.findUnique({ where: { slug: SLUG } });
  if (!restaurant) throw new Error(`No restaurant with slug "${SLUG}"`);

  let createdCats = 0;
  let createdItems = 0;
  let sortCat = 0;

  for (const section of MENU) {
    let category = await tx.category.findFirst({
      where: { restaurantId: restaurant.id, name: section.category },
    });
    if (!category) {
      category = await tx.category.create({
        data: { restaurantId: restaurant.id, name: section.category, sortOrder: sortCat },
      });
      createdCats++;
    }
    sortCat++;

    let sortItem = 0;
    for (const [name, pricePesos, description] of section.items) {
      const exists = await tx.menuItem.findFirst({
        where: { restaurantId: restaurant.id, name },
      });
      if (!exists) {
        await tx.menuItem.create({
          data: {
            restaurantId: restaurant.id,
            categoryId: category.id,
            name,
            description: description ?? null,
            price: peso(pricePesos),
            isAvailable: true,
            sortOrder: sortItem,
          },
        });
        createdItems++;
      }
      sortItem++;
    }
  }

  console.log(`✅ ${restaurant.name}: +${createdCats} categories, +${createdItems} items`);
});

await prisma.$disconnect();
