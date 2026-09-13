import "server-only";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { notifyCustomer } from "@/server/sms/notify";
import {
  planDeductions,
  productStockLinks,
  productsToDisable,
  type StockLink,
} from "@/lib/inventory/deductions";

/**
 * Takes an order's stock out of inventory once it's done.
 *
 * Covers both ways stock is kept: recipe ingredients consumed by a dish, and
 * products counted one-for-one as they're sold. The arithmetic for both lives
 * in lib/inventory/deductions.ts; this does the reading and writing.
 *
 * Idempotent via order.inventoryDeductedAt — safe to call more than once.
 * Records a `sale` movement per row (with the cost at the time, for COGS), and
 * if autoOutOfStock is on, pulls anything that hit zero off the menu.
 * Best-effort: never throws into the order flow.
 *
 * `only` is for a SECOND ROUND: a table that has eaten, had its stock taken
 * out, and then ordered more onto the same bill. That order is already stamped
 * as deducted, so the normal call returns immediately and the extra dishes come
 * out of the kitchen without ever coming out of stock. Passing just the new
 * lines deducts exactly those, skips the stamp check, and deliberately does NOT
 * re-stamp — the stamp still means "the first round was accounted for", and
 * moving it would let a genuinely undeducted order slip through.
 */
export async function deductForOrder(
  restaurantId: string,
  orderId: string,
  only?: readonly { menuItemId: string | null; quantity: number }[],
): Promise<void> {
  // Items that just crossed below their reorder level → alert after commit.
  const newlyLow: string[] = [];
  let alertPhone: string | null = null;
  try {
    await tenantDb(restaurantId, async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId },
        select: { inventoryDeductedAt: true, items: { select: { menuItemId: true, quantity: true } } },
      });
      if (!order) return;
      // The stamp guards the whole-order call only; an explicit line list has
      // already been decided to be new.
      if (!only && order.inventoryDeductedAt) return;
      const lines = only ?? order.items;
      if (lines.length === 0) return;

      const restaurant = await tx.restaurant.findFirstOrThrow({
        select: { autoOutOfStock: true, lowStockAlertPhone: true },
      });
      alertPhone = restaurant.lowStockAlertPhone ?? null;

      const menuItemIds = [
        ...new Set(lines.map((i) => i.menuItemId).filter((id): id is string => id != null)),
      ];

      const recipes: StockLink[] = await tx.recipeComponent.findMany({
        where: { menuItemId: { in: menuItemIds } },
        select: { menuItemId: true, inventoryItemId: true, quantity: true },
      });

      // Products whose own units are counted. Read separately and best-effort:
      // the menuItemId column ships in a manual migration, and a kitchen that
      // hasn't run it yet must still get its ingredients deducted.
      let products: StockLink[] = [];
      try {
        products = productStockLinks(
          await tx.inventoryItem.findMany({
            where: { menuItemId: { in: menuItemIds } },
            select: { id: true, menuItemId: true },
          }),
        );
      } catch {
        /* menuItemId column not migrated yet */
      }

      const links = [...recipes, ...products];
      const depleted: string[] = [];

      for (const { inventoryItemId, quantity } of planDeductions(lines, links)) {
        const inv = await tx.inventoryItem.findUnique({ where: { id: inventoryItemId } });
        if (!inv) continue;
        const newStock = inv.stockQty - quantity;
        // First time this item drops to/below its reorder level → flag for alert.
        const crossing = inv.reorderLevel > 0 && newStock <= inv.reorderLevel && !inv.lowStockAlertedAt;
        await tx.inventoryItem.update({
          where: { id: inventoryItemId },
          data: { stockQty: newStock, ...(crossing ? { lowStockAlertedAt: new Date() } : {}) },
        });
        if (crossing) newlyLow.push(inv.name);
        await tx.stockMovement.create({
          data: {
            restaurantId,
            inventoryItemId,
            changeQty: -quantity,
            reason: "sale",
            unitCost: inv.costPerUnit,
            refId: orderId,
          },
        });
        if (newStock <= 0) depleted.push(inventoryItemId);
      }

      // Auto out-of-stock: a sold-out product, or any dish whose ingredient ran
      // out. Both come from the same links, so one pass covers both.
      if (restaurant.autoOutOfStock && depleted.length > 0) {
        const ids = productsToDisable(depleted, links);
        if (ids.length > 0) {
          await tx.menuItem.updateMany({ where: { id: { in: ids } }, data: { isAvailable: false } });
        }
      }

      // Only the whole-order call owns the stamp. A second round leaves it
      // where it is: it records that the order has been accounted for, and the
      // extra lines were just accounted for too.
      if (!only) {
        await tx.order.update({ where: { id: orderId }, data: { inventoryDeductedAt: new Date() }, select: { id: true } });
      }
    });

    // Low-stock SMS alert (best-effort, after commit), once per crossing.
    if (newlyLow.length > 0 && alertPhone) {
      const list = newlyLow.slice(0, 6).join(", ");
      const more = newlyLow.length > 6 ? ` +${newlyLow.length - 6} more` : "";
      await notifyCustomer(restaurantId, alertPhone, `Low stock: ${list}${more}. Time to reorder.`);
    }
  } catch {
    // Inventory must never block the kitchen flow.
  }
}
