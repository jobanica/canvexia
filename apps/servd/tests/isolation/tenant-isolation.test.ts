import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

/**
 * EXPLICIT TENANT-ISOLATION VERIFICATION
 *
 * This is the test that proves Phase 1's core promise: a restaurant can never
 * read or write another restaurant's data — enforced by the DATABASE (RLS), not
 * just the app. It seeds two restaurants, then asserts that querying as
 * Restaurant A returns ONLY A's rows, even with no app-level where clause.
 *
 * Requires a live database with RLS applied:
 *   prisma db push && npm run db:rls
 *   DATABASE_URL=... npm run test:isolation
 *
 * Skips automatically if DATABASE_URL is not set, so the offline suite stays
 * green.
 */
const hasDb = !!process.env.DATABASE_URL;
const d = hasDb ? describe : describe.skip;

const prisma = new PrismaClient();

function asTenant<T>(restaurantId: string, fn: (tx: any) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.current_restaurant_id', ${restaurantId}, true)`;
    return fn(tx);
  }) as Promise<T>;
}
function asSuper<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`select set_config('app.is_super_admin', 'on', true)`;
    return fn(tx);
  }) as Promise<T>;
}

let A = "";
let B = "";
const slugA = `iso-a-${randomUUID().slice(0, 8)}`;
const slugB = `iso-b-${randomUUID().slice(0, 8)}`;

d("tenant isolation (RLS)", () => {
  beforeAll(async () => {
    await asSuper(async (tx) => {
      const ra = await tx.restaurant.create({
        data: { name: "Iso A", slug: slugA, status: "active" },
      });
      const rb = await tx.restaurant.create({
        data: { name: "Iso B", slug: slugB, status: "active" },
      });
      A = ra.id;
      B = rb.id;
      const ca = await tx.category.create({
        data: { restaurantId: A, name: "A cat" },
      });
      const cb = await tx.category.create({
        data: { restaurantId: B, name: "B cat" },
      });
      await tx.menuItem.create({
        data: { restaurantId: A, categoryId: ca.id, name: "A item", price: 100 },
      });
      await tx.menuItem.create({
        data: { restaurantId: B, categoryId: cb.id, name: "B item", price: 100 },
      });
    });
  });

  afterAll(async () => {
    if (A || B) {
      await asSuper((tx) =>
        tx.restaurant.deleteMany({ where: { id: { in: [A, B] } } }),
      );
    }
    await prisma.$disconnect();
  });

  it("A sees only its own menu items (no app-level filter)", async () => {
    const items = await asTenant<any[]>(A, (tx) => tx.menuItem.findMany());
    expect(items.length).toBe(1);
    expect(items[0].name).toBe("A item");
  });

  it("B sees only its own menu items", async () => {
    const items = await asTenant<any[]>(B, (tx) => tx.menuItem.findMany());
    expect(items.every((i: { restaurantId: string }) => i.restaurantId === B)).toBe(true);
  });

  it("A cannot read B's restaurant row by id", async () => {
    const row = await asTenant(A, (tx) =>
      tx.restaurant.findUnique({ where: { id: B } }),
    );
    expect(row).toBeNull();
  });

  it("A cannot write into B's tenant (RLS WITH CHECK blocks it)", async () => {
    await expect(
      asTenant(A, (tx) =>
        tx.category.create({ data: { restaurantId: B, name: "sneaky" } }),
      ),
    ).rejects.toThrow();
  });

  it("super-admin context sees both restaurants", async () => {
    const ids = await asSuper<any[]>((tx) =>
      tx.restaurant.findMany({ where: { id: { in: [A, B] } } }),
    );
    expect(ids.length).toBe(2);
  });

  it("menu_item_translations are tenant-isolated", async () => {
    await asSuper(async (tx) => {
      const cat = await tx.category.create({ data: { restaurantId: A, name: "TX cat" } });
      const item = await tx.menuItem.create({
        data: { restaurantId: A, categoryId: cat.id, name: "TX item", price: 100 },
      });
      await tx.menuItemTranslation.create({
        data: { restaurantId: A, menuItemId: item.id, locale: "fil", name: "Isda" },
      });
    });
    const aTr = await asTenant<any[]>(A, (tx) => tx.menuItemTranslation.findMany());
    const bTr = await asTenant<any[]>(B, (tx) => tx.menuItemTranslation.findMany());
    expect(aTr.length).toBeGreaterThanOrEqual(1);
    expect(bTr.length).toBe(0);
  });

  it("employees are tenant-isolated", async () => {
    await asSuper((tx) =>
      tx.employee.create({ data: { restaurantId: A, fullName: "Iso Employee" } }),
    );
    const aEmp = await asTenant<any[]>(A, (tx) => tx.employee.findMany());
    const bEmp = await asTenant<any[]>(B, (tx) => tx.employee.findMany());
    expect(aEmp.length).toBeGreaterThanOrEqual(1);
    expect(bEmp.length).toBe(0);
  });

  it("inventory_items are tenant-isolated", async () => {
    await asSuper((tx) =>
      tx.inventoryItem.create({
        data: { restaurantId: A, name: "Beef", unit: "kg", stockQty: 10, costPerUnit: 50000 },
      }),
    );
    const aInv = await asTenant<any[]>(A, (tx) => tx.inventoryItem.findMany());
    const bInv = await asTenant<any[]>(B, (tx) => tx.inventoryItem.findMany());
    expect(aInv.length).toBeGreaterThanOrEqual(1);
    expect(bInv.length).toBe(0);
  });

  it("restaurant_invoices are tenant-isolated", async () => {
    // Seed an invoice for A only.
    await asSuper((tx) =>
      tx.restaurantInvoice.create({
        data: {
          restaurantId: A,
          amount: 199900,
          status: "open",
          periodStart: new Date(),
          periodEnd: new Date(),
        },
      }),
    );
    const aInvoices = await asTenant<any[]>(A, (tx) => tx.restaurantInvoice.findMany());
    const bInvoices = await asTenant<any[]>(B, (tx) => tx.restaurantInvoice.findMany());
    expect(aInvoices.length).toBe(1);
    expect(bInvoices.length).toBe(0);
  });
});
