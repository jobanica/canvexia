"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { tenantDb } from "@/server/tenancy/scoped-db";
import { requireManagerAction } from "@/server/tenancy/require-admin";
import { hasModule } from "@/server/billing/entitlements";
import { getReorderSuggestions } from "@/server/inventory/queries";
import { pesosToCentavos } from "@/lib/money";

export type FormState = { ok?: boolean; error?: string } | null;

async function ensureModule(restaurantId: string) {
  if (!(await hasModule(restaurantId, "inventory"))) {
    throw new Error("Your plan doesn't include Inventory. Upgrade to enable it.");
  }
}

const qty = z.coerce.number().min(0).max(1_000_000);

// ----------------------------------------------------------------- items
const itemSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  unit: z.string().trim().min(1, "Unit is required").max(16),
  stockQty: qty.default(0),
  costPesos: z.coerce.number().min(0).max(1_000_000).default(0),
  reorderLevel: qty.default(0),
  supplierId: z.string().uuid().optional().or(z.literal("")),
});

export async function createInventoryItem(_p: FormState, formData: FormData): Promise<FormState> {
  const { restaurantId } = await requireManagerAction();
  try {
    await ensureModule(restaurantId);
    const d = itemSchema.parse({
      name: formData.get("name"),
      unit: formData.get("unit"),
      stockQty: formData.get("stockQty") ?? 0,
      costPesos: formData.get("costPesos") ?? 0,
      reorderLevel: formData.get("reorderLevel") ?? 0,
      supplierId: formData.get("supplierId") ?? "",
    });
    await tenantDb(restaurantId, async (tx) => {
      const item = await tx.inventoryItem.create({
        data: {
          restaurantId,
          name: d.name,
          unit: d.unit,
          stockQty: d.stockQty,
          costPerUnit: pesosToCentavos(d.costPesos),
          reorderLevel: d.reorderLevel,
          supplierId: d.supplierId || null,
        },
      });
      if (d.stockQty > 0) {
        await tx.stockMovement.create({
          data: {
            restaurantId,
            inventoryItemId: item.id,
            changeQty: d.stockQty,
            reason: "adjustment",
            unitCost: pesosToCentavos(d.costPesos),
            note: "Opening stock",
          },
        });
      }
    });
  } catch (e) {
    if (e instanceof z.ZodError) return { error: e.issues[0]?.message ?? "Invalid input" };
    return { error: e instanceof Error ? e.message : "Couldn't add item" };
  }
  revalidatePath("/admin/inventory");
  return { ok: true };
}

export async function updateInventoryItem(formData: FormData): Promise<void> {
  const { restaurantId } = await requireManagerAction();
  await ensureModule(restaurantId);
  const id = String(formData.get("id"));
  await tenantDb(restaurantId, (tx) =>
    tx.inventoryItem.update({
      where: { id },
      data: {
        name: String(formData.get("name") ?? "").trim() || undefined,
        unit: String(formData.get("unit") ?? "").trim() || undefined,
        reorderLevel: Number(formData.get("reorderLevel") ?? 0),
        supplierId: (String(formData.get("supplierId") ?? "") || null) as string | null,
      },
    }),
  );
  revalidatePath("/admin/inventory");
}

export async function deleteInventoryItem(formData: FormData): Promise<void> {
  const { restaurantId } = await requireManagerAction();
  await ensureModule(restaurantId);
  await tenantDb(restaurantId, (tx) =>
    tx.inventoryItem.delete({ where: { id: String(formData.get("id")) } }),
  );
  revalidatePath("/admin/inventory");
}

// --------------------------------------------------------- product stock
/**
 * Start counting a product's own units.
 *
 * Creates the product's stock row and links it to the menu item. It's the same
 * kind of row an ingredient uses, so everything already built on top of stock —
 * movements, weighted-average cost, purchase orders, reorder suggestions,
 * low-stock alerts, COGS — works on products the moment this is switched on,
 * with nothing written twice.
 *
 * The starting cost comes from the item's food cost if one is set, so a shop
 * that already entered what a thing costs them doesn't type it again.
 */
export async function startTrackingProduct(formData: FormData): Promise<void> {
  const { restaurantId } = await requireManagerAction();
  await ensureModule(restaurantId);
  const menuItemId = String(formData.get("menuItemId"));
  const opening = Math.max(0, Number(formData.get("stockQty") ?? 0) || 0);
  const reorderLevel = Math.max(0, Number(formData.get("reorderLevel") ?? 0) || 0);
  const unit = String(formData.get("unit") ?? "").trim() || "pc";

  await tenantDb(restaurantId, async (tx) => {
    const item = await tx.menuItem.findFirstOrThrow({
      where: { id: menuItemId },
      select: { name: true },
    });
    if (await tx.inventoryItem.findFirst({ where: { menuItemId }, select: { id: true } })) return;

    let costPerUnit = 0;
    try {
      const c = await tx.menuItemCost.findUnique({ where: { menuItemId }, select: { cost: true } });
      costPerUnit = c?.cost ?? 0;
    } catch {
      /* menu_item_costs not migrated — start at zero */
    }

    const row = await tx.inventoryItem.create({
      data: {
        restaurantId,
        menuItemId,
        name: item.name,
        unit,
        stockQty: opening,
        reorderLevel,
        costPerUnit,
      },
    });
    if (opening > 0) {
      await tx.stockMovement.create({
        data: {
          restaurantId,
          inventoryItemId: row.id,
          changeQty: opening,
          reason: "adjustment",
          unitCost: costPerUnit,
          note: "Opening stock",
        },
      });
    }
  });
  revalidatePath("/admin/inventory");
}

/**
 * Stop counting a product's units.
 *
 * Deletes the stock row, which takes its movement history with it — so the
 * product is left available rather than stuck at whatever it was when the
 * counting stopped. A shop that turns tracking off and finds the item still
 * marked sold out would reasonably think the switch did nothing.
 */
export async function stopTrackingProduct(formData: FormData): Promise<void> {
  const { restaurantId } = await requireManagerAction();
  await ensureModule(restaurantId);
  const menuItemId = String(formData.get("menuItemId"));
  await tenantDb(restaurantId, async (tx) => {
    await tx.inventoryItem.deleteMany({ where: { menuItemId } });
    await tx.menuItem.updateMany({ where: { id: menuItemId }, data: { isAvailable: true } });
  });
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/menu");
}

/** Change a tracked product's reorder level without touching its stock. */
export async function setProductReorderLevel(formData: FormData): Promise<void> {
  const { restaurantId } = await requireManagerAction();
  await ensureModule(restaurantId);
  await tenantDb(restaurantId, (tx) =>
    tx.inventoryItem.updateMany({
      where: { id: String(formData.get("id")) },
      data: { reorderLevel: Math.max(0, Number(formData.get("reorderLevel") ?? 0) || 0) },
    }),
  );
  revalidatePath("/admin/inventory");
}

/**
 * Receive stock without a purchase order.
 *
 * A shop buying a box of something and putting it on the shelf shouldn't have
 * to raise paperwork first. Cost is optional; when given it re-averages the
 * same way receiving a PO does, so COGS stays honest as prices move.
 *
 * Restocking above the reorder level re-arms the low-stock alert, otherwise the
 * next time it runs down nobody gets told.
 */
export async function recordRestock(formData: FormData): Promise<void> {
  const { restaurantId } = await requireManagerAction();
  await ensureModule(restaurantId);
  const id = String(formData.get("id"));
  const qty = Number(formData.get("qty") ?? 0);
  if (!(qty > 0)) return;
  const rawCost = String(formData.get("unitCostPesos") ?? "").trim();

  await tenantDb(restaurantId, async (tx) => {
    const inv = await tx.inventoryItem.findFirstOrThrow({
      where: { id },
      select: { stockQty: true, costPerUnit: true, reorderLevel: true },
    });
    const newStock = inv.stockQty + qty;
    const unitCost = rawCost === "" ? inv.costPerUnit : pesosToCentavos(Number(rawCost) || 0);
    const newCost =
      rawCost === "" || newStock <= 0
        ? inv.costPerUnit
        : Math.round((inv.stockQty * inv.costPerUnit + qty * unitCost) / newStock);

    await tx.inventoryItem.update({
      where: { id },
      data: {
        stockQty: newStock,
        costPerUnit: newCost,
        ...(newStock > inv.reorderLevel ? { lowStockAlertedAt: null } : {}),
      },
    });
    await tx.stockMovement.create({
      data: {
        restaurantId,
        inventoryItemId: id,
        changeQty: qty,
        reason: "received",
        unitCost,
        note: "Restocked",
      },
    });
  });
  revalidatePath("/admin/inventory");
}

/**
 * Put a sold-out product back on sale.
 *
 * Auto out-of-stock hides an item the moment its count reaches zero, and the
 * only honest way back is to say how many arrived — otherwise the shop is
 * selling from a shelf the system believes is empty.
 */
export async function restockAndRelist(formData: FormData): Promise<void> {
  await recordRestock(formData);
  const { restaurantId } = await requireManagerAction();
  const menuItemId = String(formData.get("menuItemId") ?? "");
  if (!menuItemId) return;
  await tenantDb(restaurantId, (tx) =>
    tx.menuItem.updateMany({ where: { id: menuItemId }, data: { isAvailable: true } }),
  );
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/menu");
}

// ------------------------------------------------- stock movements (manual)
async function applyMovement(
  restaurantId: string,
  itemId: string,
  newStock: number,
  changeQty: number,
  reason: "waste" | "adjustment" | "count" | "usage",
  note?: string,
) {
  await tenantDb(restaurantId, async (tx) => {
    const inv = await tx.inventoryItem.findFirstOrThrow({ where: { id: itemId } });
    await tx.inventoryItem.update({
      where: { id: itemId },
      // Restocked above the reorder level → re-arm the low-stock alert.
      data: { stockQty: newStock, ...(newStock > inv.reorderLevel ? { lowStockAlertedAt: null } : {}) },
    });
    await tx.stockMovement.create({
      data: { restaurantId, inventoryItemId: itemId, changeQty, reason, unitCost: inv.costPerUnit, note },
    });
  });
}

export async function recordWaste(formData: FormData): Promise<void> {
  const { restaurantId } = await requireManagerAction();
  await ensureModule(restaurantId);
  const id = String(formData.get("id"));
  const amount = Number(formData.get("qty") ?? 0);
  if (amount <= 0) return;
  const inv = await tenantDb(restaurantId, (tx) => tx.inventoryItem.findFirstOrThrow({ where: { id } }));
  await applyMovement(restaurantId, id, inv.stockQty - amount, -amount, "waste", "Waste");
  revalidatePath("/admin/inventory");
}

/**
 * Take / request an ingredient: deduct stock and log a `usage` movement (who
 * took it / what for). This is how stock goes down outside of order sales — prep,
 * staff meals, transfers, etc. Falls back to an `adjustment` movement if the
 * `usage` enum value hasn't been migrated yet.
 */
export async function recordWithdrawal(formData: FormData): Promise<void> {
  const { restaurantId } = await requireManagerAction();
  await ensureModule(restaurantId);
  const id = String(formData.get("id"));
  const amount = Number(formData.get("qty") ?? 0);
  if (!(amount > 0)) return;
  const reason = String(formData.get("note") ?? "").trim();
  const note = reason ? `Taken — ${reason.slice(0, 120)}` : "Ingredient taken";
  const inv = await tenantDb(restaurantId, (tx) =>
    tx.inventoryItem.findFirstOrThrow({ where: { id }, select: { stockQty: true } }),
  );
  const newStock = inv.stockQty - amount;
  try {
    await applyMovement(restaurantId, id, newStock, -amount, "usage", note);
  } catch {
    // `usage` enum value not migrated yet → record it as an adjustment instead.
    await applyMovement(restaurantId, id, newStock, -amount, "adjustment", note);
  }
  revalidatePath("/admin/inventory");
}

export async function recordCount(formData: FormData): Promise<void> {
  const { restaurantId } = await requireManagerAction();
  await ensureModule(restaurantId);
  const id = String(formData.get("id"));
  const counted = Number(formData.get("counted") ?? 0);
  const inv = await tenantDb(restaurantId, (tx) => tx.inventoryItem.findFirstOrThrow({ where: { id } }));
  await applyMovement(restaurantId, id, counted, counted - inv.stockQty, "count", "Stock count");
  revalidatePath("/admin/inventory");
}

// -------------------------------------------------------------- suppliers
export async function createSupplier(_p: FormState, formData: FormData): Promise<FormState> {
  const { restaurantId } = await requireManagerAction();
  try {
    await ensureModule(restaurantId);
    const name = z.string().trim().min(1).max(80).parse(formData.get("name"));
    const contact = String(formData.get("contact") ?? "").trim();
    await tenantDb(restaurantId, (tx) =>
      tx.supplier.create({
        data: { restaurantId, name, contactJson: contact ? { contact } : undefined },
      }),
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Couldn't add supplier" };
  }
  revalidatePath("/admin/inventory");
  return { ok: true };
}

export async function deleteSupplier(formData: FormData): Promise<void> {
  const { restaurantId } = await requireManagerAction();
  await ensureModule(restaurantId);
  await tenantDb(restaurantId, (tx) =>
    tx.supplier.delete({ where: { id: String(formData.get("id")) } }),
  );
  revalidatePath("/admin/inventory");
}

// --------------------------------------------------------- purchase orders
export async function createPurchaseOrder(formData: FormData): Promise<void> {
  const { restaurantId } = await requireManagerAction();
  await ensureModule(restaurantId);
  const supplierId = String(formData.get("supplierId") ?? "") || null;
  await tenantDb(restaurantId, (tx) =>
    tx.purchaseOrder.create({ data: { restaurantId, supplierId, status: "draft" } }),
  );
  revalidatePath("/admin/inventory/po");
}

export async function addPurchaseOrderItem(formData: FormData): Promise<void> {
  const { restaurantId } = await requireManagerAction();
  await ensureModule(restaurantId);
  const purchaseOrderId = String(formData.get("purchaseOrderId"));
  const inventoryItemId = String(formData.get("inventoryItemId"));
  const quantity = Number(formData.get("quantity") ?? 0);
  const unitCost = pesosToCentavos(Number(formData.get("unitCostPesos") ?? 0));
  if (quantity <= 0) return;
  await tenantDb(restaurantId, async (tx) => {
    const po = await tx.purchaseOrder.findFirstOrThrow({ where: { id: purchaseOrderId } });
    if (po.status === "received") throw new Error("PO already received");
    await tx.purchaseOrderItem.create({
      data: { restaurantId, purchaseOrderId, inventoryItemId, quantity, unitCost },
    });
  });
  revalidatePath(`/admin/inventory/po/${purchaseOrderId}`);
}

/** Receives a PO: adds stock and updates each item's WEIGHTED-AVERAGE cost. */
export async function receivePurchaseOrder(formData: FormData): Promise<void> {
  const { restaurantId } = await requireManagerAction();
  await ensureModule(restaurantId);
  const purchaseOrderId = String(formData.get("purchaseOrderId"));
  await tenantDb(restaurantId, async (tx) => {
    const po = await tx.purchaseOrder.findFirstOrThrow({
      where: { id: purchaseOrderId },
      include: { items: true },
    });
    if (po.status === "received") return;
    for (const line of po.items) {
      const inv = await tx.inventoryItem.findUniqueOrThrow({ where: { id: line.inventoryItemId } });
      const newStock = inv.stockQty + line.quantity;
      const newCost =
        newStock > 0
          ? Math.round((inv.stockQty * inv.costPerUnit + line.quantity * line.unitCost) / newStock)
          : inv.costPerUnit;
      await tx.inventoryItem.update({
        where: { id: inv.id },
        data: { stockQty: newStock, costPerUnit: newCost, ...(newStock > inv.reorderLevel ? { lowStockAlertedAt: null } : {}) },
      });
      await tx.stockMovement.create({
        data: {
          restaurantId,
          inventoryItemId: inv.id,
          changeQty: line.quantity,
          reason: "received",
          unitCost: line.unitCost,
          refId: purchaseOrderId,
        },
      });
    }
    await tx.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: { status: "received", receivedAt: new Date() },
    });
  });
  revalidatePath(`/admin/inventory/po/${purchaseOrderId}`);
  revalidatePath("/admin/inventory");
}

// -------------------------------------------------------------- recipes
export async function setRecipeComponent(formData: FormData): Promise<void> {
  const { restaurantId } = await requireManagerAction();
  await ensureModule(restaurantId);
  const menuItemId = String(formData.get("menuItemId"));
  const inventoryItemId = String(formData.get("inventoryItemId"));
  const quantity = Number(formData.get("quantity") ?? 0);
  await tenantDb(restaurantId, async (tx) => {
    const where = { menuItemId_inventoryItemId: { menuItemId, inventoryItemId } };
    if (quantity <= 0) {
      await tx.recipeComponent.deleteMany({ where: { menuItemId, inventoryItemId } });
      return;
    }
    await tx.recipeComponent.upsert({
      where,
      create: { restaurantId, menuItemId, inventoryItemId, quantity },
      update: { quantity },
    });
  });
  revalidatePath(`/admin/menu/${menuItemId}`);
  revalidatePath("/admin/inventory/recipes");
}

// -------------------------------------------------------------- settings
export async function setAutoOutOfStock(formData: FormData): Promise<void> {
  const { restaurantId } = await requireManagerAction();
  await ensureModule(restaurantId);
  await tenantDb(restaurantId, (tx) =>
    tx.restaurant.update({
      where: { id: restaurantId },
      data: { autoOutOfStock: formData.get("autoOutOfStock") === "on" },
      select: { id: true },
    }),
  );
  revalidatePath("/admin/inventory");
}

/** Phone that receives a low-stock SMS when an ingredient hits its reorder level. */
export async function setLowStockAlertPhone(formData: FormData): Promise<void> {
  const { restaurantId } = await requireManagerAction();
  await ensureModule(restaurantId);
  const phone = String(formData.get("lowStockAlertPhone") ?? "").trim();
  await tenantDb(restaurantId, (tx) =>
    tx.restaurant.update({ where: { id: restaurantId }, data: { lowStockAlertPhone: phone || null }, select: { id: true } }),
  );
  revalidatePath("/admin/inventory");
}

/**
 * Auto-PO: create a draft purchase order from the reorder suggestions for one
 * supplier (or unassigned items). Quantities come from usage velocity, computed
 * server-side. Returns the new PO id so the caller can open it.
 */
export async function createDraftPoFromSuggestions(supplierId: string | null): Promise<string | null> {
  const { restaurantId } = await requireManagerAction();
  await ensureModule(restaurantId);
  const suggestions = await getReorderSuggestions(restaurantId);
  const forSupplier = suggestions.filter((s) => (s.supplierId ?? null) === (supplierId || null) && s.suggestedQty > 0);
  if (forSupplier.length === 0) return null;

  const poId = await tenantDb(restaurantId, async (tx) => {
    const po = await tx.purchaseOrder.create({
      data: { restaurantId, supplierId: supplierId || null, status: "draft" },
      select: { id: true },
    });
    for (const s of forSupplier) {
      await tx.purchaseOrderItem.create({
        data: {
          restaurantId,
          purchaseOrderId: po.id,
          inventoryItemId: s.id,
          quantity: s.suggestedQty,
          unitCost: s.costPerUnit,
        },
      });
    }
    return po.id;
  });
  revalidatePath("/admin/inventory/po");
  return poId;
}

/** Form-action wrapper: build the draft PO then open it. */
export async function createPoFromSuggestions(formData: FormData): Promise<void> {
  const supplierId = String(formData.get("supplierId") ?? "") || null;
  const poId = await createDraftPoFromSuggestions(supplierId);
  if (poId) redirect(`/admin/inventory/po/${poId}`);
  revalidatePath("/admin/inventory/reorder");
}
