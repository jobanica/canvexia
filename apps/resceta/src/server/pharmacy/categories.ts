import "server-only";
import type { Prisma } from "@prisma/client";
import { pharmacyDb, systemDb } from "@/server/tenancy/scoped-db";

/**
 * CATEGORIES, MANAGEABLE.
 *
 * The same defect this codebase keeps producing: `pharmacy_categories` has
 * existed since the vertical was written, the product form has always offered a
 * category dropdown, and there was NO WAY TO PUT ANYTHING IN IT. Every pharmacy
 * saw an empty select and a column that could never be set — until the CSV
 * importer started creating them as a side effect, which is not a screen.
 *
 * A pharmacy sorts its shelves by category: analgesics here, antibiotics there,
 * the fridge over there. Without it the catalogue is one alphabetical list of
 * four hundred things.
 */

export interface CategoryDetail {
  id: string;
  name: string;
  /** How many products are filed under it — a category with none can go. */
  products: number;
}

export async function listCategoriesWithCounts(pharmacyId: string): Promise<CategoryDetail[]> {
  const rows = await pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacyCategory.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, _count: { select: { products: true } } },
    }),
  );
  return rows.map((c) => ({ id: c.id, name: c.name, products: c._count.products }));
}

export async function createCategory(input: {
  pharmacyId: string;
  name: string;
  actorStaffId: string;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "A category needs a name." };

  try {
    return await systemDb(async (tx) => {
      // Case-insensitively, because "Antibiotics" and "antibiotics" on the same
      // dropdown is two shelves for one shelf.
      const clash = await tx.pharmacyCategory.findFirst({
        where: { pharmacyId: input.pharmacyId, name: { equals: name, mode: "insensitive" } },
        select: { id: true },
      });
      if (clash) return { ok: false as const, error: `${name} already exists.` };

      const made = await tx.pharmacyCategory.create({
        data: { pharmacyId: input.pharmacyId, name },
        select: { id: true },
      });
      await audit(tx, input.actorStaffId, "pharmacy.category_created", made.id, { name });
      return { ok: true as const, id: made.id };
    });
  } catch {
    return { ok: false, error: "Couldn't save that category. Try again." };
  }
}

export async function renameCategory(input: {
  pharmacyId: string;
  categoryId: string;
  name: string;
  actorStaffId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const name = input.name.trim();
  if (!name) return { ok: false, error: "A category needs a name." };

  try {
    return await systemDb(async (tx) => {
      const clash = await tx.pharmacyCategory.findFirst({
        where: {
          pharmacyId: input.pharmacyId,
          name: { equals: name, mode: "insensitive" },
          id: { not: input.categoryId },
        },
        select: { id: true },
      });
      if (clash) return { ok: false as const, error: `${name} already exists.` };

      // The pharmacy is in the WHERE clause, so an id from another pharmacy
      // updates zero rows rather than being checked and then acted on.
      const res = await tx.pharmacyCategory.updateMany({
        where: { id: input.categoryId, pharmacyId: input.pharmacyId },
        data: { name },
      });
      if (res.count === 0) return { ok: false as const, error: "That category was not found." };

      await audit(tx, input.actorStaffId, "pharmacy.category_renamed", input.categoryId, { name });
      return { ok: true as const };
    });
  } catch {
    return { ok: false, error: "Couldn't rename that category. Try again." };
  }
}

/**
 * Remove a category.
 *
 * THE PRODUCTS SURVIVE. `categoryId` is SET NULL on delete, so deleting a
 * category un-files its products rather than taking them with it — but that is
 * a surprise if you thought you were deleting an empty one, so a category with
 * products in it is refused and says how many. Emptying it first is a decision
 * somebody makes on purpose.
 */
export async function deleteCategory(input: {
  pharmacyId: string;
  categoryId: string;
  actorStaffId: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    return await systemDb(async (tx) => {
      const category = await tx.pharmacyCategory.findFirst({
        where: { id: input.categoryId, pharmacyId: input.pharmacyId },
        select: { id: true, name: true, _count: { select: { products: true } } },
      });
      if (!category) return { ok: false as const, error: "That category was not found." };
      if (category._count.products > 0) {
        return {
          ok: false as const,
          error: `${category.name} still has ${category._count.products} product${
            category._count.products === 1 ? "" : "s"
          } in it. Move them first.`,
        };
      }

      await tx.pharmacyCategory.delete({ where: { id: category.id } });
      await audit(tx, input.actorStaffId, "pharmacy.category_deleted", category.id, {
        name: category.name,
      });
      return { ok: true as const };
    });
  } catch {
    return { ok: false, error: "Couldn't remove that category. Try again." };
  }
}

/** Move every product from one category to another (or to none). */
export async function recategorise(input: {
  pharmacyId: string;
  fromId: string;
  toId: string | null;
  actorStaffId: string;
}): Promise<{ ok: true; moved: number } | { ok: false; error: string }> {
  if (input.fromId === input.toId) return { ok: false, error: "Pick a different category." };

  try {
    return await systemDb(async (tx) => {
      // Both ends must be this pharmacy's, or a product ends up filed under
      // another pharmacy's category.
      const ids = [input.fromId, ...(input.toId ? [input.toId] : [])];
      const found = await tx.pharmacyCategory.findMany({
        where: { id: { in: ids }, pharmacyId: input.pharmacyId },
        select: { id: true },
      });
      if (found.length !== ids.length) {
        return { ok: false as const, error: "That category was not found." };
      }

      const res = await tx.pharmacyProduct.updateMany({
        where: { pharmacyId: input.pharmacyId, categoryId: input.fromId },
        data: { categoryId: input.toId },
      });
      await audit(tx, input.actorStaffId, "pharmacy.category_moved", input.fromId, {
        to: input.toId,
        moved: res.count,
      });
      return { ok: true as const, moved: res.count };
    });
  } catch {
    return { ok: false, error: "Couldn't move those products. Try again." };
  }
}

async function audit(
  tx: Prisma.TransactionClient,
  actorStaffId: string,
  action: string,
  entityId: string,
  after: unknown,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorType: "merchant",
      actorStaffId,
      action,
      entityType: "pharmacy_category",
      entityId,
      after: after as Prisma.InputJsonValue,
    },
  });
}
