import { z } from "zod";

/**
 * A purchase order, and a receipt against one.
 *
 * In `lib/` so the shape and the status arithmetic can be tested without a
 * session — and because a `"use server"` module may only export async
 * functions.
 */

const Quantity = z.coerce
  .number({ message: "Enter a quantity." })
  .int("Quantities come in whole units.")
  .positive("A line needs at least one unit.");

/**
 * Pesos in the form, centavos in the database.
 *
 * REFUSES BLANK rather than coercing it to zero. `z.coerce.number()` turns ""
 * into 0, which would silently record a delivery as free — and a zero cost is
 * a 100% margin on every future sale of that batch.
 */
const Price = z
  .string()
  .trim()
  .min(1, "Enter a unit cost.")
  .transform((v, ctx) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) {
      ctx.addIssue({ code: "custom", message: "That cost doesn't look right." });
      return z.NEVER;
    }
    return Math.round(n * 100);
  });

export const PoLine = z.object({
  productId: z.string().uuid("Pick a product from the catalogue."),
  quantityOrdered: Quantity,
  unitCostCentavos: Price,
});

export const PoInput = z.object({
  supplierId: z.string().uuid().nullable().default(null),
  expectedDate: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null),
  notes: z
    .string()
    .trim()
    .max(2000)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .default(null),
  lines: z.array(PoLine).min(1, "A purchase order needs at least one line."),
});

export type PoInputValues = z.infer<typeof PoInput>;
export type PoLineValues = z.infer<typeof PoLine>;

/**
 * What state a PO is in, given what has arrived.
 *
 * DERIVED, NEVER TYPED. A status somebody sets by hand disagrees with the lines
 * the first time a delivery is short — and it is the lines that are true. The
 * one status this does not decide is `cancelled`, which is a decision rather
 * than an observation.
 */
export function poStatusFor(
  lines: { quantityOrdered: number; quantityReceived: number }[],
  wasSent: boolean,
): "draft" | "sent" | "partial" | "received" {
  const received = lines.reduce((t, l) => t + l.quantityReceived, 0);
  if (received === 0) return wasSent ? "sent" : "draft";
  // Over-delivery is still complete: a supplier who sends 110 of 100 has not
  // left the order outstanding, and marking it `partial` forever is worse than
  // recording what arrived.
  const complete = lines.every((l) => l.quantityReceived >= l.quantityOrdered);
  return complete ? "received" : "partial";
}

/** What is still owed on a line. Never negative — an over-delivery owes nothing. */
export function outstanding(line: { quantityOrdered: number; quantityReceived: number }): number {
  return Math.max(0, line.quantityOrdered - line.quantityReceived);
}
