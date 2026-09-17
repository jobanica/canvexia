import "server-only";
import type { Prisma } from "@prisma/client";
import { pharmacyDb, systemDb } from "@/server/tenancy/scoped-db";
import type { SupplierInputValues } from "@/lib/pharmacy/supplier-input";

/**
 * THE SUPPLIER BOOK.
 *
 * `pharmacy_suppliers` has carried `contactPerson`, `phone`, `email`, `address`
 * and `notes` since the table was written. Every one of them was written in
 * ZERO places and read in zero: a supplier could only be created inline during
 * receiving, which sets `name` and nothing else, and nothing anywhere could
 * edit one afterwards.
 *
 * So the pharmacy that needed to re-order from the distributor that delivered
 * the batch expiring next week had a name on a screen and no phone number,
 * while the column for it sat empty in the database. The same defect that
 * `requiresPrescription` had: the schema says yes and the screen offers
 * nothing.
 *
 * READS through `pharmacyDb`; WRITES through `systemDb`, matching catalogue.ts,
 * staff.ts and settings.ts — see the note there about `audit_logs` having no
 * pharmacy policy.
 */

export interface SupplierRow {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  /** Deliveries on record, and when the last one arrived. */
  deliveries: number;
  lastDeliveryAt: Date | null;
  /** What is still on the shelf from this supplier, at cost. */
  onHandValueCentavos: number;
}

const FIELDS = {
  id: true,
  name: true,
  contactPerson: true,
  phone: true,
  email: true,
  address: true,
  notes: true,
} as const;

/**
 * The book, with what each supplier has actually delivered.
 *
 * The counts come from the batches rather than a stored total: a supplier row
 * that says "12 deliveries" and a batch list that shows 11 is two numbers that
 * disagree, and the batches are the ones that are true.
 */
export async function listSuppliers(pharmacyId: string): Promise<SupplierRow[]> {
  const rows = await pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacySupplier.findMany({
      orderBy: { name: "asc" },
      select: {
        ...FIELDS,
        batches: { select: { receivedAt: true, quantity: true, costCentavos: true } },
      },
    }),
  );

  return rows.map((s) => {
    const dates = s.batches.map((b) => b.receivedAt.getTime());
    return {
      id: s.id,
      name: s.name,
      contactPerson: s.contactPerson,
      phone: s.phone,
      email: s.email,
      address: s.address,
      notes: s.notes,
      deliveries: s.batches.length,
      lastDeliveryAt: dates.length > 0 ? new Date(Math.max(...dates)) : null,
      onHandValueCentavos: s.batches.reduce((t, b) => t + b.quantity * b.costCentavos, 0),
    };
  });
}

export async function createSupplier(
  pharmacyId: string,
  values: SupplierInputValues,
  actorStaffId: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const id = await systemDb(async (tx) => {
      const created = await tx.pharmacySupplier.create({
        data: { pharmacyId, ...values },
        select: { id: true },
      });
      await audit(tx, actorStaffId, "pharmacy.supplier_created", created.id, values);
      return created.id;
    });
    return { ok: true, id };
  } catch {
    return { ok: false, error: "Couldn't save that supplier. Try again." };
  }
}

export async function updateSupplier(
  pharmacyId: string,
  supplierId: string,
  values: SupplierInputValues,
  actorStaffId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const changed = await systemDb(async (tx) => {
      // The pharmacy is in the WHERE clause, so a supplier id belonging to
      // another pharmacy updates zero rows rather than being checked and then
      // acted on.
      const res = await tx.pharmacySupplier.updateMany({
        where: { id: supplierId, pharmacyId },
        data: values,
      });
      if (res.count > 0) {
        await audit(tx, actorStaffId, "pharmacy.supplier_updated", supplierId, values);
      }
      return res.count;
    });
    if (changed === 0) return { ok: false, error: "That supplier was not found." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't save that supplier. Try again." };
  }
}

/**
 * Remove a supplier, but never one with deliveries against it.
 *
 * A batch records which supplier it came from, and that is the trail a recall
 * follows. Deleting the row would set those to null — the stock stays on the
 * shelf with nothing saying where it came from, which is precisely the
 * question a recall asks. So a supplier who has ever delivered stays, and the
 * pharmacy edits the row instead.
 */
export async function deleteSupplier(
  pharmacyId: string,
  supplierId: string,
  actorStaffId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const result = await systemDb(async (tx) => {
      const batches = await tx.pharmacyBatch.count({ where: { pharmacyId, supplierId } });
      if (batches > 0) return { blocked: batches };
      const res = await tx.pharmacySupplier.deleteMany({ where: { id: supplierId, pharmacyId } });
      if (res.count > 0) {
        await audit(tx, actorStaffId, "pharmacy.supplier_deleted", supplierId, { name: null });
      }
      return { count: res.count };
    });
    if ("blocked" in result) {
      return {
        ok: false,
        error: `This supplier has ${result.blocked} deliveries on record and cannot be removed — a batch has to keep saying where it came from. Edit it instead.`,
      };
    }
    if (result.count === 0) return { ok: false, error: "That supplier was not found." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Couldn't remove that supplier. Try again." };
  }
}

/**
 * The audit row. Same shape as catalogue.ts, and for the same reason.
 *
 * NO `restaurantId`. The column has a foreign key to `restaurants`, so putting
 * a pharmacy id there fails the constraint — the pharmacy is identified by
 * `entityType` plus the entity itself.
 */
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
      entityType: "pharmacy_supplier",
      entityId,
      after: after as Prisma.InputJsonValue,
    },
  });
}
