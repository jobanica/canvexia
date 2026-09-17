import "server-only";
import type { Prisma } from "@prisma/client";
import { pharmacyDb, systemDb } from "@/server/tenancy/scoped-db";
import type { CustomerInputValues } from "@/lib/pharmacy/customer-input";

/**
 * CUSTOMERS, AND THE POINTS LEDGER.
 *
 * Optional everywhere and always will be: most counter sales are anonymous,
 * and a system that demands a name before it will take money is one the cashier
 * works around within a week.
 *
 * THE BALANCE IS A CACHE. `pointsBalance` on the customer row is what the
 * counter reads so it does not sum a thousand ledger rows while somebody waits;
 * the ledger is what is true. Every write to one happens inside the same
 * transaction as the write to the other, so they cannot drift — and
 * `recountPoints` exists to prove it.
 */

export interface CustomerRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  pointsBalance: number;
  /** Lifetime spend, for the person deciding whether to chase a debt. */
  purchases: number;
  spentCentavos: number;
  lastPurchaseAt: Date | null;
  createdAt: Date;
}

export async function listCustomers(pharmacyId: string, query?: string): Promise<CustomerRow[]> {
  const q = query?.trim();
  const rows = await pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacyCustomer.findMany({
      where: q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          }
        : undefined,
      orderBy: { name: "asc" },
      take: 200,
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        address: true,
        notes: true,
        pointsBalance: true,
        createdAt: true,
        // A voided sale is not a purchase. Filtering here rather than after
        // means the count and the total agree with the receipts screen.
        sales: {
          where: { status: "completed" },
          select: { totalCentavos: true, createdAt: true },
        },
      },
    }),
  );

  return rows.map((c) => {
    const dates = c.sales.map((s) => s.createdAt.getTime());
    return {
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      address: c.address,
      notes: c.notes,
      pointsBalance: c.pointsBalance,
      purchases: c.sales.length,
      spentCentavos: c.sales.reduce((t, s) => t + s.totalCentavos, 0),
      lastPurchaseAt: dates.length > 0 ? new Date(Math.max(...dates)) : null,
      createdAt: c.createdAt,
    };
  });
}

export async function getCustomer(pharmacyId: string, customerId: string) {
  return pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacyCustomer.findFirst({
      where: { id: customerId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        address: true,
        notes: true,
        pointsBalance: true,
        createdAt: true,
        sales: {
          orderBy: { createdAt: "desc" },
          take: 50,
          select: {
            id: true,
            receiptNumber: true,
            totalCentavos: true,
            status: true,
            discountType: true,
            pointsEarned: true,
            createdAt: true,
          },
        },
        loyaltyTxns: {
          orderBy: { createdAt: "desc" },
          take: 50,
          select: { id: true, kind: true, points: true, note: true, createdAt: true },
        },
        prescriptions: {
          orderBy: { dateIssued: "desc" },
          take: 20,
          select: {
            id: true,
            rxNumber: true,
            doctorName: true,
            doctorPrcNo: true,
            dateIssued: true,
          },
        },
      },
    }),
  );
}

export async function createCustomer(
  pharmacyId: string,
  values: CustomerInputValues,
  actorStaffId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const id = await systemDb(async (tx) => {
      const created = await tx.pharmacyCustomer.create({
        data: { pharmacyId, ...values },
        select: { id: true },
      });
      await audit(tx, actorStaffId, "pharmacy.customer_created", created.id, values);
      return created.id;
    });
    return { ok: true, id };
  } catch {
    return { ok: false, error: "Couldn't save that customer. Try again." };
  }
}

export async function updateCustomer(
  pharmacyId: string,
  customerId: string,
  values: CustomerInputValues,
  actorStaffId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const count = await systemDb(async (tx) => {
      // The pharmacy is in the WHERE clause, so an id belonging to another
      // pharmacy updates zero rows rather than being checked and then acted on.
      const res = await tx.pharmacyCustomer.updateMany({
        where: { id: customerId, pharmacyId },
        data: values,
      });
      if (res.count > 0) {
        await audit(tx, actorStaffId, "pharmacy.customer_updated", customerId, values);
      }
      return res.count;
    });
    if (count === 0) return { ok: false, error: "That customer was not found." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't save that customer. Try again." };
  }
}

/**
 * A manual points correction.
 *
 * LEDGER AND BALANCE IN ONE TRANSACTION. Writing the row and then updating the
 * balance in a second statement is how a crash between the two leaves a
 * customer whose points do not add up — and the ledger is the thing somebody
 * will be shown when they dispute it.
 *
 * The balance is not allowed below zero. A correction that would overdraw is
 * refused rather than clamped, because a clamp silently writes a ledger row
 * that does not reconcile with the balance it produced.
 */
export async function adjustPoints(input: {
  pharmacyId: string;
  customerId: string;
  points: number;
  note: string;
  actorStaffId: string;
}): Promise<{ ok: true; balance: number } | { ok: false; error: string }> {
  try {
    return await systemDb(async (tx) => {
      const customer = await tx.pharmacyCustomer.findFirst({
        where: { id: input.customerId, pharmacyId: input.pharmacyId },
        select: { id: true, pointsBalance: true },
      });
      if (!customer) return { ok: false as const, error: "That customer was not found." };

      const balance = customer.pointsBalance + input.points;
      if (balance < 0) {
        return {
          ok: false as const,
          error: `That would leave ${customer.pointsBalance + input.points} points. They have ${customer.pointsBalance}.`,
        };
      }

      await tx.pharmacyLoyaltyTxn.create({
        data: {
          pharmacyId: input.pharmacyId,
          customerId: input.customerId,
          kind: "adjust",
          points: input.points,
          note: input.note,
          actorStaffId: input.actorStaffId,
        },
      });
      await tx.pharmacyCustomer.update({
        where: { id: input.customerId },
        data: { pointsBalance: balance },
      });
      await audit(tx, input.actorStaffId, "pharmacy.points_adjusted", input.customerId, {
        points: input.points,
        note: input.note,
        balance,
      });
      return { ok: true as const, balance };
    });
  } catch {
    return { ok: false, error: "Couldn't adjust those points. Try again." };
  }
}

/**
 * Recompute a balance from the ledger.
 *
 * The cache exists to be fast, not to be authoritative. This is what proves the
 * two agree — and what repairs one if they ever do not.
 */
export async function recountPoints(
  pharmacyId: string,
  customerId: string,
): Promise<{ ledger: number; cached: number }> {
  return pharmacyDb(pharmacyId, async (tx) => {
    const [sum, customer] = await Promise.all([
      tx.pharmacyLoyaltyTxn.aggregate({ where: { customerId }, _sum: { points: true } }),
      tx.pharmacyCustomer.findFirst({ where: { id: customerId }, select: { pointsBalance: true } }),
    ]);
    return { ledger: sum._sum.points ?? 0, cached: customer?.pointsBalance ?? 0 };
  });
}

async function audit(
  tx: Prisma.TransactionClient,
  actorStaffId: string,
  action: string,
  entityId: string,
  after: unknown,
): Promise<void> {
  // No `restaurantId`: that column has a foreign key to `restaurants`, so a
  // pharmacy id there fails the constraint.
  await tx.auditLog.create({
    data: {
      actorType: "merchant",
      actorStaffId,
      action,
      entityType: "pharmacy_customer",
      entityId,
      after: after as Prisma.InputJsonValue,
    },
  });
}
