"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/server/tenancy/current-user";
import { systemDb } from "@/server/tenancy/scoped-db";

/**
 * CORRECT A BATCH'S EXPIRY OR LOT NUMBER.
 *
 * REPORTED — "when i check the details of the item, there is no expiration
 * date." A product has no expiry and never will: a product does not expire, a
 * DELIVERY does. But a batch whose date was mistyped on receipt, or left blank
 * by a CSV import with no expiry column, is a real problem with nowhere to fix
 * it — the receiving screen only writes new batches, and the only other route
 * was SQL.
 *
 * IT CHANGES DATES AND COST, AND NOTHING ELSE. Quantity is moved by receiving, selling,
 * transferring, counting and writing off, every one of which leaves a movement
 * row explaining itself. A quantity edited here would be stock appearing or
 * vanishing with no ledger behind it, which is the one thing this system is
 * built not to allow.
 *
 * AUDITED, because the date decides whether the stock may be dispensed at all.
 * Moving an expiry forward makes unsellable stock sellable, and that is exactly
 * the change somebody must be able to look up afterwards.
 */

export type BatchState =
  | { status: "idle" }
  | { status: "error"; message: string }
  | { status: "done"; message: string };

const Input = z.object({
  batchId: z.string().uuid(),
  // "" clears the date, which is a real answer: a product with no printed
  // expiry should say so rather than carry a guess.
  expiryDate: z
    .string()
    .trim()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Use the date picker.")
    .optional()
    .default(""),
  lotNumber: z.string().trim().max(60).optional().default(""),
  /*
    What this delivery cost per unit, as typed. Raw text rather than a number
    input for the same reason the till's tender box is: formatting money while
    somebody types it fights the person typing.

    "" means "leave it alone" and NOT "free". Zeroing a cost would put a 100%
    margin on every report the stock touches, which nobody would ask for by
    clearing a box.
  */
  unitCost: z.string().trim().max(20).optional().default(""),
});

/** Typed pesos → centavos, or null for "not given". */
function costCentavos(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.]/g, "");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export async function correctBatch(
  _prev: BatchState,
  formData: FormData,
): Promise<BatchState> {
  let staff;
  try {
    staff = await requireStaff("manageStock");
  } catch (e) {
    return {
      status: "error",
      message:
        e instanceof Error && e.message === "FORBIDDEN"
          ? "Only a pharmacist, manager or the owner can change a batch."
          : "Your session has expired. Sign in again.",
    };
  }

  const parsed = Input.safeParse({
    batchId: formData.get("batchId"),
    expiryDate: formData.get("expiryDate") ?? "",
    lotNumber: formData.get("lotNumber") ?? "",
    unitCost: formData.get("unitCost") ?? "",
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "That didn't look right.",
    };
  }
  const { batchId, expiryDate, lotNumber, unitCost } = parsed.data;
  const cost = costCentavos(unitCost);

  try {
    return await systemDb(async (tx) => {
      const before = await tx.pharmacyBatch.findFirst({
        // The pharmacy is in the WHERE clause, so a batch id from somewhere
        // else is simply not found rather than checked and then acted on.
        where: { id: batchId, pharmacyId: staff.pharmacyId },
        select: {
          id: true,
          lotNumber: true,
          expiryDate: true,
          costCentavos: true,
          quantity: true,
          product: { select: { name: true } },
        },
      });
      if (!before) return { status: "error" as const, message: "That batch was not found." };

      const after = await tx.pharmacyBatch.update({
        where: { id: batchId },
        data: {
          // Dates and cost. Quantity is not in this object and must never be.
          expiryDate: expiryDate ? new Date(`${expiryDate}T00:00:00Z`) : null,
          lotNumber: lotNumber || null,
          // Absent means untouched. Clearing the box is not a request to make
          // the stock free.
          ...(cost === null ? {} : { costCentavos: cost }),
        },
        select: { id: true, lotNumber: true, expiryDate: true, costCentavos: true },
      });

      await tx.auditLog.create({
        data: {
          actorType: "merchant",
          actorStaffId: staff.staffId,
          action: "pharmacy.batch_corrected",
          entityType: "pharmacy_batch",
          entityId: batchId,
          before: {
            lotNumber: before.lotNumber,
            expiryDate: before.expiryDate?.toISOString() ?? null,
            costCentavos: before.costCentavos,
          },
          after: {
            lotNumber: after.lotNumber,
            expiryDate: after.expiryDate?.toISOString() ?? null,
            costCentavos: after.costCentavos,
            product: before.product.name,
            quantity: before.quantity,
          },
        },
      });

      revalidatePath("/catalogue");
      revalidatePath("/alerts");
      revalidatePath("/");
      return { status: "done" as const, message: "Batch updated." };
    });
  } catch {
    return { status: "error", message: "Couldn't update that batch. Try again." };
  }
}
