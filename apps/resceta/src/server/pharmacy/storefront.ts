import "server-only";
import type { Prisma } from "@prisma/client";
import { pharmacyDb, systemDb } from "@/server/tenancy/scoped-db";
import { onHand, type AllocatableBatch } from "@/lib/pharmacy/fefo";

/**
 * THE PUBLIC SHOP PAGE, AND THE ORDERS IT PRODUCES.
 *
 * SYSTEM-SCOPED READS AND WRITES, and that needs saying. Everything else in
 * this app runs through `pharmacyDb`, which resolves the tenant from a session.
 * A customer on the shop page has no session — there is nothing to scope to —
 * so these run as the system and the pharmacy id comes from the SLUG in the
 * URL, resolved here, once.
 *
 * That makes this file the one place where a mistake is a cross-tenant leak, so
 * every query below names `pharmacyId` explicitly and none of them accepts one
 * from a form.
 *
 * PRESCRIPTION-ONLY ITEMS ARE NEVER LISTED. Dispensing one without a
 * prescription is an offence, and a public page that takes an order for one is
 * an invitation to commit it. The filter is here, in the query, not in the
 * template — a template filter is one refactor away from being dropped.
 */

export interface ShopPharmacy {
  id: string;
  name: string;
  displayName: string | null;
  slug: string;
  address: string | null;
  phone: string | null;
  blurb: string | null;
  acceptsDelivery: boolean;
  status: string;
}

export async function shopBySlug(slug: string): Promise<ShopPharmacy | null> {
  const row = await systemDb((tx) =>
    tx.pharmacy.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        displayName: true,
        slug: true,
        address: true,
        phone: true,
        storefrontOn: true,
        storefrontBlurb: true,
        storefrontAcceptsDelivery: true,
        status: true,
      },
    }),
  ).catch(() => null);

  // Off, or not live, is the same as not existing as far as the public is
  // concerned — a suspended pharmacy must not take orders it cannot fill.
  if (!row || !row.storefrontOn || row.status !== "active") return null;

  return {
    id: row.id,
    name: row.name,
    displayName: row.displayName,
    slug: row.slug,
    address: row.address,
    phone: row.phone,
    blurb: row.storefrontBlurb,
    acceptsDelivery: row.storefrontAcceptsDelivery,
    status: row.status,
  };
}

export interface ShopItem {
  id: string;
  name: string;
  genericName: string | null;
  form: string | null;
  strength: string | null;
  unit: string;
  priceCentavos: number;
  /** Shown as in stock or not — never as a number. See below. */
  inStock: boolean;
}

export async function shopItems(pharmacyId: string): Promise<ShopItem[]> {
  const rows = await systemDb((tx) =>
    tx.pharmacyProduct.findMany({
      where: {
        pharmacyId,
        isActive: true,
        // The statutory filter, in the query. A template filter is one
        // refactor away from being dropped.
        requiresPrescription: false,
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        genericName: true,
        form: true,
        strength: true,
        unit: true,
        priceCentavos: true,
        batches: {
          where: { quantity: { gt: 0 } },
          select: {
            id: true,
            expiryDate: true,
            receivedAt: true,
            quantity: true,
            costCentavos: true,
            lotNumber: true,
          },
        },
      },
    }),
  );

  const now = new Date();
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    genericName: p.genericName,
    form: p.form,
    strength: p.strength,
    unit: p.unit,
    priceCentavos: p.priceCentavos,
    // A BOOLEAN, NOT A COUNT. Publishing "3 left" invites somebody to order
    // three and be told there is one, because the counter is selling the same
    // shelf in real time. In stock / not in stock is a claim the pharmacy can
    // keep.
    inStock: onHand(p.batches as AllocatableBatch[], now) > 0,
  }));
}

export interface PlaceOrderLine {
  productId: string;
  quantity: number;
}

export async function placeOrder(input: {
  pharmacyId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string | null;
  fulfilment: "pickup" | "delivery";
  notes: string | null;
  lines: PlaceOrderLine[];
}): Promise<{ ok: true; orderNumber: string } | { ok: false; error: string }> {
  const lines = input.lines.filter((l) => l.quantity > 0);
  if (lines.length === 0) return { ok: false, error: "Add at least one item." };
  if (!input.customerName.trim() || !input.customerPhone.trim()) {
    return { ok: false, error: "We need a name and a mobile number to call you back on." };
  }

  try {
    return await systemDb(async (tx) => {
      const products = await tx.pharmacyProduct.findMany({
        where: {
          id: { in: [...new Set(lines.map((l) => l.productId))] },
          // Scoped to THIS pharmacy and to what may be sold without a
          // prescription — the same two conditions the listing uses, checked
          // again here because a form can name any id.
          pharmacyId: input.pharmacyId,
          isActive: true,
          requiresPrescription: false,
        },
        select: { id: true, name: true, priceCentavos: true },
      });
      const byId = new Map(products.map((p) => [p.id, p]));
      if (lines.some((l) => !byId.has(l.productId))) {
        return { ok: false as const, error: "One of those items is no longer available." };
      }

      const main = await tx.pharmacyBranch.findFirst({
        where: { pharmacyId: input.pharmacyId, isMain: true },
        select: { id: true },
      });

      const bumped = await tx.pharmacy.update({
        where: { id: input.pharmacyId },
        data: { nextOrderNo: { increment: 1 } },
        select: { nextOrderNo: true },
      });
      const orderNumber = `W-${String(bumped.nextOrderNo - 1).padStart(5, "0")}`;

      let total = 0;
      const items = lines.map((l) => {
        const p = byId.get(l.productId)!;
        const lineTotal = p.priceCentavos * l.quantity;
        total += lineTotal;
        return {
          pharmacyId: input.pharmacyId,
          productId: p.id,
          // Snapshotted, like a sale line.
          nameAtTime: p.name,
          quantity: l.quantity,
          unitPriceCentavos: p.priceCentavos,
          lineTotalCentavos: lineTotal,
        };
      });

      await tx.pharmacyOrder.create({
        data: {
          pharmacyId: input.pharmacyId,
          branchId: main?.id ?? null,
          orderNumber,
          status: "placed",
          fulfilment: input.fulfilment,
          customerName: input.customerName.trim(),
          customerPhone: input.customerPhone.trim(),
          customerAddress: input.customerAddress?.trim() || null,
          notes: input.notes?.trim() || null,
          totalCentavos: total,
          items: { create: items },
        },
        select: { id: true },
      });

      return { ok: true as const, orderNumber };
    });
  } catch {
    return { ok: false, error: "Couldn't send that order. Try again." };
  }
}

// ---------------------------------------------------------------------------
// The pharmacy's side: the orders inbox. Back on pharmacyDb, because from here
// there is a session to scope to.
// ---------------------------------------------------------------------------

export async function listOrders(pharmacyId: string, take = 100) {
  return pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacyOrder.findMany({
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        fulfilment: true,
        customerName: true,
        customerPhone: true,
        customerAddress: true,
        notes: true,
        totalCentavos: true,
        createdAt: true,
        items: {
          select: { id: true, nameAtTime: true, quantity: true, lineTotalCentavos: true },
        },
      },
    }),
  );
}

const NEXT: Record<string, string[]> = {
  placed: ["confirmed", "cancelled"],
  confirmed: ["ready", "cancelled"],
  ready: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

/**
 * Move an order along.
 *
 * ONE STEP AT A TIME, and never backwards. An order that has been collected
 * cannot become "placed" again; a cancelled one stays cancelled. Without this
 * the status is whatever the last button pressed said, which is not a record of
 * anything.
 *
 * NOTHING HERE TOUCHES STOCK. Completing an order means the customer collected
 * it and it was rung up at the counter like any other sale — that is where the
 * FEFO allocation, the cost snapshot and the ledger entry happen, and there is
 * exactly one place they happen.
 */
export async function advanceOrder(input: {
  pharmacyId: string;
  orderId: string;
  to: string;
  actorStaffId: string;
}): Promise<{ ok: true; status: string } | { ok: false; error: string }> {
  try {
    return await systemDb(async (tx) => {
      const order = await tx.pharmacyOrder.findFirst({
        where: { id: input.orderId, pharmacyId: input.pharmacyId },
        select: { id: true, status: true, orderNumber: true },
      });
      if (!order) return { ok: false as const, error: "That order was not found." };

      const allowed = NEXT[order.status] ?? [];
      if (!allowed.includes(input.to)) {
        return {
          ok: false as const,
          error: `An order that is ${order.status} cannot become ${input.to}.`,
        };
      }

      await tx.pharmacyOrder.update({
        where: { id: order.id },
        data: { status: input.to as never, handledByStaffId: input.actorStaffId },
      });

      await tx.auditLog.create({
        data: {
          actorType: "merchant",
          actorStaffId: input.actorStaffId,
          action: "pharmacy.order_status",
          entityType: "pharmacy_order",
          entityId: order.id,
          after: { orderNumber: order.orderNumber, status: input.to } as Prisma.InputJsonValue,
        },
      });

      return { ok: true as const, status: input.to };
    });
  } catch {
    return { ok: false, error: "Couldn't update that order. Try again." };
  }
}
