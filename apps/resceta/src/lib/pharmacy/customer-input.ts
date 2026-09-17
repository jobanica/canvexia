import { z } from "zod";

/**
 * A customer record, and a points adjustment.
 *
 * In `lib/` because a `"use server"` module may only export async functions —
 * and because the points arithmetic below is the sort of thing that should be
 * tested without a database.
 */

const optional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null);

export const CustomerInput = z.object({
  name: z.string().trim().min(1, "A customer needs a name.").max(200),
  phone: optional(40),
  email: optional(200),
  address: optional(400),
  notes: optional(2000),
});

export type CustomerInputValues = z.infer<typeof CustomerInput>;

/**
 * A manual points correction.
 *
 * `points` is SIGNED and may not be zero — a zero adjustment is a ledger row
 * that says nothing, and the reason is mandatory because an unexplained
 * balance change is exactly what this ledger exists to prevent.
 */
export const PointsAdjustment = z.object({
  points: z.coerce
    .number()
    .int("Points come in whole numbers.")
    .refine((n) => n !== 0, "Enter a number of points to add or take away."),
  note: z.string().trim().min(1, "Say why this adjustment was made.").max(500),
});

/**
 * Points earned on a sale.
 *
 * ROUNDED DOWN, and on the amount actually paid. Rounding up hands out points
 * nobody paid for, at the scale of every transaction; and earning on the
 * pre-discount subtotal means a senior citizen's statutory discount also earns
 * them points the pharmacy did not receive money for.
 */
export function pointsEarned(paidCentavos: number, pointsPerPeso: number): number {
  if (pointsPerPeso <= 0 || paidCentavos <= 0) return 0;
  return Math.floor((paidCentavos / 100) * pointsPerPeso);
}

/**
 * What a number of points is worth, and what can actually be redeemed.
 *
 * CAPPED AT THE BALANCE AND AT THE BILL. Redeeming more than the bill would
 * produce a negative total — a till that hands out cash — and redeeming more
 * than the balance is a customer spending points they do not have. Returning
 * the capped figure rather than refusing means the counter can offer "use all
 * your points" without the cashier doing arithmetic.
 */
export function redeemable(
  requestedPoints: number,
  balance: number,
  billCentavos: number,
  centavosPerPoint: number,
): { points: number; centavos: number } {
  if (centavosPerPoint <= 0 || requestedPoints <= 0 || balance <= 0 || billCentavos <= 0) {
    return { points: 0, centavos: 0 };
  }
  const affordable = Math.min(requestedPoints, balance);
  const maxPointsForBill = Math.floor(billCentavos / centavosPerPoint);
  const points = Math.min(affordable, maxPointsForBill);
  return { points, centavos: points * centavosPerPoint };
}
