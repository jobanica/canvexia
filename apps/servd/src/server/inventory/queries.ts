import { tenantDb } from "@/server/tenancy/scoped-db";
import type { ProductStockRow } from "@/components/admin/inventory/ProductStockTable";

export interface ReorderSuggestion {
  id: string;
  name: string;
  unit: string;
  stockQty: number;
  reorderLevel: number;
  costPerUnit: number;
  supplierId: string | null;
  supplierName: string | null;
  avgDailyUse: number; // rounded for display
  suggestedQty: number;
  estCost: number; // centavos
}

/**
 * Auto-reorder suggestions from usage velocity: average daily consumption over
 * the last 30 days (from `sale` stock movements) → enough to cover the next 14
 * days, topped up to at least 2× the reorder level. Only items that need
 * restocking are returned.
 */
export async function getReorderSuggestions(restaurantId: string): Promise<ReorderSuggestion[]> {
  const WINDOW_DAYS = 30;
  const TARGET_DAYS = 14;
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
  try {
    return await tenantDb(restaurantId, async (tx) => {
      const items = await tx.inventoryItem.findMany({
        orderBy: { name: "asc" },
        select: INVENTORY_FIELDS,
      });
      const moves = await tx.stockMovement.findMany({
        where: { reason: "sale", createdAt: { gte: since } },
        select: { inventoryItemId: true, changeQty: true },
      });
      const consumed = new Map<string, number>();
      for (const m of moves) {
        consumed.set(m.inventoryItemId, (consumed.get(m.inventoryItemId) ?? 0) + Math.max(0, -m.changeQty));
      }

      const out: ReorderSuggestion[] = [];
      for (const i of items) {
        const used = consumed.get(i.id) ?? 0;
        const avgDaily = used / WINDOW_DAYS;
        const targetStock = Math.max(i.reorderLevel * 2, avgDaily * TARGET_DAYS);
        const suggestedQty = Math.max(0, Math.ceil(targetStock - i.stockQty));
        if (suggestedQty <= 0) continue;
        out.push({
          id: i.id,
          name: i.name,
          unit: i.unit,
          stockQty: i.stockQty,
          reorderLevel: i.reorderLevel,
          costPerUnit: i.costPerUnit,
          supplierId: i.supplierId,
          supplierName: i.supplier?.name ?? null,
          avgDailyUse: Math.round(avgDaily * 100) / 100,
          suggestedQty,
          estCost: suggestedQty * i.costPerUnit,
        });
      }
      return out;
    });
  } catch {
    return [];
  }
}

/**
 * Inventory items with supplier name + a low-stock flag.
 *
 * Columns are listed explicitly rather than taken wholesale. A bare findMany
 * asks for every column in the Prisma model, so the day this file learns about
 * a column the database hasn't been given yet, every inventory screen 500s.
 * Naming them keeps that failure confined to the one query that wants the new
 * column — see listIngredients below.
 */
const INVENTORY_FIELDS = {
  id: true,
  name: true,
  unit: true,
  stockQty: true,
  costPerUnit: true,
  reorderLevel: true,
  supplierId: true,
  supplier: { select: { name: true } },
} as const;

export async function listInventory(restaurantId: string) {
  const items = await tenantDb(restaurantId, (tx) =>
    tx.inventoryItem.findMany({ orderBy: { name: "asc" }, select: INVENTORY_FIELDS }),
  );
  return items.map((i) => ({ ...i, low: i.stockQty <= i.reorderLevel }));
}

/**
 * Ingredients only — the stock rows that aren't a product's own units.
 *
 * Before the menuItemId migration runs there are no product rows, so every row
 * is an ingredient and the unfiltered list is the right answer.
 */
export async function listIngredients(restaurantId: string) {
  try {
    const items = await tenantDb(restaurantId, (tx) =>
      tx.inventoryItem.findMany({
        where: { menuItemId: null },
        orderBy: { name: "asc" },
        select: INVENTORY_FIELDS,
      }),
    );
    return items.map((i) => ({ ...i, low: i.stockQty <= i.reorderLevel }));
  } catch {
    return listInventory(restaurantId);
  }
}

/**
 * Whether the database can hold product stock yet.
 *
 * The link column ships in a manual migration, and until it's run every write
 * from the Products tab fails. Asking once lets the screen say so plainly
 * instead of letting the first click blow up into a generic app error — the
 * failure is the same either way; only the explanation differs.
 */
export async function isProductStockReady(restaurantId: string): Promise<boolean> {
  try {
    await tenantDb(restaurantId, (tx) =>
      tx.inventoryItem.findFirst({ where: { menuItemId: { not: null } }, select: { id: true } }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Every sellable product with its stock, tracked or not.
 *
 * Untracked products are included on purpose. A shop that has just switched
 * this on needs to see the things it sells in order to start counting them —
 * a screen listing only what's already tracked starts empty and stays empty.
 *
 * The name comes from the menu item, not the stock row, so renaming a product
 * can't leave the inventory screen showing a name the shop stopped using.
 */
export async function listProductStock(restaurantId: string): Promise<ProductStockRow[]> {
  const items = await tenantDb(restaurantId, (tx) =>
    tx.menuItem.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        price: true,
        imageUrl: true,
        isAvailable: true,
        category: { select: { name: true } },
      },
    }),
  );

  // Best-effort: the menuItemId column ships in a manual migration, so before
  // it runs every product simply reads as untracked rather than erroring.
  type StockRow = {
    id: string;
    menuItemId: string | null;
    unit: string;
    stockQty: number;
    reorderLevel: number;
    costPerUnit: number;
  };
  let stock: StockRow[] = [];
  try {
    stock = await tenantDb(restaurantId, (tx) =>
      tx.inventoryItem.findMany({
        where: { menuItemId: { not: null } },
        select: {
          id: true,
          menuItemId: true,
          unit: true,
          stockQty: true,
          reorderLevel: true,
          costPerUnit: true,
        },
      }),
    );
  } catch {
    /* not migrated yet */
  }
  const byMenuItem = new Map(
    stock.flatMap((s) => (s.menuItemId ? [[s.menuItemId, s] as const] : [])),
  );

  return items.map((m) => {
    const s = byMenuItem.get(m.id);
    return {
      menuItemId: m.id,
      name: m.name,
      categoryName: m.category?.name ?? "",
      price: m.price,
      imageUrl: m.imageUrl,
      isAvailable: m.isAvailable,
      inventoryItemId: s?.id ?? null,
      unit: s?.unit ?? "pc",
      stockQty: s?.stockQty ?? 0,
      reorderLevel: s?.reorderLevel ?? 0,
      costPerUnit: s?.costPerUnit ?? 0,
      low: s != null && s.stockQty <= s.reorderLevel,
    };
  });
}

export function listSuppliers(restaurantId: string) {
  return tenantDb(restaurantId, (tx) =>
    tx.supplier.findMany({ orderBy: { name: "asc" } }),
  );
}

export function listPurchaseOrders(restaurantId: string) {
  return tenantDb(restaurantId, (tx) =>
    tx.purchaseOrder.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        supplier: { select: { name: true } },
        items: { select: { quantity: true, unitCost: true } },
      },
    }),
  );
}

export function getPurchaseOrder(restaurantId: string, id: string) {
  return tenantDb(restaurantId, (tx) =>
    tx.purchaseOrder.findFirst({
      where: { id },
      include: {
        supplier: true,
        items: { include: { inventoryItem: { select: { name: true, unit: true } } } },
      },
    }),
  );
}

/** Recipe (bill of materials) for a menu item. */
export function getRecipe(restaurantId: string, menuItemId: string) {
  return tenantDb(restaurantId, (tx) =>
    tx.recipeComponent.findMany({
      where: { menuItemId },
      include: { inventoryItem: { select: { name: true, unit: true } } },
    }),
  );
}

/** COGS + top consumed ingredients over a window (from `sale` movements). */
export function getInventoryReport(restaurantId: string, from: Date, to: Date) {
  return tenantDb(restaurantId, (tx) =>
    tx.$queryRaw<{ name: string; used: number; cogs: number }[]>`
      select i.name as name,
             sum(-m."changeQty")::float8 as used,
             sum(-m."changeQty" * coalesce(m."unitCost", 0))::float8 as cogs
      from stock_movements m
      join inventory_items i on i.id = m."inventoryItemId"
      where m."restaurantId" = ${restaurantId}
        and m.reason = 'sale'
        and m."createdAt" between ${from} and ${to}
      group by i.name
      order by cogs desc`,
  );
}

// ------------------------------------------------------------------ recipes

export interface RecipeRow {
  menuItemId: string;
  name: string;
  categoryName: string;
  /** Selling price, centavos. */
  price: number;
  components: {
    inventoryItemId: string;
    name: string;
    unit: string;
    quantity: number;
    /** What this much of the ingredient costs, centavos. */
    cost: number;
  }[];
  /** Sum of the components' costs — what one serving costs to make. */
  recipeCost: number;
}

/**
 * Every dish with its recipe, plus the ingredients available to add.
 *
 * The recipe is what makes a sale deduct stock: sell one adobo, and each
 * ingredient listed here comes off by the quantity given. Without one, selling
 * a dish moves nothing — which is the state every restaurant was in, because
 * the data model and the deduction engine both existed and there was no screen
 * to type a recipe into.
 *
 * Dishes with no recipe are listed too, and first: an empty recipe is the thing
 * that needs attention, and a screen that only shows what's already set up
 * gives an owner nowhere to start.
 */
export async function listRecipes(restaurantId: string): Promise<RecipeRow[]> {
  const [items, components, ingredients] = await Promise.all([
    tenantDb(restaurantId, (tx) =>
      tx.menuItem.findMany({
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: { id: true, name: true, price: true, category: { select: { name: true } } },
      }),
    ),
    tenantDb(restaurantId, (tx) =>
      tx.recipeComponent.findMany({
        select: { menuItemId: true, inventoryItemId: true, quantity: true },
      }),
    ).catch(() => []),
    listIngredients(restaurantId).catch(() => []),
  ]);

  const ingredientById = new Map(ingredients.map((i) => [i.id, i]));
  const byItem = new Map<string, RecipeRow["components"]>();
  for (const c of components) {
    const ing = ingredientById.get(c.inventoryItemId);
    // An ingredient that's since been deleted leaves a dangling component;
    // skip it rather than rendering a blank row nobody can act on.
    if (!ing) continue;
    const list = byItem.get(c.menuItemId) ?? [];
    list.push({
      inventoryItemId: c.inventoryItemId,
      name: ing.name,
      unit: ing.unit,
      quantity: c.quantity,
      cost: Math.round(c.quantity * ing.costPerUnit),
    });
    byItem.set(c.menuItemId, list);
  }

  return items.map((m) => {
    const comps = (byItem.get(m.id) ?? []).sort((a, b) => (a.name < b.name ? -1 : 1));
    return {
      menuItemId: m.id,
      name: m.name,
      categoryName: m.category?.name ?? "",
      price: m.price,
      components: comps,
      recipeCost: comps.reduce((s, c) => s + c.cost, 0),
    };
  });
}

/** Ingredients that can go into a recipe (never a product's own stock row). */
export async function listRecipeIngredients(restaurantId: string) {
  const rows = await listIngredients(restaurantId).catch(() => []);
  return rows.map((i) => ({ id: i.id, name: i.name, unit: i.unit, costPerUnit: i.costPerUnit }));
}
