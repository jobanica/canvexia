import "server-only";
import type { Prisma } from "@prisma/client";
import { pharmacyDb, systemDb } from "@/server/tenancy/scoped-db";
import { readingTotals, expectedCash, overShort, type ReadingSale } from "@/lib/pharmacy/reading";

/**
 * SHIFTS AND READINGS.
 *
 * A till that cannot be closed off is a till nobody can reconcile. Until this
 * existed a pharmacy could ring up sales all day with no record of who was on
 * the register, what cash it opened with, or whether the drawer was over or
 * short at the end of it — and no Z-reading, which a registered POS is required
 * to produce.
 *
 * ONE OPEN SHIFT PER PHARMACY. This is a counter, not a chain of tills; two
 * open shifts means two drawers being reconciled against the same sales.
 */

export interface ShiftRow {
  id: string;
  status: string;
  staffName: string | null;
  openedAt: Date;
  closedAt: Date | null;
  openingCashCentavos: number;
  closingCashCentavos: number | null;
  salesCount: number | null;
  netCentavos: number | null;
  expectedCashCentavos: number | null;
  overShortCentavos: number | null;
  notes: string | null;
}

export async function currentShift(pharmacyId: string) {
  return pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacyShift.findFirst({
      where: { status: "open" },
      orderBy: { openedAt: "desc" },
      select: {
        id: true,
        staffId: true,
        openedAt: true,
        openingCashCentavos: true,
        notes: true,
      },
    }),
  );
}

export async function listShifts(pharmacyId: string, take = 50): Promise<ShiftRow[]> {
  const [rows, staff] = await Promise.all([
    pharmacyDb(pharmacyId, (tx) =>
      tx.pharmacyShift.findMany({
        orderBy: { openedAt: "desc" },
        take,
        select: {
          id: true,
          status: true,
          staffId: true,
          openedAt: true,
          closedAt: true,
          openingCashCentavos: true,
          closingCashCentavos: true,
          salesCount: true,
          netCentavos: true,
          expectedCashCentavos: true,
          overShortCentavos: true,
          notes: true,
        },
      }),
    ),
    pharmacyDb(pharmacyId, (tx) =>
      tx.pharmacyStaff.findMany({ select: { id: true, displayName: true, email: true } }),
    ),
  ]);

  const nameOf = new Map(staff.map((s) => [s.id, s.displayName ?? s.email]));
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    staffName: r.staffId ? (nameOf.get(r.staffId) ?? null) : null,
    openedAt: r.openedAt,
    closedAt: r.closedAt,
    openingCashCentavos: r.openingCashCentavos,
    closingCashCentavos: r.closingCashCentavos,
    salesCount: r.salesCount,
    netCentavos: r.netCentavos,
    expectedCashCentavos: r.expectedCashCentavos,
    overShortCentavos: r.overShortCentavos,
    notes: r.notes,
  }));
}

export async function openShift(input: {
  pharmacyId: string;
  staffId: string;
  openingCashCentavos: number;
  notes: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    return await systemDb(async (tx) => {
      const open = await tx.pharmacyShift.findFirst({
        where: { pharmacyId: input.pharmacyId, status: "open" },
        select: { id: true },
      });
      // Two open shifts means two drawers reconciled against the same sales.
      if (open) return { ok: false as const, error: "A shift is already open. Close it first." };

      const shift = await tx.pharmacyShift.create({
        data: {
          pharmacyId: input.pharmacyId,
          staffId: input.staffId,
          openingCashCentavos: input.openingCashCentavos,
          notes: input.notes,
        },
        select: { id: true },
      });
      await audit(tx, input.staffId, "pharmacy.shift_opened", shift.id, {
        openingCashCentavos: input.openingCashCentavos,
      });
      return { ok: true as const, id: shift.id };
    });
  } catch {
    return { ok: false, error: "Couldn't open a shift. Try again." };
  }
}

/**
 * The sales a reading covers.
 *
 * BY SHIFT WHERE THERE IS ONE, by time window otherwise. A pharmacy that has
 * not adopted shifts still has to be able to take a Z at the end of the day,
 * and refusing to produce one because nobody pressed Open Shift this morning is
 * the sort of purity that gets a system replaced by a notebook.
 */
async function salesFor(
  pharmacyId: string,
  where: Prisma.PharmacySaleWhereInput,
): Promise<ReadingSale[]> {
  return pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacySale.findMany({
      where,
      select: {
        subtotalCentavos: true,
        discountCentavos: true,
        totalCentavos: true,
        vatExemptCentavos: true,
        paymentMethod: true,
        status: true,
        receiptNumber: true,
      },
    }),
  );
}

/** An X-reading: the same summary, taken without closing anything off. */
export async function takeXReading(input: {
  pharmacyId: string;
  staffId: string;
  from: Date;
  to: Date;
  shiftId?: string | null;
}) {
  const [sales, pharmacy] = await Promise.all([
    salesFor(input.pharmacyId, {
      ...(input.shiftId
        ? { shiftId: input.shiftId }
        : { createdAt: { gte: input.from, lt: input.to } }),
    }),
    pharmacyDb(input.pharmacyId, (tx) =>
      tx.pharmacy.findFirst({ where: { id: input.pharmacyId }, select: { vatRatePct: true } }),
    ),
  ]);
  return {
    totals: readingTotals(sales, pharmacy?.vatRatePct ?? 0),
    from: input.from,
    to: input.to,
  };
}

/**
 * Close the shift and cut a Z-reading.
 *
 * ONE TRANSACTION, and the Z number comes off the pharmacy's counter — not from
 * counting readings, because "sequential and non-resettable" is exactly the
 * property being claimed and a count would reissue a number if a row were ever
 * removed.
 *
 * The reconciliation is SNAPSHOTTED onto the shift. What the drawer was counted
 * at is a fact about that evening; a figure recomputed next week, after a sale
 * was voided, is not a reconciliation.
 */
export async function closeShift(input: {
  pharmacyId: string;
  shiftId: string;
  countedCashCentavos: number;
  notes: string | null;
  staffId: string;
}): Promise<
  | {
      ok: true;
      zCounter: number;
      expectedCashCentavos: number;
      overShortCentavos: number;
      netCentavos: number;
    }
  | { ok: false; error: string }
> {
  try {
    return await systemDb(async (tx) => {
      const shift = await tx.pharmacyShift.findFirst({
        where: { id: input.shiftId, pharmacyId: input.pharmacyId },
        select: { id: true, status: true, openedAt: true, openingCashCentavos: true },
      });
      if (!shift) return { ok: false as const, error: "That shift was not found." };
      if (shift.status === "closed") {
        return { ok: false as const, error: "That shift is already closed." };
      }

      const pharmacy = await tx.pharmacy.findUnique({
        where: { id: input.pharmacyId },
        select: { vatRatePct: true },
      });

      const sales = await tx.pharmacySale.findMany({
        where: { pharmacyId: input.pharmacyId, shiftId: shift.id },
        select: {
          subtotalCentavos: true,
          discountCentavos: true,
          totalCentavos: true,
          vatExemptCentavos: true,
          paymentMethod: true,
          status: true,
          receiptNumber: true,
        },
      });

      const totals = readingTotals(sales, pharmacy?.vatRatePct ?? 0);
      const expected = expectedCash(shift.openingCashCentavos, totals.cashCentavos);
      const diff = overShort(input.countedCashCentavos, expected);

      const bumped = await tx.pharmacy.update({
        where: { id: input.pharmacyId },
        data: { nextZNo: { increment: 1 } },
        select: { nextZNo: true },
      });
      const zCounter = bumped.nextZNo - 1;

      const closedAt = new Date();

      await tx.pharmacyReading.create({
        data: {
          pharmacyId: input.pharmacyId,
          type: "z",
          zCounter,
          shiftId: shift.id,
          staffId: input.staffId,
          openedAt: shift.openedAt,
          closedAt,
          openingCashCentavos: shift.openingCashCentavos,
          ...totals,
        },
      });

      await tx.pharmacyShift.update({
        where: { id: shift.id },
        data: {
          status: "closed",
          closedAt,
          closingCashCentavos: input.countedCashCentavos,
          notes: input.notes ?? undefined,
          salesCount: totals.salesCount,
          grossCentavos: totals.grossCentavos,
          discountCentavos: totals.discountCentavos,
          netCentavos: totals.netCentavos,
          cashCollectedCentavos: totals.cashCentavos,
          expectedCashCentavos: expected,
          overShortCentavos: diff,
        },
      });

      await audit(tx, input.staffId, "pharmacy.shift_closed", shift.id, {
        zCounter,
        netCentavos: totals.netCentavos,
        overShortCentavos: diff,
      });

      return {
        ok: true as const,
        zCounter,
        expectedCashCentavos: expected,
        overShortCentavos: diff,
        netCentavos: totals.netCentavos,
      };
    });
  } catch {
    return { ok: false, error: "Couldn't close that shift. Try again." };
  }
}

export async function listReadings(pharmacyId: string, take = 60) {
  return pharmacyDb(pharmacyId, (tx) =>
    tx.pharmacyReading.findMany({
      where: { type: "z" },
      orderBy: { zCounter: "desc" },
      take,
      select: {
        id: true,
        zCounter: true,
        openedAt: true,
        closedAt: true,
        salesCount: true,
        voidedCount: true,
        grossCentavos: true,
        discountCentavos: true,
        netCentavos: true,
        vatableCentavos: true,
        vatCentavos: true,
        vatExemptCentavos: true,
        cashCentavos: true,
        cardCentavos: true,
        gcashCentavos: true,
        mayaCentavos: true,
        otherCentavos: true,
        firstReceiptNumber: true,
        lastReceiptNumber: true,
      },
    }),
  );
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
      entityType: "pharmacy_shift",
      entityId,
      after: after as Prisma.InputJsonValue,
    },
  });
}
