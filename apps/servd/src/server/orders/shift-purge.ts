import "server-only";

import { systemDb } from "@/server/tenancy/scoped-db";
import { shiftRetentionCutoff, SHIFT_RETENTION_HOURS } from "@/lib/orders/shift-retention";

/**
 * Drop shift records past their keep-by.
 *
 * THIS TOUCHES EXACTLY ONE TABLE: cashier_shifts. It does not delete orders,
 * payments, cash movements, or anything else the money is made of — those are
 * the accounting record and stay put. Read the note in lib/orders/shift-retention
 * before widening this by so much as one more table.
 *
 * Two guards, both there because this is a delete:
 *
 *   - CLOSED ONLY. An open shift is somebody's live till. A cashier who has
 *     been on for two days is a bug in the shift-window rules, not a licence to
 *     delete the record of the money they're holding.
 *   - Payments keep their shiftId. The column is a plain string with no foreign
 *     key, so nothing cascades; the stamp is simply left pointing at a shift
 *     that no longer exists, which reads as "not attributable to a shift I can
 *     still show you" — exactly what it is once the log is gone.
 *
 * Runs from the nightly cron, so a shift lives somewhere between 48 and 72
 * hours depending on when the job lands. Erring long is the right way round:
 * deleting early costs an owner a review they wanted, deleting late costs
 * nothing at all.
 */
export async function purgeOldShifts(): Promise<{ deleted: number; olderThanHours: number }> {
  try {
    const res = await systemDb((tx) =>
      tx.cashierShift.deleteMany({
        where: { status: "closed", openedAt: { lt: shiftRetentionCutoff() } },
      }),
    );
    return { deleted: res.count, olderThanHours: SHIFT_RETENTION_HOURS };
  } catch {
    // Table not migrated, or the delete was refused. Nothing to clean up is a
    // fine outcome; a failed housekeeping job must never break the cron run.
    return { deleted: 0, olderThanHours: SHIFT_RETENTION_HOURS };
  }
}
