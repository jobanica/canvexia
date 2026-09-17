import "server-only";
import type { Prisma } from "@prisma/client";
import { pharmacyDb, systemDb } from "@/server/tenancy/scoped-db";
import type { ProductInputValues } from "@/lib/pharmacy/product-input";

/**
 * THE CATALOGUE, EDITABLE.
 *
 * Until this existed a product could be created in exactly one place — inline
 * during receiving — which set two of its sixteen columns: `name` and
 * `priceCentavos`. Nothing anywhere could update one afterwards. Three things
 * followed, and none of them was cosmetic:
 *
 *   1. `requiresPrescription` was written in ZERO places and read in six — the
 *      sale gate, the counter's warning, the dashboard badge, the role rules.
 *      So `dispenseRx`, which the brief calls law rather than policy, was
 *      enforced flawlessly against a flag that could never be true. Every item
 *      in every pharmacy was over-the-counter, permanently, and a cashier could
 *      complete a cart containing an antibiotic.
 *
 *   2. `reorderPoint` defaulted to 0, and the dashboard computes
 *      `onHand <= reorderPoint`. Low stock therefore only fired at zero, which
 *      is not a warning, it is a post-mortem.
 *
 *   3. A price could never be corrected after the first delivery.
 *
 * READS go through `pharmacyDb`. WRITES run in `systemDb`, matching settings.ts
 * and staff.ts, for one reason: the audit row. `audit_logs` sits on the
 * restaurant axis and has no pharmacy policy, so an insert under the pharmacy
 * scope is refused — and splitting a change to a statutory flag from its own
 * audit row across two transactions is how a change ends up with no trail.
 *
 * The pharmacy id is never a parameter a browser chose. Every caller passes the
 * session's own `pharmacyId` from `requireStaff`, and it is in the WHERE clause
 * of every write, so a product id belonging to another pharmacy updates zero
 * rows rather than being checked and then acted on.
 */

export interface CatalogueEditRow {
  id: string;
  name: string;
  genericName: string | null;
  form: string | null;
  strength: string | null;
  sku: string | null;
  barcode: string | null;
  unit: string;
  categoryId: string | null;
  requiresPrescription: boolean;
  reorderPoint: number;
  priceCentavos: number;
  isActive: boolean;
  /** Live stock, so nobody archives something with boxes on the shelf. */
  onHand: number;
}

export interface CategoryRow {
  id: string;
  name: string;
}

const FIELDS = {
  id: true,
  name: true,
  genericName: true,
  form: true,
  strength: true,
  sku: true,
  barcode: true,
  unit: true,
  categoryId: true,
  requiresPrescription: true,
  reorderPoint: true,
  priceCentavos: true,
  isActive: true,
} as const;

/**
 * Everything, ARCHIVED INCLUDED.
 *
 * `catalogue()` in queries.ts filters to `isActive: true` because that is what
 * a counter should offer. This screen is where archiving happens, so it has to
 * show what has been archived — otherwise the only way to undo it is SQL.
 */
export async function listCatalogue(pharmacyId: string): Promise<CatalogueEditRow[]> {
  const rows = await pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacyProduct.findMany({
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
      select: { ...FIELDS, batches: { where: { quantity: { gt: 0 } }, select: { quantity: true } } },
    }),
  );
  return rows.map(({ batches, ...p }) => ({
    ...p,
    // Not FEFO's `onHand`, which excludes expired stock: the question here is
    // "is there anything on the shelf with this name on it", and expired boxes
    // are very much still on the shelf until somebody writes them off.
    onHand: batches.reduce((n, b) => n + b.quantity, 0),
  }));
}

export async function listCategories(pharmacyId: string): Promise<CategoryRow[]> {
  return pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacyCategory.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  );
}

interface WriteContext {
  pharmacyId: string;
  actorStaffId: string;
}

/** A product that did not exist. */
export async function createProduct(
  ctx: WriteContext,
  values: ProductInputValues,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const categoryId = await ownedCategory(ctx.pharmacyId, values.categoryId);
  if (categoryId === false) return { ok: false, error: "That category no longer exists." };

  return systemDb(async (tx) => {
    const created = await tx.pharmacyProduct.create({
      data: { ...values, categoryId, pharmacyId: ctx.pharmacyId },
      select: FIELDS,
    });
    await audit(tx, ctx, "pharmacy.product.create", created.id, null, created);
    return { ok: true as const, id: created.id };
  });
}

/** An existing one. */
export async function updateProduct(
  ctx: WriteContext,
  productId: string,
  values: ProductInputValues,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const categoryId = await ownedCategory(ctx.pharmacyId, values.categoryId);
  if (categoryId === false) return { ok: false, error: "That category no longer exists." };

  return systemDb(async (tx) => {
    // Ownership in the WHERE clause, not a check before it.
    const before = await tx.pharmacyProduct.findFirst({
      where: { id: productId, pharmacyId: ctx.pharmacyId },
      select: FIELDS,
    });
    if (!before) return { ok: false as const, error: "That product is not in your catalogue." };

    const after = await tx.pharmacyProduct.update({
      where: { id: productId },
      data: { ...values, categoryId },
      select: FIELDS,
    });

    // The whole record either side, not a diff. Which field changed is easy to
    // work out later; what the Rx flag USED to be is the question an inspector
    // actually asks.
    await audit(tx, ctx, "pharmacy.product.update", productId, before, after);
    return { ok: true as const };
  });
}

/**
 * ARCHIVED, NEVER DELETED.
 *
 * Batches, stock movements and sale lines all point at this row. Deleting it
 * would orphan a receipt that has already been handed to a customer and a
 * ledger that has to explain itself. `isActive: false` takes it off the counter
 * and leaves the history intact.
 */
export async function setProductActive(
  ctx: WriteContext,
  productId: string,
  isActive: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return systemDb(async (tx) => {
    const before = await tx.pharmacyProduct.findFirst({
      where: { id: productId, pharmacyId: ctx.pharmacyId },
      select: FIELDS,
    });
    if (!before) return { ok: false as const, error: "That product is not in your catalogue." };
    if (before.isActive === isActive) return { ok: true as const };

    const after = await tx.pharmacyProduct.update({
      where: { id: productId },
      data: { isActive },
      select: FIELDS,
    });
    await audit(
      tx,
      ctx,
      isActive ? "pharmacy.product.restore" : "pharmacy.product.archive",
      productId,
      before,
      after,
    );
    return { ok: true as const };
  });
}

/**
 * A category id is only acceptable if it belongs to THIS pharmacy.
 *
 * `false` means "named something that is not yours". Null means none was
 * chosen, which is fine. Without this a form could file a product under another
 * pharmacy's category — harmless on its own, and exactly the kind of
 * cross-tenant reference that makes a later join leak.
 */
async function ownedCategory(
  pharmacyId: string,
  categoryId: string | null,
): Promise<string | null | false> {
  if (!categoryId) return null;
  const found = await pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacyCategory.findFirst({ where: { id: categoryId }, select: { id: true } }),
  );
  return found ? found.id : false;
}

async function audit(
  tx: Prisma.TransactionClient,
  ctx: WriteContext,
  action: string,
  entityId: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorType: "merchant",
      actorStaffId: ctx.actorStaffId,
      action,
      entityType: "pharmacy_product",
      entityId,
      before: before as Prisma.InputJsonValue,
      after: after as Prisma.InputJsonValue,
    },
  });
}
